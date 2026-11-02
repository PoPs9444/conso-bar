import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentRun, CardKey, Day, Lang, Limit, Snapshot, SystemStats, UpdateState } from '../types'

import { agentsCard } from './agents'

import { HEX, contextCard, footerLine, heat, historyCard, left, limitCards, systemCard, updateCard } from './dashboard'
import { STRINGS, toLang } from './i18n'
import type { Strings } from './i18n'
import { costOf } from './pricing'
import { LINUX, MAC, WINDOWS, parseLinux, parseMac, parseWindows } from './system'
import type { Platform } from './system'

const PANE = 'conso'

// Version of this code: keep equal to `version` in .claude-plugin/plugin.json
export const VERSION = '0.23.0'
const REPO = 'PoPs9444/conso-bar'
const MARKETPLACE = 'conso-bar'

const snapshot = atom({ plugin: 'conso-bar', key: 'snapshot' } as const, null)
const isCompacting = atom({ plugin: 'conso-bar', key: 'isCompacting' } as const, false)
const agents = atom({ plugin: 'conso-bar', key: 'agentRuns' } as const, [])
const tick = atom({ plugin: 'conso-bar', key: 'tick' } as const, 0)
const history = atom({ plugin: 'conso-bar', key: 'history' } as const, [])
const DEFAULT_ORDER: CardKey[] = ['limits', 'context', 'system', 'history', 'agents']
const order = atom({ plugin: 'conso-bar', key: 'order' } as const, DEFAULT_ORDER)
const isCustomizing = atom({ plugin: 'conso-bar', key: 'isCustomizing' } as const, false)
const updateState = atom({ plugin: 'conso-bar', key: 'update' } as const, { status: 'idle' } as UpdateState)
const lang = atom({ plugin: 'conso-bar', key: 'lang' } as const, 'en' as Lang)
const system = atom({ plugin: 'conso-bar', key: 'system' } as const, null as SystemStats | null)

// The words in the language Claude Code is set to
const words = async ($: EngineInterface): Promise<Strings> => STRINGS[await read($, lang)]

// ---- Language: English unless Claude Code itself is set to another one

// The Claude app's display language (Settings › Language), read from its
// config file. Only that one key is extracted, by a system tool, so nothing
// else in the file (the app's sign-in cache among others) ever reaches Conso
const appLocale = async ($: EngineInterface): Promise<string | undefined> => {
  const appData = await $.env.get('APPDATA')
  if (appData) {
    const r = await $.process.run(
      ['powershell', '-NoProfile', '-Command', '(Get-Content -Raw -LiteralPath $env:APPDATA\\Claude\\config.json | ConvertFrom-Json).locale'],
      { timeoutMs: 5000 },
    )
    return r.exitCode === 0 ? r.stdout.trim() : undefined
  }
  const home = await $.env.get('HOME')
  if (!home) return undefined
  const config = `${home}/Library/Application Support/Claude/config.json`
  if (!(await $.fs.exists(config))) return undefined
  const r = await $.process.run(['plutil', '-extract', 'locale', 'raw', '-o', '-', config], { timeoutMs: 5000 })
  return r.exitCode === 0 ? r.stdout.trim() : undefined
}

// 1. Claude Code's own `language` setting, when the person set one: a language
//    Conso does not speak then means English
// 2. otherwise, the Claude app's display language
// 3. otherwise, English
export const detectLang = async ($: EngineInterface): Promise<Lang> => {
  // The whole settings, then the key: the same answer wherever the read is served
  let setting: unknown
  try {
    setting = ((await $.settings.read()) as { language?: unknown }).language
  } catch {
    setting = undefined
  }
  if (typeof setting === 'string' && setting.trim()) return toLang(setting) ?? 'en'
  return toLang(await appLocale($).catch(() => undefined)) ?? 'en'
}

const syncLang = async ($: EngineInterface) => {
  const found = await detectLang($)
  if ((await read($, lang)) !== found) await update($, lang, () => found)
}

// Green to red as the percentage rises
const levelColor = (p: number) => heat(p)

