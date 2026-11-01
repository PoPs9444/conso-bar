import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentRun, CardKey, Day, Limit, Snapshot, UpdateState } from '../types'

import { agentsCard } from './agents'

import { contextCard, heat, historyCard, limitCards, updateCard } from './dashboard'
import { costOf } from './pricing'

const PANE = 'conso'

// Version of this code: keep equal to `version` in .claude-plugin/plugin.json
export const VERSION = '0.19.1'
const REPO = 'PoPs9444/conso-bar'
const MARKETPLACE = 'conso-bar'

const snapshot = atom({ plugin: 'conso-bar', key: 'snapshot' } as const, null)
const isCompacting = atom({ plugin: 'conso-bar', key: 'isCompacting' } as const, false)
const agents = atom({ plugin: 'conso-bar', key: 'agentRuns' } as const, [])
const tick = atom({ plugin: 'conso-bar', key: 'tick' } as const, 0)
const history = atom({ plugin: 'conso-bar', key: 'history' } as const, [])
const DEFAULT_ORDER: CardKey[] = ['limits', 'context', 'history', 'agents']
const order = atom({ plugin: 'conso-bar', key: 'order' } as const, DEFAULT_ORDER)
const isCustomizing = atom({ plugin: 'conso-bar', key: 'isCustomizing' } as const, false)
const updateState = atom({ plugin: 'conso-bar', key: 'update' } as const, { status: 'idle' } as UpdateState)

// Green to red as the percentage rises
const levelColor = (p: number) => heat(p)

const SEGMENTS = 10
const bar = (p: number) => {
  const n = p <= 0 ? 0 : Math.max(1, Math.min(SEGMENTS, Math.round((p * SEGMENTS) / 100)))
  return { on: '━'.repeat(n), off: '━'.repeat(SEGMENTS - n) }
}

