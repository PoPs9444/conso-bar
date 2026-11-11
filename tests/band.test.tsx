import { expect, mock, test } from 'claude-code/testing'

import { VERSION, parseUsage } from '../hooks/register'
import { heat, tokens } from '../hooks/dashboard'
import { appOf, gpuShort, keepColors, parseGpuClients, parseLinux, parseMac, parseWindows, pickGpu, topApps } from '../hooks/system'

const USAGE = {
  startedAt: 0,
  context: { tokens: 107_000, window: 1_000_000, percent: 11 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-11-01T03:00:00Z' },
    { kind: 'seven_day', percentUsed: 61, resetsAt: '2026-11-05T00:00:00Z' },
  ],
  cost: { usd: 1.23 },
}

let clock: ReturnType<typeof mock.clock>
const setup = async ($: any, on: any) => {
  clock = mock.clock(on, { now: Date.parse('2026-11-01T00:00:00Z') })
  mock.store(on)
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 'session-test' }))
  on('command.register', () => ({ value: { command: 'conso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

test('the panel shows the cards', async ($, on) => {
  await setup($, on)
  const ui = await $.ui.mount({
    plugin: 'conso-bar',
    component: 'Pane',
    requestId: 'conso',
    props: {
      title: 'Conso',
      isFocused: false,
      bodyColumns: 40,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    surface: 'desktop',
  } as never)
  const svgs = await ui.findAll({ type: 'Svg' })
  const ctx = svgs.find(x => String(x.props.alt).startsWith('Context:'))
  const alts = svgs.map(x => String(x.props.alt))
  // 42% in 2h out of 5h; 61% in 3d out of 7d: forecast from the average
  // Both limits in one card, the session cost on its title line
  expect(alts).toContain('5-hour limit: 42%, 100% in ≈ 2h 46m. Weekly limit: 61%, 100% in ≈ 1d 22h. Session: $1.23')
  const source = svgs.map(x => String(x.props.source)).join('')
  expect(source.includes('>3h 00m<')).toBe(true)
  expect(source.includes('$1.23')).toBe(true)
  // 42% in 2h out of 5h; 61% in 3d out of 7d: forecast from the average
  expect(source.includes('100% in ≈ 2h 46m')).toBe(true)
  expect(source.includes('100% in ≈ 1d 22h')).toBe(true)
  expect(ctx?.props.alt).toBe('Context: 107k / 1M tokens, 10.7%')
  expect((await ui.find({ type: 'Button' }))?.text).toBe('Compact')
  await ui.unmount()
})

test('the bar stays in the terminal', async ($, on) => {
  await setup($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'conso-bar',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 20, scroll: { offset: 0, bodyRows: 20 } },
      surface,
    } as never)
    const engine = await ui.find({ type: 'Text', text: /engine/ })
    expect(engine === undefined).toBe(surface === 'terminal')
    await ui.unmount()
  }
})

test('the button runs /compact in the conversation', async ($, on) => {
  let compacted = 0
  on('command.run', (_: unknown, e: { command: string }) => {
    if (e.command === 'compact') compacted += 1
    return { text: '' }
  })
  on('ui.toast', () => ({ value: {} }))
  await setup($, on)
  const ui = await $.ui.mount({
    plugin: 'conso-bar',
    component: 'Pane',
    requestId: 'conso',
    props: { title: 'Conso', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    surface: 'desktop',
  } as never)
  await ui.press({ key: 'compact' })
  // Started on a timer, so the press itself returns at once
  await clock.advance(0)
  expect(compacted).toBe(1)
  await ui.unmount()
})

test('the Clear button shows up with a finished agent', async ($, on) => {
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns'
      ? { value: { value: [{ id: 'x', isLinked: true, description: 'Fini', type: 'Explore', model: 'claude-haiku-5-5', status: 'done', startedAt: 0, endedAt: 1000, steps: 1, outputTokens: 10 }], version: 1 } }
      : next(e),
  )
  await setup($, on)
  const ui = await $.ui.mount({
    plugin: 'conso-bar',
    component: 'Pane',
    requestId: 'conso',
    props: { title: 'Conso', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    surface: 'desktop',
  } as never)
  expect((await ui.find({ key: 'clear' }))?.text).toBe('Clear')
  await ui.unmount()
})

const PANE = {
  plugin: 'conso-bar',
  component: 'Pane',
  requestId: 'conso',
  props: { title: 'Conso', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  surface: 'desktop',
} as never

test('the history counts the day\'s cost', async ($, on) => {
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const svgs = await ui.findAll({ type: 'Svg' })
  const hist = svgs.find(x => String(x.props.alt).startsWith('History'))
  expect(hist?.props.alt).toBe('History: Today $1.23, 7 days $1.23')
  await ui.unmount()
})

test('Stop blocks the agent\'s tools', async ($, on) => {
  let ran = 0
  // A running agent, kept in memory as the engine would
  let runs: unknown = [{ id: 'x', isLinked: true, usd: 0.02, description: 'Long', type: 'Explore', model: 'claude-opus-5-5', effort: 'high', status: 'running', startedAt: 0, steps: 1, outputTokens: 10 }]
  let version = 1
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns' ? { value: { value: runs, version } } : next(e),
  )
  on('state.set', (_: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.key !== 'agentRuns') return next(e)
    runs = e.value
    version += 1
    return { value: { isSet: true, version } }
  })
  on('tool.call', () => {
    ran += 1
    return { result: {} }
  })
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop-x' })
  await ui.unmount()
  const r = (await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'x' } as never)) as { deny?: string }
  expect(typeof r.deny).toBe('string')
  expect(ran).toBe(0)
})

// The Button keyed `key` in a drawn tree, as the app receives it
const buttonIn = (node: unknown, key: string): unknown => {
  if (typeof node !== 'object' || node === null) return undefined
  const n = node as { type?: string; props?: { key?: string }; children?: unknown[] }
  if (n.type === 'Button' && n.props?.key === key) return n
  for (const child of n.children ?? []) {
    const found = buttonIn(child, key)
    if (found) return found
  }
  return undefined
}