const SEGMENTS = 10
const bar = (p: number) => {
  const n = p <= 0 ? 0 : Math.max(1, Math.min(SEGMENTS, Math.round((p * SEGMENTS) / 100)))
  return { on: '━'.repeat(n), off: '━'.repeat(SEGMENTS - n) }
}

const num = (n: number, digits: number) => n.toFixed(digits)

const tokens = (n: number) =>
  n >= 1_000_000 ? `${num(n / 1_000_000, n % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Written only when something changed: every write redraws the panel
const save = async ($: EngineInterface, s: Snapshot) => {
  if (same(await read($, snapshot), s)) return
  await update($, snapshot, () => s)
}

const setHistory = async ($: EngineInterface, days: Day[]) => {
  if (same(await read($, history), days)) return
  await update($, history, () => days)
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

// What the last call stored: a measurement with nothing new writes nothing
let remembered: { limits: string; usd?: number } = { limits: '' }

const remember = async ($: EngineInterface, s: Snapshot) => {
  const now = await $.clock.now()
  const limitsKey = JSON.stringify(s.limits)
  if (s.limits.length > 0 && limitsKey !== remembered.limits) {
    await $.store.set('lastLimits', { limits: s.limits, at: s.limitsAt ?? now })
    remembered = { ...remembered, limits: limitsKey }
  }

  if (s.usd === undefined || s.usd === remembered.usd) return
  remembered = { ...remembered, usd: s.usd }
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
  await setHistory($, lastWeek(days, now))
}

let ticker: { cancel: () => void } | undefined

const patch = async ($: EngineInterface, id: string, fn: (a: AgentRun) => AgentRun) => {
  await update($, agents, list => list.map(a => (a.id === id ? fn(a) : a)))
}

// A one-second clock while an agent runs, for the displayed duration
const syncTicker = async ($: EngineInterface, list?: readonly AgentRun[]) => {
  const live = (list ?? (await read($, agents))).some(a => a.status === 'running')
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
    await save($, { ...s, limits, limitsAt: newer ? last.at : s.limitsAt })
  }
  const days = ((await $.store.get('costDays')) ?? {}) as Record<string, number>
  await setHistory($, lastWeek(days, now))
}

let poller: { cancel: () => void } | undefined
let updatePoller: { cancel: () => void } | undefined
let langPoller: { cancel: () => void } | undefined
let systemPoller: { cancel: () => void } | undefined
let isReading = false
let platform: Platform | undefined

// One reading of the machine's load; undefined when the machine would not say
const readSystem = async ($: EngineInterface): Promise<SystemStats | undefined> => {
  platform ??= (await $.env.get('APPDATA')) ? 'windows' : (await $.fs.exists('/proc/stat')) ? 'linux' : 'mac'
  const r =
    platform === 'windows'
      ? await $.process.run(['powershell', '-NoProfile', '-Command', WINDOWS], { timeoutMs: 8000 })
      : await $.process.run(['sh', '-c', platform === 'linux' ? LINUX : MAC], { timeoutMs: 8000 })
  if (r.exitCode !== 0 && !r.stdout.trim()) return undefined
  const stats = platform === 'windows' ? parseWindows(r.stdout) : platform === 'linux' ? parseLinux(r.stdout) : parseMac(r.stdout)
  return stats.cpu === undefined && stats.ramUsed === undefined ? undefined : stats
}

// One reading of the machine's load, kept as drawn (whole percents, tenths of
// a GB): a reading that changes nothing on screen writes nothing
const pollSystem = async ($: EngineInterface) => {
  if (isReading) return
  isReading = true
  try {
    const s = await readSystem($)
    if (!s) return
    const whole = (n: number | undefined) => (n === undefined ? undefined : Math.round(n))
    const tenth = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 10) / 10)
    const shown: SystemStats = { ...s, cpu: whole(s.cpu), gpu: whole(s.gpu), ramUsed: tenth(s.ramUsed), ramTotal: tenth(s.ramTotal) }
    if (!same(await read($, system), shown)) await update($, system, () => shown)
  } finally {
    isReading = false
  }
}

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

// Reads the version published on GitHub. The automatic check stays quiet on
// failure; the manual one (Check for updates) says what happened
const checkUpdate = async ($: EngineInterface, isManual = false) => {
  const t = await words($)
  if (isManual) await update($, updateState, (u): UpdateState => ({ ...u, status: 'checking', message: undefined }))
  try {
    const r = await $.http.fetch(`https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`)
    if (!r.ok) throw new Error(t.githubAnswered(r.status))
    const latest = String((JSON.parse(r.text) as { version?: unknown }).version ?? '')
    if (!/^\d+(\.\d+)*$/.test(latest)) throw new Error(t.noVersion)
    await update($, updateState, (u): UpdateState =>
      u.status === 'running' || u.status === 'done'
        ? u
        : { latest, status: isNewer(latest, VERSION) ? 'idle' : 'current', message: undefined },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, updateState, (u): UpdateState =>
      isManual || u.status === 'checking' ? { ...u, status: 'error', message } : { ...u, message },
    )
  }
}

// Claude Code's two official commands: refresh the marketplace, then the plugin
const runUpdate = async ($: EngineInterface) => {
  const t = await words($)
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
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'done', message: undefined }))
    // Load the new version right away: /reload-plugins swaps the plugins in
    // this session, no restart. Where it cannot run, a restart applies it
    try {
      await $.command.run({ command: 'reload-plugins' })
      $.ui.toast(t.updatedReloaded)
    } catch {
      await update($, updateState, (u): UpdateState => ({ ...u, message: 'restart' }))
      $.ui.toast(t.updatedRestart)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'error', message }))
    $.ui.toast(t.updateFailed(message))
  }
}

// ---- Card order, kept across sessions

// A stored order missing a card (an older version) gets it back at the end
// A stored order missing a card (an older version) gets it back right after the
// card that comes before it by default
const normalizeOrder = (stored: unknown): CardKey[] => {
  const known = Array.isArray(stored) ? stored.filter((k): k is CardKey => DEFAULT_ORDER.includes(k as CardKey)) : []
  const list = [...new Set(known)]
  DEFAULT_ORDER.forEach((k, i) => {
    if (list.includes(k)) return
    const before = DEFAULT_ORDER.slice(0, i).reverse().find(b => list.includes(b))
    list.splice(before ? list.indexOf(before) + 1 : 0, 0, k)
  })
  return list
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
const updateBanner = (u: UpdateState, t: Strings) =>
  u.latest && isNewer(u.latest, VERSION) && (u.status === 'idle' || u.status === 'running' || u.status === 'done' || u.status === 'error')
    ? updateCard(u.latest, u.status, u.message === 'restart', t)
    : null

// What the footer says about updates after the version number, and the color
// of its dot: green up to date, blue a new version, red a failed check
const updateLine = (u: UpdateState, t: Strings): { text: string; color: string; reason?: string } =>
  u.status === 'checking'
    ? { text: t.checkingUpdates, color: '#6e6e74' }
    : u.status === 'current'
      ? { text: t.upToDate, color: HEX.green! }
      : u.status === 'error' && u.message
        ? { text: t.checkFailed, color: HEX.red!, reason: u.message }
        : u.latest && isNewer(u.latest, VERSION)
          ? { text: t.available(u.latest), color: HEX.blue! }
          : { text: '', color: '#6e6e74' }

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
    // A compaction cut short (a reload, a crash) must not leave the button busy
    await update($, isCompacting, () => false)
    await syncLang($).catch(() => undefined)
    await $.command.register({ name: 'conso', description: (await words($)).command })
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
    // A new version on GitHub? A few seconds after start, then every 6 hours.
    // On a timer, not inside this hook: work left running after the hook
    // returns is cut off, and the check would never land
    $.clock.after(3000, () => void checkUpdate($).catch(() => undefined))
    updatePoller?.cancel()
    updatePoller = $.clock.every(6 * 3_600_000, () => void checkUpdate($).catch(() => undefined))
    // The language again every 10 minutes, should it change in the meantime
    langPoller?.cancel()
    langPoller = $.clock.every(600_000, () => void syncLang($).catch(() => undefined))
    // The machine's load, for the panel only: a first reading right away, then
    // every 5 seconds (10 on Windows, where PowerShell starts slower)
    systemPoller?.cancel()
    systemPoller = undefined
    if (e.surface !== 'terminal') {
      $.clock.after(500, () => void pollSystem($).catch(() => undefined))
      let beat = 0
      systemPoller = $.clock.every(5000, () => {
        if (platform === 'windows' && beat++ % 2 === 1) return
        void pollSystem($).catch(() => undefined)
      })
    }
    return r
  })

  on('command.run', { command: 'conso' }, async $ => {
    await syncLang($).catch(() => undefined)
    await $.ui.open({ id: PANE, title: 'Conso' })
    return { text: (await words($)).opened }
  })

  // Any compaction of the conversation (the button, a typed /compact, the
  // automatic one): the button is free again and the context shows its new size
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      await update($, isCompacting, () => false)
      const s = await read($, snapshot)
      // A compaction a hook skipped has no size afterwards
      const after = 'tokensAfter' in r ? r.tokensAfter : undefined
      if (s && after !== undefined) await save($, { ...s, tokens: after })
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const t = await words($)
    const s = await read($, snapshot)
    if (s === null || !('Svg' in els)) {
      return <els.Text dimColor>{t.waiting}</els.Text>
    }

    await read($, tick)
    const now = await $.clock.now()
    const limits = limitCards(s, now, t)
    const upd = await read($, updateState)
    const banner = updateBanner(upd, t)
    const hist = historyCard(await read($, history), t)
    const ctx = contextCard(s, t)
    const stats = await read($, system)
    const sys = stats ? systemCard(stats, t) : null
    const busy = await read($, isCompacting)
    const ag = agentsCard(await read($, agents), now, t)

    // Exactly what typing /compact does: it shows in the conversation and runs
    // as soon as Claude is idle. Started on a timer so the press returns at
    // once: a compaction outlasts the time a press may take
    const compact = async () => {
      if (await read($, isCompacting)) return
      await update($, isCompacting, () => true)
      $.clock.after(0, () => {
        void $.command
          .run({ command: 'compact' })
          .catch((err: unknown) => $.ui.toast(t.compactFailed(err instanceof Error ? err.message : String(err))))
          .finally(() => update($, isCompacting, () => false))
      })
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
              <els.Svg source={ctx.title} alt={t.context} width={ctx.titleW} height={14} />
              <els.Button key="compact" label={busy ? t.compacting : t.compact} plain dimColor onPress={compact} />
            </els.Box>,
            <els.Svg key="body" source={ctx.svg} alt={ctx.alt} height={ctx.h} />,
          ])
        : null,
      system: sys ? frame('sys', <els.Svg source={sys.svg} alt={sys.alt} height={sys.h} />) : null,
      history: hist ? frame('hist', <els.Svg source={hist.svg} alt={hist.alt} height={hist.h} />) : null,
      agents: frame('agents', [
        <els.Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center">
          <els.Svg source={ag.head} alt={t.agents} width={ag.headW} height={14} />
          {ag.finished > 0 ? <els.Button key="clear" label={t.clear} plain dimColor onPress={clearFinished} /> : null}
        </els.Box>,
        ag.rows.length === 0 ? <els.Svg key="empty" source={ag.empty} alt={t.noAgents} height={ag.emptyH} /> : null,
        ...ag.rows.map(r => (
          <els.Box key={r.id} flexDirection="column">
            <els.Svg source={r.top.svg} alt={r.alt} height={r.top.h} />
            <els.Box flexDirection="row" alignItems="center">
              <els.Box flexGrow={1} flexShrink={1} minWidth={0}>
                <els.Svg source={r.mid.svg} alt={r.mid.alt} height={r.mid.h} />
              </els.Box>
              {r.canStop ? <els.Button key={`stop-${r.id}`} label={t.stop} plain dimColor onPress={stop(r.id)} /> : null}
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
              <els.Text dimColor>{t.cards[key]}</els.Text>
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
          {blocks[key] ?? <els.Text dimColor>{t.nothingYet}</els.Text>}
        </els.Box>
      )
    })

    const toggle = (
      <els.Box key="customize-row" flexDirection="row" justifyContent="flex-end">
        <els.Button key="customize" label={customizing ? t.done : t.customize} plain dimColor onPress={() => update($, isCustomizing, v => !v)} />
      </els.Box>
    )

    // Footer, centered under the cards: the two actions, then the installed
    // version with what the last update check found. Centered, a button's own
    // padding lines up with the text, and a narrow panel wraps it cleanly
    const line = updateLine(upd, t)
    const foot = footerLine(VERSION, line.text, line.color, line.reason)
    const footer = (
      <els.Box key="footer" flexDirection="column">
        <els.Box flexDirection="row" flexWrap="wrap" justifyContent="center" columnGap={1}>
          <els.Button
            key="check-updates"
            label={upd.status === 'checking' ? t.checking : t.checkUpdates}
            plain
            dimColor
            onPress={() => checkUpdate($, true)}
          />
          {customizing ? null : (
            <els.Button key="customize" label={t.customize} plain dimColor onPress={() => update($, isCustomizing, v => !v)} />
          )}
        </els.Box>
        <els.Svg key="version" source={foot.svg} alt={foot.alt} height={foot.h} />
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
                  <els.Button key="update" label={t.update} plain dimColor onPress={() => runUpdate($)} />
                ) : null}
              </els.Box>
            ))
          : null}
        {/* While customizing, Done sits at the top, in reach right away */}
        {customizing ? toggle : null}
        {placed}
        {footer}
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
      const list = await update($, agents, cur => {
        const seen = cur.find(a => a.id === run.id)
        // Already seen through its first step: just give it its name
        if (seen) return cur.map(a => (a === seen ? { ...a, description: run.description, type: run.type, prompt: run.prompt } : a))
        return [...cur, run].slice(-50)
      })
      await syncTicker($, list)
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

  // Agents' steps only (the matcher wants an agentId): the main conversation's
  // replies stream straight through, without ever passing through Conso
  on('turn.step', { agentId: /./ }, async function* ($, e, next) {
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
    // One write per step: linked or added, then counted
    const count = (a: AgentRun): AgentRun =>
      a.isStopping ? a : { ...a, model: e.model, effort: e.effort ?? a.effort, steps: a.steps + 1 }
    const list = await update($, agents, cur => {
      if (cur.some(a => a.id === id)) return cur.map(a => (a.id === id ? count(a) : a))
      // Known to the engine but not linked by its prompt: take a pending launch
      // of the same model
      const pending = cur.filter(a => !a.isLinked && a.status === 'running')
      const spawn = pending.find(a => a.model === e.model) ?? pending[0]
      if (spawn) return cur.map(a => (a === spawn ? count({ ...a, id, isLinked: true }) : a))
      const run: AgentRun = {
        id,
        isLinked: true,
        usd: 0,
        description: info?.description || info?.name || '',
        type: info?.type || 'Agent',
        model: e.model,
        status: 'running',
        startedAt: now,
        steps: 1,
        outputTokens: 0,
      }
      return [...cur, run].slice(-50)
    })
    await syncTicker($, list)
    // Stop requested: no new request, the agent hands back cleanly
    if (list.find(a => a.id === id)?.isStopping) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: 'Stopped from the Conso panel.',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: null,
      }
    }
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
      const run = (await read($, agents)).find(a => a.id === id)
      if (run?.isStopping) {
        return { deny: 'Stopped by the user from the Conso panel: finish now, without any further action.' }
      }
      // Written only when the tool changes: a run of Reads redraws nothing
      if (run && run.lastTool !== e.tool) await patch($, id, a => ({ ...a, lastTool: e.tool }))
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

  // The terminal's bar only: the desktop app has the panel, and its band is
  // never asked for
  on('ui.render', { component: 'AbovePrompt', surface: 'terminal' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || s === null || e.surface !== 'terminal') return next(e)

    const t = await words($)
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
      const reset = left(l.resetsAt, now, t.units)
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
            label(t.band.session),
            <Text key="usd" bold>
              ${s.usd.toFixed(2)}
            </Text>,
          ])
        : null,
      limit('h5', t.band.h5, s.limits.find(l => l.kind === 'five_hour')),
      limit('w7', t.band.week, s.limits.find(l => l.kind === 'seven_day')),
      s.tokens !== undefined && ctxPct !== undefined
        ? chip('ctx', [
            label(t.band.context),
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