const left = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const d = Math.max(0, (Date.parse(resetsAt) - now) / 1000)
  if (d >= 86400) return `${Math.floor(d / 86400)}d ${Math.floor((d % 86400) / 3600)}h`
  if (d >= 3600) return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`
  return `${Math.floor(d / 60)}m`
}

const num = (n: number, digits: number) => n.toFixed(digits)

const tokens = (n: number) =>
  n >= 1_000_000 ? `${num(n / 1_000_000, n % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`

const save = async ($: EngineInterface, s: Snapshot) => {
  await update($, snapshot, () => s)
}

// ---- Memory across sessions ($.store): last limits reading and cost per day

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The last 7 days, today last, empty days at 0
const lastWeek = (days: Record<string, number>, now: number): Day[] =>
  Array.from({ length: 7 }, (_, i) => {
    const date = dayKey(now - (6 - i) * 86_400_000)
    return { date, usd: days[date] ?? 0 }
  })

const remember = async ($: EngineInterface, s: Snapshot) => {
  const now = await $.clock.now()
  if (s.limits.length > 0) await $.store.set('lastLimits', { limits: s.limits, at: s.limitsAt ?? now })

  if (s.usd === undefined) return
  const sid = await $.session.id()
  const seen = ((await $.store.get('costSeen')) ?? {}) as Record<string, number>
  const days = ((await $.store.get('costDays')) ?? {}) as Record<string, number>
  const delta = s.usd - (seen[sid] ?? 0)
  if (delta !== 0) {
    // A cost that goes down (the session restarted from zero) re-bases without adding anything
    if (delta > 0) days[dayKey(now)] = (days[dayKey(now)] ?? 0) + delta
    seen[sid] = s.usd
    const keepDays = Object.fromEntries(Object.entries(days).sort().slice(-30))
    const keepSeen = Object.fromEntries(Object.entries(seen).slice(-50))
    await $.store.set('costDays', keepDays)
    await $.store.set('costSeen', keepSeen)
  }
  await update($, history, () => lastWeek(days, now))
}

let ticker: { cancel: () => void } | undefined

const patch = async ($: EngineInterface, id: string, fn: (a: AgentRun) => AgentRun) => {
  await update($, agents, list => list.map(a => (a.id === id ? fn(a) : a)))
}

// A one-second clock while an agent runs, for the displayed duration
const syncTicker = async ($: EngineInterface) => {
  const live = (await read($, agents)).some(a => a.status === 'running')
  if (live && !ticker) {
    ticker = $.clock.every(1000, () => void update($, tick, n => n + 1))
  } else if (!live && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

// A window past its reset goes back to 0%, even without a new reading
const fresh = (limits: readonly Limit[], now: number): Limit[] =>
  limits.map(l => (l.resetsAt && Date.parse(l.resetsAt) <= now ? { kind: l.kind, percentUsed: 0 } : l))

type LastLimits = { limits: Limit[]; at: number }

// Every minute: the last limits reading (another session may have a newer one)
// and the cost history, without waiting for a message
const syncFromStore = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const last = (await $.store.get('lastLimits')) as LastLimits | undefined
  const s = await read($, snapshot)
  if (s) {
    const newer = last && last.at > (s.limitsAt ?? 0)
    const limits = fresh(newer ? last.limits : s.limits, now)
    await update($, snapshot, cur => (cur ? { ...cur, limits, limitsAt: newer ? last.at : cur.limitsAt } : cur))
  }
  const days = ((await $.store.get('costDays')) ?? {}) as Record<string, number>
  await update($, history, () => lastWeek(days, now))
}

let poller: { cancel: () => void } | undefined
let updatePoller: { cancel: () => void } | undefined

// ---- Updates from GitHub

// 0.17.4 < 0.18.0: compared number by number
const isNewer = (a: string, b: string) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

// Reads the version published on GitHub; silent without network
const checkUpdate = async ($: EngineInterface) => {
  const r = await $.http.fetch(`https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`)
  if (!r.ok) return
  const latest = String((JSON.parse(r.text) as { version?: unknown }).version ?? '')
  if (!/^\d+(\.\d+)*$/.test(latest)) return
  await update($, updateState, cur => (cur.status === 'idle' || cur.status === 'error' ? { ...cur, latest } : cur))
}

// Claude Code's two official commands: refresh the marketplace, then the plugin
const runUpdate = async ($: EngineInterface) => {
  const cur = await read($, updateState)
  if (cur.status === 'running') return
  await update($, updateState, (u): UpdateState => ({ ...u, status: 'running' }))
  try {
    for (const argv of [
      ['claude', 'plugin', 'marketplace', 'update', MARKETPLACE],
      ['claude', 'plugin', 'update', `conso-bar@${MARKETPLACE}`],
    ]) {
      const r = await $.process.run(argv, { timeoutMs: 180_000 })
      if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop() || `code ${r.exitCode}`)
    }
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'done' }))
    $.ui.toast('Conso updated: restart Claude Code to apply it')
  } catch (err) {
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'error' }))
    $.ui.toast(`Update failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ---- Card order, kept across sessions

const CARD_NAMES: Record<CardKey, string> = {
  limits: 'Limits',
  context: 'Context',
  history: 'History',
  agents: 'Agents',
}

// A stored order missing a card (an older version) gets it back at the end
const normalizeOrder = (stored: unknown): CardKey[] => {
  const known = Array.isArray(stored) ? stored.filter((k): k is CardKey => k in CARD_NAMES) : []
  const unique = [...new Set(known)]
  return [...unique, ...DEFAULT_ORDER.filter(k => !unique.includes(k))]
}

const moveCard = async ($: EngineInterface, key: CardKey, by: -1 | 1) => {
  const next = await update($, order, list => {
    const i = list.indexOf(key)
    const j = i + by
    if (i < 0 || j < 0 || j >= list.length) return list
    const copy = [...list]
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    return copy
  })
  await $.store.set('cardOrder', next)
}

// Update banner: only when GitHub has a newer version
const updateBanner = (u: UpdateState) =>
  u.latest && isNewer(u.latest, VERSION) ? updateCard(u.latest, u.status) : null

const toSnapshot = (u: {
  cost?: { usd: number }
  rateLimits: Limit[]
  context: { tokens?: number; window: number }
}): Snapshot => ({
  usd: u.cost?.usd,
  limits: u.rateLimits,
  tokens: u.context.tokens,
  window: u.context.window,
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'conso', description: 'Show the Conso panel' })
    if (e.surface !== 'terminal') void $.ui.open({ id: PANE, title: 'Conso' })
    const now = await $.clock.now()
    let first = toSnapshot(await $.session.usage())
    if (first.limits.length > 0) {
      first = { ...first, limitsAt: now }
    } else {
      // No reply yet in this session: show the last known reading
      const last = (await $.store.get('lastLimits').catch(() => undefined)) as LastLimits | undefined
      if (last) first = { ...first, limits: fresh(last.limits, now), limitsAt: last.at }
    }
    await save($, first)
    await remember($, first).catch(() => undefined)
    const storedOrder = await $.store.get('cardOrder').catch(() => undefined)
    await update($, order, () => normalizeOrder(storedOrder))
    poller?.cancel()
    poller = $.clock.every(60_000, () => void syncFromStore($).catch(() => undefined))
    // A new version on GitHub? At start, then every 6 hours
    void checkUpdate($).catch(() => undefined)
    updatePoller?.cancel()
    updatePoller = $.clock.every(6 * 3_600_000, () => void checkUpdate($).catch(() => undefined))
    return r
  })

  on('command.run', { command: 'conso' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Conso' })
    return { text: 'Conso panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const s = await read($, snapshot)
    if (s === null || !('Svg' in els)) {
      return <els.Text dimColor>Waiting for the first reply…</els.Text>
    }

    const limits = limitCards(s, await $.clock.now())
    const upd = await read($, updateState)
    const banner = updateBanner(upd)
    const hist = historyCard(await read($, history))
    const ctx = contextCard(s)
    const busy = await read($, isCompacting)
    await read($, tick)
    const ag = agentsCard(await read($, agents), await $.clock.now())

    const compact = async () => {
      if (await read($, isCompacting)) return
      await update($, isCompacting, () => true)
      try {
        const r = await $.session.compact()
        if (r.skip !== undefined) $.ui.toast(`Compaction skipped: ${r.skip}`)
        else $.ui.toast('Context compacted')
        const after = toSnapshot(await $.session.usage())
        await save($, after.limits.length > 0 ? { ...after, limitsAt: await $.clock.now() } : { ...after, limits: s.limits, limitsAt: s.limitsAt })
      } finally {
        await update($, isCompacting, () => false)
      }
    }

    // Clear frees the room taken by finished agents
    const clearFinished = () => update($, agents, list => list.filter(a => a.status === 'running'))

    // Clean stop: no more tools or requests for this agent, it hands back at its
    // next step (a tool already running finishes)
    const stop = (id: string) => () => patch($, id, a => (a.status === 'running' ? { ...a, isStopping: true } : a))

    // Every card: the same app frame, which follows the panel's width
    const frame = (key: string, children: RenderChildren) => (
      <els.Box
        key={key}
        flexDirection="column"
        gap={1}
        paddingX={2}
        paddingY={1}
        borderStyle="round"
        borderColor="rgba(255,255,255,0.09)"
        backgroundColor="rgba(255,255,255,0.035)"
      >
        {children}
      </els.Box>
    )

    const blocks: Record<CardKey, RenderChildren> = {
      limits: limits.length > 0 ? limits.map(c => frame(c.key, <els.Svg source={c.svg} alt={c.alt} height={c.h} />)) : null,
      context: ctx
        ? frame('ctx', [
            <els.Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center">
              <els.Svg source={ctx.title} alt="Context" width={80} height={14} />
              <els.Button key="compact" plain dimColor onPress={compact}>
                {busy ? 'Compact…' : 'Compact'}
              </els.Button>
            </els.Box>,
            <els.Svg key="body" source={ctx.svg} alt={ctx.alt} height={ctx.h} />,
          ])
        : null,
      history: hist ? frame('hist', <els.Svg source={hist.svg} alt={hist.alt} height={hist.h} />) : null,
      agents: frame('agents', [
        <els.Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center">
          <els.Svg source={ag.head} alt="Agents" width={150} height={14} />
          {ag.finished > 0 ? (
            <els.Button key="clear" plain dimColor onPress={clearFinished}>
              Clear
            </els.Button>
          ) : null}
        </els.Box>,
        ag.rows.length === 0 ? <els.Svg key="empty" source={ag.empty} alt="No agents" height={ag.emptyH} /> : null,
        ...ag.rows.map(r => (
          <els.Box key={r.id} flexDirection="column">
            <els.Svg source={r.top.svg} alt={r.alt} height={r.top.h} />
            <els.Box flexDirection="row" alignItems="center">
              <els.Box flexGrow={1} flexShrink={1} minWidth={0}>
                <els.Svg source={r.mid.svg} alt={r.mid.alt} height={r.mid.h} />
              </els.Box>
              {r.canStop ? (
                <els.Button key={`stop-${r.id}`} plain dimColor onPress={stop(r.id)}>
                  Stop
                </els.Button>
              ) : null}
            </els.Box>
            <els.Svg source={r.bottom.svg} alt={r.bottom.alt} height={r.bottom.h} />
          </els.Box>
        )),
      ]),
    }

    // Customize: each block gets a header with its name and ↑ ↓ to move it
    const cardOrder = await read($, order)
    const customizing = await read($, isCustomizing)
    const placed = cardOrder.map((key, i) => {
      if (!customizing) return <els.Box key={`block-${key}`} flexDirection="column" gap={1}>{blocks[key]}</els.Box>
      return (
        <els.Box key={`block-${key}`} flexDirection="column" gap={1}>
          <els.Box flexDirection="row" alignItems="center" gap={1}>
            <els.Box flexGrow={1}>
              <els.Text dimColor>{CARD_NAMES[key]}</els.Text>
            </els.Box>
            {i > 0 ? (
              <els.Button key={`up-${key}`} plain dimColor onPress={() => moveCard($, key, -1)}>
                ↑
              </els.Button>
            ) : null}
            {i < cardOrder.length - 1 ? (
              <els.Button key={`down-${key}`} plain dimColor onPress={() => moveCard($, key, 1)}>
                ↓
              </els.Button>
            ) : null}
          </els.Box>
          {blocks[key] ?? <els.Text dimColor>Nothing to show yet</els.Text>}
        </els.Box>
      )
    })

    const toggle = (
      <els.Box key="customize-row" flexDirection="row" justifyContent="flex-end">
        <els.Button key="customize" plain dimColor onPress={() => update($, isCustomizing, v => !v)}>
          {customizing ? 'Done' : 'Customize'}
        </els.Button>
      </els.Box>
    )

    // Every drawing has a fixed height: the panel redraws on each scroll and
    // every second while an agent runs; without a height a drawing collapses
    // for an instant and throws the scroll back to the top
    return (
      <els.Box flexDirection="column" gap={1}>
        {banner
          ? frame('update', (
              <els.Box flexDirection="row" alignItems="center">
                <els.Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <els.Svg source={banner.svg} alt={banner.alt} height={banner.h} />
                </els.Box>
                {upd.status === 'idle' || upd.status === 'error' ? (
                  <els.Button key="update" plain dimColor onPress={() => runUpdate($)}>
                    Update
                  </els.Button>
                ) : null}
              </els.Box>
            ))
          : null}
        {/* While customizing, Done sits at the top, in reach right away */}
        {customizing ? toggle : null}
        {placed}
        {customizing ? null : toggle}
      </els.Box>
    )
  })

  // Live agents
  // An agent's launch and its first step arrive in either order: every write
  // merges into the list in one pass, never a duplicate
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.model !== undefined) {
      const now = await $.clock.now()
      const run: AgentRun = {
        id: r.agentId ?? e.tool_use_id,
        isLinked: r.agentId !== undefined,
        prompt: e.prompt.slice(0, 200),
        usd: 0,
        description: e.description,
        type: e.subagentType,
        model: r.model,
        status: 'running',
        startedAt: now,
        steps: 0,
        outputTokens: 0,
      }
      await update($, agents, list => {
        const seen = list.find(a => a.id === run.id)
        // Already seen through its first step: just give it its name
        if (seen) return list.map(a => (a === seen ? { ...a, description: run.description, type: run.type, prompt: run.prompt } : a))
        return [...list, run].slice(-50)
      })
      await syncTicker($)
    }
    return r
  })

  // An agent starts with its prompt: that is what links it to its launch, even
  // when several agents of the same model start together
  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const head = e.text.slice(0, 200)
      await update($, agents, list => {
        if (list.some(a => a.id === id)) return list
        const spawn = list.find(a => !a.isLinked && a.status === 'running' && a.prompt === head)
        return spawn ? list.map(a => (a === spawn ? { ...a, id, isLinked: true } : a)) : list
      })
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)
    const now = await $.clock.now()
    // Unknown id here (launches are linked by their prompt at turn.start): an
    // agent the engine lists, otherwise an internal engine task (compaction,
    // memory) that does not belong in the card
    const list0 = await read($, agents)
    const known = list0.some(a => a.id === id)
    const info = known ? undefined : (await $.agent.list().catch(() => [])).find(a => a.id === id)
    if (!known && !info) return yield* next(e)
    await update($, agents, list => {
      if (list.some(a => a.id === id)) return list
      // Known to the engine but not linked by its prompt: take a pending launch
      // of the same model
      const pending = list.filter(a => !a.isLinked && a.status === 'running')
      const spawn = pending.find(a => a.model === e.model) ?? pending[0]
      if (spawn) return list.map(a => (a === spawn ? { ...a, id, isLinked: true } : a))
      const run: AgentRun = {
        id,
        isLinked: true,
        usd: 0,
        description: info?.description || info?.name || '',
        type: info?.type || 'Agent',
        model: e.model,
        status: 'running',
        startedAt: now,
        steps: 0,
        outputTokens: 0,
      }
      return [...list, run].slice(-50)
    })
    await syncTicker($)
    // Stop requested: no new request, the agent hands back cleanly
    if ((await read($, agents)).find(a => a.id === id)?.isStopping) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: 'Stopped from the Conso panel.',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: null,
      }
    }
    await patch($, id, a => ({ ...a, model: e.model, effort: e.effort ?? a.effort, steps: a.steps + 1 }))
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      const usd = costOf(u.model || e.model, u)
      await patch($, id, a => ({ ...a, outputTokens: a.outputTokens + u.output_tokens, usd: a.usd + usd }))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      if ((await read($, agents)).find(a => a.id === id)?.isStopping) {
        return { deny: 'Stopped by the user from the Conso panel: finish now, without any further action.' }
      }
      await patch($, id, a => ({ ...a, lastTool: e.tool }))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      const now = await $.clock.now()
      const status: AgentRun['status'] =
        e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'aborted' : 'failed'
      await patch($, id, a => ({
        ...a,
        status: a.isStopping ? 'aborted' : status,
        isStopping: false,
        endedAt: now,
        lastTool: undefined,
      }))
      await syncTicker($)
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    const prev = await read($, snapshot)
    const measured = toSnapshot(e)
    const s =
      measured.limits.length > 0
        ? { ...measured, limitsAt: now }
        : { ...measured, limits: prev?.limits ?? [], limitsAt: prev?.limitsAt }
    await save($, s)
    await remember($, s).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || s === null || e.surface !== 'terminal') return next(e)

    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    // One segment per figure, separated by a space
    const chip = (key: string, children: RenderChildren[]) => (
      <Box key={key} flexDirection="row" gap={1} marginRight={2}>
        {children}
      </Box>
    )

    const label = (text: string) => (
      <Text key="label" dimColor>
        {text}
      </Text>
    )

    const meter = (p: number, color: string) => {
      const b = bar(p)
      return (
        <Text key="meter">
          <Text color={color}>{b.on}</Text>
          <Text color="subtle">{b.off}</Text>
        </Text>
      )
    }

    const limit = (key: string, name: string, l: Limit | undefined) => {
      if (!l) return null
      const p = l.percentUsed
      const color = levelColor(p)
      const reset = left(l.resetsAt, now)
      return chip(key, [
        label(name),
        meter(p, color),
        <Text key="pct" bold color={color}>
          {Math.round(p)}%
        </Text>,
        reset ? (
          <Text key="reset" dimColor>
            ↻ {reset}
          </Text>
        ) : null,
      ])
    }

    const ctxPct = s.tokens !== undefined && s.window > 0 ? (s.tokens / s.window) * 100 : undefined

    const parts = [
      s.usd !== undefined
        ? chip('cost', [
            label('Session'),
            <Text key="usd" bold>
              ${s.usd.toFixed(2)}
            </Text>,
          ])
        : null,
      limit('h5', '5h', s.limits.find(l => l.kind === 'five_hour')),
      limit('w7', 'Week', s.limits.find(l => l.kind === 'seven_day')),
      s.tokens !== undefined && ctxPct !== undefined
        ? chip('ctx', [
            label('Context'),
            meter(ctxPct, levelColor(ctxPct)),
            <Text key="tok">
              <Text bold color="suggestion">
                {tokens(s.tokens)}
              </Text>
              <Text dimColor> / {tokens(s.window)}</Text>
            </Text>,
          ])
        : null,
    ].filter(x => x !== null)

    if (parts.length === 0) return next(e)

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={0}>
        {parts}
      </Box>
    )
  })
}