test('a button keeps its number from one drawing to the next, and Clear clears', async ($, on) => {
  let runs: unknown = [
    { id: 'r', isLinked: true, usd: 0.02, description: 'Long', type: 'Explore', model: 'claude-opus-5-5', status: 'running', startedAt: 0, steps: 1, outputTokens: 10 },
    { id: 'x', isLinked: true, usd: 0.01, description: 'Fini', type: 'Explore', model: 'claude-haiku-5-5', status: 'done', startedAt: 0, endedAt: 1000, steps: 1, outputTokens: 10 },
  ]
  let version = 1
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns' ? { value: { value: runs, version } } : next(e),
  )
  on('state.set', (_: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.key !== 'agentRuns') return next(e)
    runs = e.value
    version += 1
    return { value: { isSet: true, version } }
  })
  on('tool.call', () => ({ result: {} }))
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const before = JSON.stringify(buttonIn(await ui.drawn(), 'clear'))
  // Drawn twice again, the second time as at first
  await ui.press({ key: 'customize' })
  await ui.press({ key: 'customize' })
  const after = JSON.stringify(buttonIn(await ui.drawn(), 'clear'))
  expect(after).toBe(before)
  await ui.press({ key: 'clear' })
  expect((runs as { id: string }[]).map(a => a.id)).toEqual(['r'])
  await ui.unmount()
})

test('an agent\'s details wait for the 5-second beat; Stop shows at once; its time counts on by itself', async ($, on) => {
  let runs: unknown = [
    { id: 'r', isLinked: true, usd: 0, description: 'Long', type: 'Explore', model: 'claude-opus-5-5', status: 'running', startedAt: Date.parse('2026-11-01T00:00:00Z') - 42_000, steps: 1, outputTokens: 10 },
  ]
  let version = 1
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns' ? { value: { value: runs, version } } : next(e),
  )
  on('state.set', (_: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.key !== 'agentRuns') return next(e)
    runs = e.value
    version += 1
    return { value: { isSet: true, version } }
  })
  on('tool.call', () => ({ result: {} }))
  await setup($, on)
  const svgs = async () => {
    const ui = await $.ui.mount(PANE)
    const all = (await ui.findAll({ type: 'Svg' })).map(x => ({ alt: String(x.props.alt), source: String(x.props.source) }))
    await ui.unmount()
    return all
  }
  const activity = async () => (await svgs()).find(x => x.alt.includes('step'))?.alt
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'r' } as never)
  expect(await activity()).toContain('Bash')
  // A new tool alone does not draw the panel again until the next beat
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'r' } as never)
  expect(await activity()).toContain('Bash')
  await clock.advance(5000)
  expect(await activity()).toContain('Read')
  // The time is drawn with all its digits, the one of the moment animated
  const top = (await svgs()).find(x => x.source.includes('<animate attributeName="display"'))
  expect(top).toBeDefined()
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'stop-r' })
  await ui.unmount()
  expect((await svgs()).some(x => x.source.includes('Stopping'))).toBe(true)
})

test('a new session shows the last limits reading', async ($, on) => {
  const now = Date.parse('2026-11-01T00:00:00Z')
  mock.clock(on, { now })
  mock.store(on, {
    lastLimits: {
      at: now - 3_600_000,
      limits: [{ kind: 'seven_day', percentUsed: 9, resetsAt: '2026-11-05T00:00:00Z' }],
    },
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { ...USAGE, rateLimits: [] } }))
  on('session.id', () => ({ value: 'nouvelle' }))
  on('command.register', () => ({ value: { command: 'conso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const main = (await ui.findAll({ type: 'Svg' }))[0]
  expect(main?.props.alt).toBe('Weekly limit: 9%, ≈ 21% at reset. Session: $1.23')
  expect(String(main?.props.source).includes('>9%<')).toBe(true)
  await ui.unmount()
})

test('an internal engine task does not show up in Agents', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  } as never)
  await setup($, on)
  for await (const _ of ($.turn as never as { step: (e: unknown) => AsyncIterable<unknown> }).step({
    turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'fork-1',
  })) {
    // nothing
  }
  const ui = await $.ui.mount(PANE)
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.some(x => x.props.alt === 'No agents in this session yet')).toBe(true)
  await ui.unmount()
})

test('every agent row draws model, effort and activity', async ($, on) => {
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns'
      ? { value: { value: [{ id: 'x', isLinked: true, usd: 0.012, description: 'Test', type: 'Explore', model: 'claude-opus-5-5', effort: 'high', status: 'running', startedAt: 0, steps: 1, outputTokens: 128, lastTool: 'Bash' }], version: 1 } }
      : next(e),
  )
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  // The app does not show a Svg without alt text: none may lack one
  expect(alts.every(a => a.length > 0)).toBe(true)
  expect(alts).toContain('Opus 5.5, High effort')
  expect(alts).toContain('Bash, ≈ $0.012, 128 tokens, 1 step')
  await ui.unmount()
})

test('an agent recorded without a name or a model still draws, and the panel with it', async ($, on) => {
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns'
      ? { value: { value: [
          { id: 'w', isLinked: true, usd: 0, status: 'running', startedAt: 0, steps: 2, outputTokens: 0 },
          { id: 'x', isLinked: true, usd: 0, description: 'Test', type: 'Explore', model: 'claude-opus-5-5', status: 'done', startedAt: 0, endedAt: 1000, steps: 1, outputTokens: 0 },
        ], version: 1 } }
      : next(e),
  )
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect((await ui.findAll({ type: 'Text' })).some(x => x.text === 'engine')).toBe(false)
  expect(alts.some(a => a.startsWith('Context:'))).toBe(true)
  expect(alts.some(a => a.startsWith('Agent: Agent, '))).toBe(true)
  expect(alts.some(a => a.startsWith('Test: Opus 5.5'))).toBe(true)
  expect(alts.every(a => a.length > 0)).toBe(true)
  await ui.unmount()
})

test('a panel that cannot be drawn says why, and never stays blank', async ($, on) => {
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'update' ? { value: { value: null, version: 1 } } : next(e),
  )
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const texts = (await ui.findAll({ type: 'Text' })).map(x => String(x.text))
  expect(texts.some(x => x.startsWith('Conso could not draw this panel: '))).toBe(true)
  expect(texts.includes('engine')).toBe(false)
  await ui.unmount()
})

test('at most 10 agent rows, running first, the rest counted on one line', async ($, on) => {
  const runs = Array.from({ length: 14 }, (_, i) => ({
    id: `a${i}`, isLinked: true, usd: 0, description: `Task ${i}`, type: 'Explore', model: 'claude-opus-5-5',
    status: i === 0 ? 'running' : 'done', startedAt: 0, endedAt: 1000, steps: 1, outputTokens: 0,
  }))
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns' ? { value: { value: runs, version: 1 } } : next(e),
  )
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  const rows = alts.filter(a => a.startsWith('Task '))
  expect(rows.length).toBe(10)
  // The running one first, then the latest finished
  expect(rows[0]!.startsWith('Task 0:')).toBe(true)
  expect(rows[1]!.startsWith('Task 13:')).toBe(true)
  expect(alts).toContain('and 4 more')
  await ui.unmount()
})

