import { expect, mock, test } from 'claude-code/testing'

import { VERSION } from '../hooks/register'

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
  expect(alts).toContain('5-hour limit: 42%, 100% in ≈ 2h 46m')
  expect(alts).toContain('Weekly limit: 61%, cost $1.23, 100% in ≈ 1d 22h')
  const source = svgs.map(x => String(x.props.source)).join('')
  expect(source.includes('>3h 0m<')).toBe(true)
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
  expect(main?.props.alt).toBe('Weekly limit: 9%, cost $1.23, ≈ 21% at reset')
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

test('a newer version on GitHub shows the update banner', async ($, on) => {
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: '{ "version": "99.0.0" }' } }))
  await setup($, on)
  // The startup check runs 3 seconds after the session starts
  await clock.advance(3000)
  const ui = await $.ui.mount(PANE)
  const alts = (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt))
  expect(alts).toContain('New version v99.0.0')
  expect((await ui.find({ key: 'update' }))?.text).toBe('Update')
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
  expect(await ui2.find({ key: 'up-limits' })).toBe(undefined)
  await ui2.press({ key: 'down-limits' })
  await ui2.unmount()
  const ui3 = await $.ui.mount(PANE)
  // Limits moved below Context: it now has an up arrow
  expect((await ui3.find({ key: 'up-limits' }))?.text).toBe('↑')
  await ui3.unmount()
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
  expect(await footer()).toBe('v' + VERSION + ' · Up to date')
  reply = { ok: false, status: 503, text: '' }
  await ui.press({ key: 'check-updates' })
  await ui.unmount()
  ui = await $.ui.mount(PANE)
  expect(await footer()).toBe('v' + VERSION + ' · Update check failed: GitHub answered 503')
  await ui.unmount()
})

test('Update installs the new version, then reloads the plugins', async ($, on) => {
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
  await setup($, on)
  await clock.advance(3000)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'update' })
  await ui.unmount()
  expect(ran).toEqual([
    ['claude', 'plugin', 'marketplace', 'update', 'conso-bar'],
    ['claude', 'plugin', 'update', 'conso-bar@conso-bar'],
  ])
  expect(commands).toContain('reload-plugins')
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
  expect(alts).toContain('Limite 5 h: 42%, 100% dans ≈ 2h 46min')
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
  const fills = [...String(hist?.props.source).matchAll(/<rect x="-?[\d.]+" y="[\d.]+" width="10" height="[\d.]+" rx="3" fill="(#[0-9a-f]{6})"/g)].map(m => m[1])
  expect(fills.length).toBe(7)
  // The heaviest day is red, a light day is green
  expect(fills[4]).toBe('#f04242')
  expect(fills[5]).toBe('#42f067')
  await ui.unmount()
})