test('Show more brings the hidden agents, Show less folds them back', async ($, on) => {
  const runs = Array.from({ length: 14 }, (_, i) => ({
    id: `a${i}`, isLinked: true, usd: 0, description: `Task ${i}`, type: 'Explore', model: 'claude-opus-5-5',
    status: i === 0 ? 'running' : 'done', startedAt: 0, endedAt: 1000, steps: 1, outputTokens: 0,
  }))
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns' ? { value: { value: runs, version: 1 } } : next(e),
  )
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  const rows = async () => (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).filter(a => a.startsWith('Task '))
  expect((await rows()).length).toBe(10)
  expect((await ui.find({ key: 'agents-more' }))?.props.label).toBe('Show more')
  expect(await ui.find({ key: 'agents-less' })).toBe(undefined)
  await ui.press({ key: 'agents-more' })
  expect((await rows()).length).toBe(14)
  expect(await ui.find({ key: 'agents-more' })).toBe(undefined)
  expect((await ui.find({ key: 'agents-less' }))?.props.label).toBe('Show less')
  await ui.press({ key: 'agents-less' })
  expect((await rows()).length).toBe(10)
  expect(await ui.find({ key: 'agents-less' })).toBe(undefined)
  await ui.unmount()
})

test('the plan usage from Anthropic reads to the limits', () => {
  expect(
    parseUsage(
      JSON.stringify({
        five_hour: { utilization: 12.34, resets_at: '2026-11-01T05:00:00.583615+00:00' },
        seven_day: { utilization: 37, resets_at: null },
        seven_day_opus: null,
      }),
    ),
  ).toEqual([
    { kind: 'five_hour', percentUsed: 12.3, resetsAt: '2026-11-01T05:00:00.583Z' },
    { kind: 'seven_day', percentUsed: 37 },
  ])
  expect(parseUsage('<html>')).toEqual([])
  expect(parseUsage(JSON.stringify({ five_hour: null, seven_day: { utilization: null } }))).toEqual([])
})

test('the limits move without a message: one request every 5 minutes, never undone by an older reading', async ($, on) => {
  let asks = 0
  let weekly = 62
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('session.measure', (_: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('http.fetch', (_: unknown, e: { url: string; init?: { auth?: string } }) => {
    if (!e.url.endsWith('/api/oauth/usage')) return { value: { ok: false, status: 404, headers: {}, text: '' } }
    expect(e.init?.auth).toBe('h')
    asks++
    const body = { five_hour: { utilization: 44, resets_at: '2026-11-01T03:00:00Z' }, seven_day: { utilization: weekly, resets_at: '2026-11-05T00:00:00Z' } }
    return { value: { ok: true, status: 200, headers: {}, text: JSON.stringify(body) } }
  })
  await setup($, on)
  await clock.advance(2000)
  expect(asks).toBe(1)
  const weeklyAlt = async () => {
    const ui = await $.ui.mount(PANE)
    const alt = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => a.includes('Weekly limit: '))
    await ui.unmount()
    return alt?.match(/Weekly limit: (\d+)%/)?.[1]
  }
  expect(await weeklyAlt()).toBe('62')
  // The context moving brings the engine's older windows again: they stay out
  await ($ as any).session.measure({ ...USAGE, context: { ...USAGE.context, tokens: 120_000 }, changed: ['context'] })
  expect(await weeklyAlt()).toBe('62')
  // Not again before 5 minutes, then the new figure
  weekly = 64
  await clock.advance(4 * 60_000)
  expect(asks).toBe(1)
  await clock.advance(2 * 60_000)
  expect(asks).toBe(2)
  expect(await weeklyAlt()).toBe('64')
  // A reply's own headers that moved are the newest reading
  await ($ as any).session.measure({ ...USAGE, rateLimits: [{ kind: 'seven_day', percentUsed: 65, resetsAt: '2026-11-05T00:00:00Z' }], changed: ['rateLimits'] })
  expect(await weeklyAlt()).toBe('65')
})

test('no request for the plan usage without a subscription sign-in', async ($, on) => {
  let asks = 0
  on('session.authorize', () => ({ value: { handle: 'k', kind: 'api-key' } }))
  on('http.fetch', (_: unknown, e: { url: string }) => {
    if (e.url.endsWith('/api/oauth/usage')) asks++
    return { value: { ok: false, status: 404, headers: {}, text: '' } }
  })
  await setup($, on)
  await clock.advance(10 * 60_000)
  expect(asks).toBe(0)
})

test('no reading of the machine while the panel is closed, one at once when it opens', async ($, on) => {
  let runs = 0
  let isOpen = true
  on('ui.panes', () => ({ value: isOpen ? [{ id: 'conso', title: 'Conso', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/Users/someone' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    if (e.argv[0] === 'sh') runs++
    return { value: e.argv[0] === 'sh' ? { exitCode: 0, stdout: macOut(1e9), stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } }
  })
  await setup($, on)
  await clock.advance(10_000)
  const open = runs
  expect(open > 0).toBe(true)
  isOpen = false
  await clock.advance(20_000)
  expect(runs).toBe(open)
  isOpen = true
  await $.command.run({ command: 'conso' })
  await clock.advance(10)
  expect(runs).toBe(open + 1)
})

test('a newer version on GitHub shows the update banner', async ($, on) => {
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  await setup($, on)
  // The startup check runs 3 seconds after the session starts
  await clock.advance(3000)
  const ui = await $.ui.mount(PANE)
  // One line, the whole of it the button
  const line = await ui.find({ key: 'update' })
  expect(line?.type).toBe('Button')
  expect(line?.props.label).toBe('New version v99.0.0 · Update')
  await ui.unmount()
})

test('no banner when GitHub has an older version', async ($, on) => {
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "0.0.1" }' } }))
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'update' })).toBe(undefined)
  await ui.unmount()
})

test('Customize shows arrows and moving a card changes the order', async ($, on) => {
  await setup($, on)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'customize' })
  await ui.unmount()
  const ui2 = await $.ui.mount(PANE)
  expect((await ui2.find({ key: 'customize' }))?.text).toBe('Done')
  expect(await ui2.find({ key: 'up-system' })).toBe(undefined)
  await ui2.press({ key: 'down-system' })
  await ui2.unmount()
  const ui3 = await $.ui.mount(PANE)
  // System moved below Limits: it now has an up arrow
  expect((await ui3.find({ key: 'up-system' }))?.text).toBe('↑')
  await ui3.unmount()
})

test('Customize hides a card, and shows it again in its place', async ($, on) => {
  await setup($, on)
  let ui = await $.ui.mount(PANE)
  const hasHistory = async () => (await ui.findAll({ type: 'Svg' })).some(x => String(x.props.alt).startsWith('History'))
  expect(await hasHistory()).toBe(true)
  await ui.press({ key: 'customize' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  await ui.press({ key: 'hide-history' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  // In Customize, the hidden card keeps its header, its arrows and Show
  expect((await ui.find({ key: 'show-history' }))?.text).toBe('Show')
  expect((await ui.findAll({ type: 'Text' })).map(x => x.text)).toContain('History · hidden')
  expect(await hasHistory()).toBe(false)
  await ui.press({ key: 'customize' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await hasHistory()).toBe(false)
  // Kept for the next session too
  await ui.unmount()
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  ui = await $.ui.mount(PANE)
  expect(await hasHistory()).toBe(false)
  await ui.press({ key: 'customize' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  await ui.press({ key: 'show-history' })
  await ui.press({ key: 'customize' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await hasHistory()).toBe(true)
  await ui.unmount()
})

test('Check for updates says up to date, or why it failed', async ($, on) => {
  let reply: { ok: boolean; status: number; text: string } = { ok: true, status: 200, text: '{ "version": "0.0.1" }' }
  on('http.fetch', () => ({ value: { ...reply, headers: {} } }))
  await setup($, on)
  let ui = await $.ui.mount(PANE)
  await ui.press({ key: 'check-updates' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  const footer = async () =>
    String((await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => a.startsWith(`v${VERSION}`)))
  // A moment of checking, the dot pulsing and the button unchanged, then the answer
  expect(await footer()).toBe('v' + VERSION + ' · Checking…')
  expect((await ui.find({ key: 'check-updates' }))?.text).toBe('Check for updates')
  expect(String((await ui.findAll({ type: 'Svg' })).find(x => String(x.props.alt).startsWith(`v${VERSION}`))?.props.source)).toContain('<animateTransform')
  await clock.advance(1200)
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await footer()).toBe('v' + VERSION + ' · Up to date')
  reply = { ok: false, status: 503, text: '' }
  await ui.press({ key: 'check-updates' })
  await clock.advance(1200)
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await footer()).toBe('v' + VERSION + ' · Update check failed: GitHub answered 503')
  await ui.unmount()
})

test('Update installs in the background and posts nothing in the conversation', async ($, on) => {
  const ran: string[][] = []
  const commands: string[] = []
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    ran.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('command.run', (_: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { text: '' }
  })
  on('ui.toast', () => ({ value: {} }))
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  await setup($, on)
  await clock.advance(3000)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'update' })
  await clock.advance(0)
  await ui.unmount()
  // One script that finds Claude Code's command line, then its two commands
  const updates = ran.filter(a => a.join(' ').includes('plugin update'))
  expect(updates).toHaveLength(1)
  expect(updates[0]!.slice(0, 2)).toEqual(['sh', '-c'])
  expect(updates[0]![2]).toContain('"$c" plugin marketplace update conso-bar && "$c" plugin update conso-bar@conso-bar')
  expect(updates[0]![2]).toContain('claude-code/"*/*/claude.app/Contents/MacOS/claude')
  // No /reload-plugins: the new version waits for the next conversation
  expect(commands).toEqual([])
  const ui2 = await $.ui.mount(PANE)
  const alts = (await ui2.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect(alts).toContain('v99.0.0 installed. Takes effect in your next conversation')
  expect(alts).toContain(`v${VERSION} · v99.0.0 ready`)
  await ui2.unmount()
})

test('another conversation sees the version already installed', async ($, on) => {
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  const c = mock.clock(on, { now: Date.parse('2026-11-01T00:00:00Z') })
  // Installed by another conversation after this one started
  mock.store(on, { installedVersion: { version: '99.0.0', at: USAGE.startedAt + 1 } })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 'session-test' }))
  on('command.register', () => ({ value: { command: 'conso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'check-updates' })
  await c.advance(1200)
  await ui.unmount()
  const ui2 = await $.ui.mount(PANE)
  // No Update to press again: the banner says it waits for the next conversation
  expect((await ui2.findAll({ type: 'Button' })).map(b => b.text)).not.toContain('Update')
  expect((await ui2.findAll({ type: 'Svg' })).map(x => String(x.props.alt))).toContain('v99.0.0 installed. Takes effect in your next conversation')
  await ui2.unmount()
})

test('an install that did not take offers Update again', async ($, on) => {
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  const c = mock.clock(on, { now: Date.parse('2026-11-01T00:00:00Z') })
  // Installed before this conversation started, yet this one still runs the old version
  mock.store(on, { installedVersion: { version: '99.0.0', at: 5 } })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { ...USAGE, startedAt: 10 } }))
  on('session.id', () => ({ value: 'session-test' }))
  on('command.register', () => ({ value: { command: 'conso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await c.advance(3000)
  const ui = await $.ui.mount(PANE)
  expect((await ui.findAll({ type: 'Button' })).map(b => b.text).some(x => x.includes('Update'))).toBe(true)
  await ui.unmount()
})

// ---- Language: English by default, Claude Code's language when it is set

const mountIn = async ($: any, on: any, opts: { setting?: string; locale?: string; os?: 'mac' | 'windows' }) => {
  // A read of one key is the read of the whole settings, projected
  on('settings.read', () => ({ value: opts.setting === undefined ? {} : { language: opts.setting } }))
  on('env.get', (_: unknown, e: { name: string }) => ({
    value: e.name === 'HOME' ? '/Users/someone' : e.name === 'APPDATA' && opts.os === 'windows' ? 'C:\\Users\\someone\\AppData\\Roaming' : undefined,
  }))
  on('fs.exists', () => ({ value: opts.locale !== undefined }))
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    const reads = opts.os === 'windows' ? e.argv[0] === 'powershell' : e.argv[0] === 'plutil'
    return { value: reads && opts.locale !== undefined ? { exitCode: 0, stdout: `${opts.locale}\n`, stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } }
  })
  await setup($, on)
  return $.ui.mount(PANE)
}

test('English when nothing says otherwise', async ($, on) => {
  const ui = await mountIn($, on, {})
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Compact')
  await ui.unmount()
})

test('the Claude app in French: the panel in French', async ($, on) => {
  const ui = await mountIn($, on, { locale: 'fr-FR' })
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Compacter')
  expect((await ui.find({ key: 'customize' }))?.text).toBe('Personnaliser')
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect(alts.some(a => a.startsWith('Limite 5 h: 42%, 100% dans ≈ 2h 46min. Limite hebdo: 61%'))).toBe(true)
  expect(String((await ui.findAll({ type: 'Svg' }))[0]?.props.source)).toContain('>5 heures<')
  expect(alts).toContain("Historique: Aujourd'hui $1.23, 7 jours $1.23")
  expect(alts).toContain('Aucun agent dans cette session')
  await ui.unmount()
})

test('on Windows too, through the app config', async ($, on) => {
  const ui = await mountIn($, on, { locale: 'es-ES', os: 'windows' })
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Compactar')
  await ui.unmount()
})

test("Claude Code's language setting comes first", async ($, on) => {
  const ui = await mountIn($, on, { setting: 'english', locale: 'fr-FR' })
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Compact')
  await ui.unmount()
})

test('a language setting by name: Deutsch', async ($, on) => {
  const ui = await mountIn($, on, { setting: 'Deutsch' })
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Komprimieren')
  await ui.unmount()
})

test('a language Conso does not speak: English', async ($, on) => {
  const ui = await mountIn($, on, { setting: 'japanese', locale: 'fr-FR' })
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Compact')
  await ui.unmount()
})

test('agent rows in French: effort word first, level in color', async ($, on) => {
  on('state.get', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) =>
    e.key === 'agentRuns'
      ? { value: { value: [{ id: 'x', isLinked: true, usd: 0.012, description: 'Test', type: 'Explore', model: 'claude-opus-5-5', effort: 'high', status: 'running', startedAt: 0, steps: 2, outputTokens: 128, lastTool: 'Bash' }], version: 1 } }
      : next(e),
  )
  const ui = await mountIn($, on, { locale: 'fr-FR' })
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect(alts).toContain('Opus 5.5, Effort élevé')
  expect(alts).toContain('Bash, ≈ $0.012, 128 tokens, 2 étapes')
  expect((await ui.find({ key: 'stop-x' }))?.text).toBe('Arrêter')
  await ui.unmount()
})

// ---- Speed

test('a redraw with nothing new hands the app the same drawings', async ($, on) => {
  await setup($, on)
  const first = await $.ui.mount(PANE)
  const a = (await first.findAll({ type: 'Svg' })).map(x => String(x.props.source))
  await first.unmount()
  const second = await $.ui.mount(PANE)
  const b = (await second.findAll({ type: 'Svg' })).map(x => String(x.props.source))
  await second.unmount()
  expect(b).toEqual(a)
})

test('a compaction frees the button and shows the new context size', async ($, on) => {
  const summary = [{ role: 'user', text: 'Summary', toolUses: [] }]
  on('session.compact', () => ({ messages: summary, tokensBefore: 807_000, tokensAfter: 42_000 }))
  await setup($, on)
  await ($ as any).session.compact({ trigger: 'manual', messages: summary })
  const ui = await $.ui.mount(PANE)
  const ctx = (await ui.findAll({ type: 'Svg' })).find(x => String(x.props.alt).startsWith('Context:'))
  expect(ctx?.props.alt).toBe('Context: 42k / 1M tokens, 4.2%')
  expect((await ui.find({ key: 'compact' }))?.text).toBe('Compact')
  await ui.unmount()
})

test("an agent's steps still reach the card", async ($, on) => {
  on('agent.list', () => ({ value: [{ id: 'a1', name: 'Scout', description: 'Scout the repo', type: 'Explore' }] }))
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  } as never)
  await setup($, on)
  const step = ($.turn as never as { step: (e: unknown) => AsyncIterable<unknown> }).step
  for await (const _ of step({ turnId: 't', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' })) {
    // nothing
  }
  const ui = await $.ui.mount(PANE)
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect(alts.some(a => a.startsWith('Scout the repo: Haiku 5.5'))).toBe(true)
  expect(alts.filter(a => a.includes(': Opus 5.5')).length).toBe(0)
  await ui.unmount()
})

test('an agent that finished and starts a turn again shows as running', async ($, on) => {
  on('agent.list', () => ({ value: [{ id: 'a1', name: 'Scout', description: 'Scout the repo', type: 'Explore', status: 'running' }] }))
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  } as never)
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await setup($, on)
  const turn = $.turn as never as {
    step: (e: unknown) => AsyncIterable<unknown>
    start: (e: unknown) => Promise<unknown>
    complete: (e: unknown) => Promise<unknown>
  }
  for await (const _ of turn.step({ turnId: 't', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' })) {
    // nothing
  }
  await turn.complete({ turnId: 't', agentId: 'a1', reason: 'answer', answer: '' })
  const row = async () => {
    const ui = await $.ui.mount(PANE)
    const alt = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => a.startsWith('Scout the repo:'))
    await ui.unmount()
    return alt
  }
  expect(await row()).toContain('Done')
  // A message wakes it: a new turn
  await turn.start({ turnId: 't2', agentId: 'a1', text: 'carry on' })
  expect(await row()).toContain('Running')
})

test('token counts: no 1000k, no 0k', () => {
  expect(tokens(850)).toBe('850')
  expect(tokens(12_400)).toBe('12k')
  expect(tokens(999_700)).toBe('1M')
  expect(tokens(1_000_000)).toBe('1M')
  expect(tokens(1_500_000)).toBe('1.5M')
})

test('a Mac with no GPU clients to time keeps the GPU\'s own utilization', () => {
  const out = macOut(5000).split('@@').slice(0, 5).join('@@') + '@@\n'
  const { stats, gpuTimes } = parseMac(out)
  expect(gpuTimes).toBe(undefined)
  expect(stats.gpu).toBe(26)
})

test('history bars go from green to red with what each day cost', async ($, on) => {
  const now = Date.parse('2026-11-01T00:00:00Z')
  const key = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // A light day yesterday, the heaviest day two days ago; today adds the session's $1.23
  const costDays = { [key(now - 86_400_000)]: 0.5, [key(now - 2 * 86_400_000)]: 10 }
  mock.clock(on, { now })
  mock.store(on, { costDays })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 'session-test' }))
  on('command.register', () => ({ value: { command: 'conso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  const hist = (await ui.findAll({ type: 'Svg' })).find(x => String(x.props.alt).startsWith('History'))
  const fills = [...String(hist?.props.source).matchAll(/<rect x="-?[\d.]+" y="[\d.]+" width="6" height="[\d.]+" rx="2" fill="(#[0-9a-f]{6})"/g)].map(m => m[1])
  expect(fills.length).toBe(7)
  // The heaviest day is red, a light day is green
  expect(fills[4]).toBe('#f04242')
  expect(fills[5]).toBe('#42f067')
  await ui.unmount()
})

// ---- System: CPU, GPU and memory, and the apps behind them

// What the macOS command prints on an Apple M4 Max (trimmed)
const MAC_OUT = ` 18  7 75  10.27 17.75 15.56
@@
"Device Utilization %"=26
"model" = "Apple M4 Max"
@@
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages active:                                1395742.
Pages wired down:                             389218.
Pages purgeable:                               26294.
Anonymous pages:                             2069093.
Pages occupied by compressor:                 899298.
@@
68719476736
16
`

// The processes and the GPU's clients that follow it; `gpu` is the GPU time of
// Claude's client, `claudeClient` that client's registry id
const macOut = (gpu: number, claudeClient = '0x1001') => `${MAC_OUT}@@
  101  64.0  2097152 /Applications/Claude.app/Contents/MacOS/Claude
  102  32.0  1048576 /Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer)
  103  16.0   524288 /Users/someone/Library/Application Support/Claude/claude-code/2.1.316/claude.app/Contents/MacOS/claude
  201  48.0  5242880 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  301   8.0  1048576 /System/Library/CoreServices/WindowServer
  302   1.6   262144 /usr/libexec/logd
@@
+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id ${claudeClient}
"accumulatedGPUTime"=${gpu}
"IOUserClientCreator" = "pid 101
+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id 0x1002
"accumulatedGPUTime"=1000
"IOUserClientCreator" = "pid 301
`

test('macOS: CPU, GPU and memory as Activity Monitor counts it', () => {
  const { stats: s, procs, gpuTimes } = parseMac(macOut(5000))
  expect(s.cpu).toBe(25)
  expect(s.gpu).toBe(26)
  expect(s.gpuName).toBe('M4 Max')
  expect(Math.round(s.ramUsed! * 10) / 10).toBe(50.8)
  expect(s.ramTotal).toBe(64)
  expect(s.cores).toBe(16)
  expect(procs.map(p => p.app)).toEqual(['Claude', 'Claude', 'claude', 'Google Chrome', 'macOS', 'macOS'])
  expect(procs[0]!.ram).toBe(2)
  expect(gpuTimes?.get('0x1001')).toEqual({ pid: '101', time: 5000 })
})

test('a process belongs to its outermost app, the system\'s own to macOS', () => {
  expect(appOf('/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper')).toBe('Visual Studio Code')
  expect(appOf('/usr/sbin/cfprefsd')).toBe('macOS')
  expect(appOf('/opt/homebrew/bin/node')).toBe('node')
  expect(appOf('kernel_task')).toBe('kernel_task')
})

test('the GPU\'s clients are read one by one', () => {
  const head = (id: string) => `+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id ${id}\n`
  const clients = parseGpuClients(
    `${head('0xa')}"accumulatedGPUTime"=10\n"accumulatedGPUTime"=2\n"IOUserClientCreator" = "pid 7\n` +
      `${head('0xb')}"accumulatedGPUTime"=5\n"IOUserClientCreator" = "pid 7\n${head('0xc')}"accumulatedGPUTime"=3\n`,
  )
  // Client by client, never one total per process; one with no process is left out
  expect([...clients]).toEqual([
    ['0xa', { pid: '7', time: 12 }],
    ['0xb', { pid: '7', time: 5 }],
  ])
})

test('the top apps: one per app, in percent of the machine, never above its total', () => {
  const { stats, procs } = parseMac(macOut(0))
  const apps = topApps(procs, stats, new Map([['101', 20]]), 3)
  // Claude, its helpers and the claude CLI count as one app; 112% of one core out of 16
  expect(apps[0]).toEqual({ name: 'Claude', cpu: 7, gpu: 20, ram: 3.5 })
  expect(apps.map(a => a.name)).toEqual(['Claude', 'Google Chrome', 'macOS'])
  // 10 GB of processes at most fit in 6 GB in use: each app is scaled down
  const tight = topApps(procs, { ...stats, ramUsed: 6 })
  expect(Math.round(tight.reduce((s, a) => s + (a.ram ?? 0), 0) * 10) / 10).toBe(6)
  // No GPU figures per app: none shown
  expect(topApps(procs, stats)[0]!.gpu).toBe(undefined)
  // By one column: the top apps for that column
  expect(topApps(procs, stats, undefined, 2, 'ram').map(a => a.name)).toEqual(['Google Chrome', 'Claude'])
})

test('an app keeps its color while it stays among the top ones', () => {
  const shown = [{ name: 'Claude', color: 0 }, { name: 'Chrome', color: 1 }, { name: 'Xcode', color: 2 }]
  expect(keepColors(shown, [{ name: 'Xcode' }, { name: 'Safari' }, { name: 'Claude' }]).map(a => [a.name, a.color])).toEqual([
    ['Xcode', 2],
    ['Safari', 1],
    ['Claude', 0],
  ])
  expect(keepColors(undefined, [{ name: 'A' }, { name: 'B' }]).map(a => a.color)).toEqual([0, 1])
})

test('Linux: CPU from two samples, memory from MemAvailable, an NVIDIA GPU', () => {
  const { stats: s, procs } = parseLinux(`cpu  100 0 100 800 0 0 0 0 0 0
cpu  160 0 140 900 0 0 0 0 0 0
@@
MemTotal:       16384000 kB
MemAvailable:    4096000 kB
@@
8
@@
37, NVIDIA GeForce RTX 4070
@@
  4242  12.5  1048576 firefox
`)
  // 100 busy ticks out of 200
  expect(s.cpu).toBe(50)
  expect(s.gpu).toBe(37)
  expect(s.gpuName).toBe('RTX 4070')
  expect(Math.round(s.ramUsed! * 10) / 10).toBe(11.7)
  expect(s.cores).toBe(8)
  // ps's %cpu on Linux is an average since start: memory only
  expect(procs).toEqual([{ pid: '4242', cpu: undefined, ram: 1, app: 'firefox' }])
})

test('Linux without a GPU tool: no GPU figure', () => {
  const { stats: s } = parseLinux('cpu 1 0 1 8 0 0 0 0\ncpu 2 0 2 9 0 0 0 0\n@@\nMemTotal: 1000 kB\nMemAvailable: 500 kB\n@@\n4\n@@\n')
  expect(s.gpu).toBe(undefined)
})

test('Windows: load, memory, the 3D engines, and each app\'s CPU, GPU and memory', () => {
  // Over 1.25 s: chrome gained 0.5 s of processor time (40% of one core), the
  // GPU counters gave pid 11 two engines; a name may hold a comma
  const { stats: s, procs, gpuByPid } = parseWindows(
    '12|16777216|8388608|12|33.5|1.25|11,chrome,0.5,2147483648;12,Code,0,1073741824;13,My, App,,1073741824|11=20.5;11=3;12=1E-05\r\n',
  )
  expect(s.cpu).toBe(12)
  expect(s.gpu).toBe(33.5)
  expect(s.ramUsed).toBe(8)
  expect(s.ramTotal).toBe(16)
  expect(procs.map(p => [p.app, p.cpu, p.ram])).toEqual([['chrome', 40, 2], ['Code', 0, 1], ['My, App', 0, 1]])
  expect([...(gpuByPid ?? [])]).toEqual([['11', 23.5], ['12', 1e-5]])
  const apps = topApps(procs, s, gpuByPid)
  expect(apps[0]).toMatchObject({ name: 'chrome', gpu: 23.5, ram: 2 })
  // 40% of one core out of 12
  expect(Math.round(apps[0]!.cpu! * 100) / 100).toBe(3.33)
  // The card's name, from the last field
  expect(parseWindows('12|16777216|8388608|12|33.5|1|11,chrome,0.5,2147483648||Intel(R) UHD Graphics 770;NVIDIA GeForce RTX 3080').stats.gpuName).toBe('RTX 3080')
  // No GPU counters on this machine: no GPU column
  expect(parseWindows('12|16777216|8388608|12||1|11,chrome,0.5,2147483648|').gpuByPid).toBeUndefined()
})

test('a graphics card goes by the name people use, the dedicated one first', () => {
  expect(gpuShort('NVIDIA GeForce RTX 3080')).toBe('RTX 3080')
  expect(gpuShort('NVIDIA GeForce RTX 4090 Laptop GPU')).toBe('RTX 4090 Laptop')
  expect(gpuShort('NVIDIA RTX A4000')).toBe('RTX A4000')
  expect(gpuShort('AMD Radeon RX 6800 XT')).toBe('RX 6800 XT')
  expect(gpuShort('AMD Radeon(TM) Graphics')).toBe('Radeon Graphics')
  expect(gpuShort('AMD Radeon 780M Graphics')).toBe('Radeon 780M')
  expect(gpuShort('Intel(R) Arc(TM) A770 Graphics')).toBe('Arc A770')
  expect(gpuShort('Intel(R) Iris(R) Xe Graphics')).toBe('Iris Xe Graphics')
  expect(gpuShort('Apple M4 Max')).toBe('M4 Max')
  expect(pickGpu(['Parsec Virtual Display Adapter', 'AMD Radeon(TM) Graphics', 'NVIDIA GeForce RTX 3080'])).toBe('RTX 3080')
  expect(pickGpu(['Intel(R) UHD Graphics 770', 'AMD Radeon RX 7900 XTX'])).toBe('RX 7900 XTX')
  expect(pickGpu(['Microsoft Basic Display Adapter'])).toBeUndefined()
  expect(pickGpu([''])).toBeUndefined()
})

const mockMac = (on: any, gpu: () => number) => {
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/Users/someone' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', (_: unknown, e: { argv: string[] }) =>
    ({ value: e.argv[0] === 'sh' ? { exitCode: 0, stdout: macOut(gpu()), stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } }),
  )
}

test('the System card comes first, with each app\'s share of the machine', async ($, on) => {
  let gpu = 1e9
  mockMac(on, () => gpu)
  await setup($, on)
  await clock.advance(500)
  let ui = await $.ui.mount(PANE)
  let alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  const card = () => String(alts.find(a => a.startsWith('System:')))
  expect(card()).toBe(
    'System: CPU 25%, GPU 26%, RAM 50.8 / 64 GB. Claude: CPU 7%, RAM 3.5 GB; Google Chrome: CPU 3%, RAM 5 GB; macOS: CPU 1%, RAM 1.3 GB',
  )
  // First, by default
  expect(alts.findIndex(a => a.startsWith('System'))).toBeLessThan(alts.findIndex(a => a.startsWith('5-hour')))
  await ui.unmount()
  // The next reading comes as soon as the GPU can be measured: 0.52 s of GPU
  // time in the 2.6 s since, so Claude used 20% of the GPU, and so did the machine
  gpu += 0.52e9
  await clock.advance(2600)
  ui = await $.ui.mount(PANE)
  alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect(card()).toContain('System: CPU 25%, GPU 20%')
  expect(card()).toContain('Claude: CPU 7%, GPU 20%, RAM 3.5 GB')
  expect(card()).toContain('macOS: CPU 1%, GPU 0%')
  // Each app's figure in the color of its share, Other in grey
  const cpu = String((await ui.findAll({ type: 'Svg' })).find(x => String(x.props.alt).startsWith('CPU:'))?.props.source)
  expect(cpu.includes(encodeURIComponent(`fill="${heat(7)}"`)) || cpu.includes(`fill="${heat(7)}"`)).toBe(true)
  // The figures' columns never shrink, so each row stays level with its app;
  // no width of theirs in cells, which would push the table out of the panel
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.filter(x => x.props.flexShrink === 0).length).toBe(3)
  expect(boxes.some(x => typeof x.props.minWidth === 'number' && x.props.minWidth > 0)).toBe(false)
  await ui.unmount()
})

test('the GPU never drops to 0% for want of a measure, and its column stays', async ($, on) => {
  let gpu = 1e9
  let client = '0x1001'
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/Users/someone' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', (_: unknown, e: { argv: string[] }) =>
    ({ value: e.argv[0] === 'sh' ? { exitCode: 0, stdout: macOut(gpu, client), stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } }),
  )
  await setup($, on)
  await clock.advance(500)
  gpu += 0.52e9
  await clock.advance(2600)
  const card = async () => {
    const ui = await $.ui.mount(PANE)
    const alt = String((await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).find(a => a.startsWith('System:')))
    await ui.unmount()
    return alt
  }
  expect(await card()).toContain('Claude: CPU 7%, GPU 20%')
  // Claude closes its GPU client and opens another, which has drawn 0.38 s
  client = '0x1003'
  gpu = 0.38e9
  // The regular reading 1.9 s later is too soon to measure: the last figures stay
  await clock.advance(1900)
  expect(await card()).toContain('System: CPU 25%, GPU 20%')
  expect(await card()).toContain('Claude: CPU 7%, GPU 20%')
  // The next one measures over the 6.9 s since: Claude's share is its new
  // client's 0.38 s, not a drop to 0% for the client it closed
  await clock.advance(5000)
  expect(await card()).toContain('Claude: CPU 7%, GPU 6%')
})

test('CPU, GPU or RAM ranks the apps by that column; picked again, by all three', async ($, on) => {
  mockMac(on, () => 1e9)
  await setup($, on)
  await clock.advance(500)
  let ui = await $.ui.mount(PANE)
  const svg = async () => (await ui.findAll({ type: 'Svg' })).find(x => String(x.props.alt).startsWith('System:'))
  const order = async () => String((await svg())?.props.alt).split('. ')[1]!.split('; ').map(x => x.split(':')[0])
  const names = async () => (await ui.findAll({ type: 'Svg' })).find(x => String(x.props.source).includes('<circle cx="4"'))
  const dots = async () => [...String((await names())?.props.source).matchAll(/<circle cx="4" cy="[\d.]+" r="3.5" fill="(#[0-9a-f]{6})"/g)].map(m => m[1])
  expect(await order()).toEqual(['Claude', 'Google Chrome', 'macOS'])
  expect((await ui.find({ key: 'sort-ram' }))?.text).toBe('RAM')
  await ui.press({ key: 'sort-ram' })
  await clock.advance(0)
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await order()).toEqual(['Google Chrome', 'Claude', 'macOS'])
  // The header itself is the button, marked on the column picked
  expect((await ui.find({ key: 'sort-ram' }))?.text).toBe('RAM ▾')
  expect((await ui.find({ key: 'sort-cpu' }))?.text).toBe('CPU')
  // Each app keeps its color: Chrome stays violet though it now comes first
  expect(await dots()).toEqual(['#a78bfa', '#60a5fa', '#f472b6', '#7c7c84'])
  await ui.press({ key: 'sort-ram' })
  await clock.advance(0)
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await order()).toEqual(['Claude', 'Google Chrome', 'macOS'])
  await ui.unmount()
})

const pastOrder = async ($: any, on: any, cardOrder: string[]) => {
  mock.clock(on, { now: Date.parse('2026-11-01T00:00:00Z') })
  mock.store(on, { cardOrder })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.id', () => ({ value: 'session-test' }))
  on('command.register', () => ({ value: { command: 'conso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'customize' })
  await ui.unmount()
  const ui2 = await $.ui.mount(PANE)
  const labels = (await ui2.findAll({ type: 'Text' })).map(x => x.text).filter(x => ['Limits', 'Context', 'System', 'History', 'Agents'].includes(x))
  await ui2.unmount()
  return labels
}

test('an order saved before the System card gets it at the top', async ($, on) => {
  expect(await pastOrder($, on, ['agents', 'context', 'limits', 'history'])).toEqual(['System', 'Agents', 'Context', 'Limits', 'History'])
})

test('the former default order moves System to the top; a chosen one stays', async ($, on) => {
  expect(await pastOrder($, on, ['limits', 'context', 'system', 'history', 'agents'])).toEqual(['System', 'Limits', 'Context', 'History', 'Agents'])
})

test('an order the person chose keeps System where they put it', async ($, on) => {
  expect(await pastOrder($, on, ['context', 'limits', 'system', 'history', 'agents'])).toEqual(['Context', 'Limits', 'System', 'History', 'Agents'])
})

const mockWindows = (on: any, update?: { exitCode: number; stderr: string }) => {
  const ran: string[][] = []
  const out =
    '20|16777216|8388608|8|30|1|11,chrome,0.05,4294967296;12,Code,0.1,2147483648;13,svchost,0.02,1610612736;' +
    '14,game,0.4,1073741824;15,Discord,0,536870912|14=25;15=3;11=2\r\n'
  on('env.get', (_: unknown, e: { name: string }) => ({ value: e.name === 'APPDATA' ? 'C:\\Users\\x\\AppData\\Roaming' : undefined }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    ran.push(e.argv)
    const script = e.argv.join(' ')
    if (script.includes('Get-Process')) return { value: { exitCode: 0, stdout: out, stderr: '' } }
    if (script.includes('plugin update')) return { value: { stdout: '', ...(update ?? { exitCode: 0, stderr: '' }) } }
    return { value: { exitCode: 1, stdout: '', stderr: '' } }
  })
  return ran
}

test('on Windows, a column picked ranks the apps at once, from the last reading', async ($, on) => {
  const ran = mockWindows(on)
  await setup($, on)
  await clock.advance(500)
  let ui = await $.ui.mount(PANE)
  const order = async () =>
    String((await ui.findAll({ type: 'Svg' })).find(x => String(x.props.alt).startsWith('System:'))?.props.alt)
      .split('. ')[1]!
      .split('; ')
      .map(x => x.split(':')[0])
  // By all three: Discord, light on everything, is not among the top four
  expect(await order()).toEqual(['game', 'chrome', 'Code', 'svchost'])
  const readings = ran.length
  await ui.press({ key: 'sort-gpu' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  // Its GPU share brings it in, with no new reading
  expect(await order()).toEqual(['game', 'Discord', 'chrome', 'Code'])
  expect(ran.length).toBe(readings)
  await ui.unmount()
})

test('on Windows, Update finds Claude Code through PowerShell', async ($, on) => {
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  on('ui.toast', () => ({ value: {} }))
  const ran = mockWindows(on)
  await setup($, on)
  await clock.advance(3000)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'update' })
  await clock.advance(0)
  await ui.unmount()
  const update = ran.find(a => a.join(' ').includes('plugin update'))!
  expect(update.slice(0, 3)).toEqual(['powershell', '-NoProfile', '-Command'])
  expect(update[3]).toContain('claude-code')
  expect(update[3]).toContain('& $c plugin update conso-bar@conso-bar')
})

test('Update says so when Claude Code\'s command line is nowhere', async ($, on) => {
  const toasts: string[] = []
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: {} }
  })
  mockWindows(on, { exitCode: 127, stderr: '' })
  await setup($, on)
  await clock.advance(3000)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'update' })
  await clock.advance(0)
  await ui.unmount()
  expect(toasts).toEqual(["Update failed: Claude Code's command line was not found"])
})
