import { atom, read, update } from 'claude-code'
import type { ButtonProps, EngineInterface, Register, RenderChildren, RenderElement } from 'claude-code'

import type { AgentRun, AppSort, CardKey, Day, Lang, Limit, Snapshot, SystemStats, UpdateState } from '../types'

import { agentsCard, nextLayout } from './agents'

import { HEX, contextCard, footerLine, heat, historyCard, left, limitCards, systemCard, updateCard } from './dashboard'
import { STRINGS, toLang } from './i18n'
import type { Strings } from './i18n'
import { costOf } from './pricing'
import { LINUX, MAC, WINDOWS, keepColors, parseLinux, parseMac, parseWindows, topApps } from './system'
import type { GpuClient, Platform, Proc, Reading } from './system'

const PANE = 'conso'

// Version of this code: keep equal to `version` in .claude-plugin/plugin.json
export const VERSION = '0.28.2'
const REPO = 'PoPs9444/conso-bar'
const MARKETPLACE = 'conso-bar'
// A manual check shows its progress at least this long: a result that lands at
// once would only flicker
const MIN_CHECK_MS = 1200

const snapshot = atom({ plugin: 'conso-bar', key: 'snapshot' } as const, null)
const isCompacting = atom({ plugin: 'conso-bar', key: 'isCompacting' } as const, false)
const agents = atom({ plugin: 'conso-bar', key: 'agentRuns' } as const, [])
// The agents as the card last drew them; null until the first change, the
// card then draws the agents themselves
const agentView = atom({ plugin: 'conso-bar', key: 'agentView' } as const, null as AgentRun[] | null)
const tick = atom({ plugin: 'conso-bar', key: 'tick' } as const, 0)
const history = atom({ plugin: 'conso-bar', key: 'history' } as const, [])
const DEFAULT_ORDER: CardKey[] = ['system', 'limits', 'context', 'history', 'agents']
// The default before 0.24.0: an order nobody changed moves System to the top
const OLD_ORDER = ['limits', 'context', 'system', 'history', 'agents'].join()
const order = atom({ plugin: 'conso-bar', key: 'order' } as const, DEFAULT_ORDER)
const hidden = atom({ plugin: 'conso-bar', key: 'hidden' } as const, [] as CardKey[])
const appSort = atom({ plugin: 'conso-bar', key: 'appSort' } as const, null as AppSort | null)
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

let ticker: { at: number; cancel: () => void } | undefined

// The panel's buttons as last drawn, by surface and key. The engine numbers
// each Button it is handed and the app knows a button by that number, so a
// button made again on every redraw (each second while an agent runs) was a
// new button each time: its highlight under the pointer blinked, and a click
// sent under the old number was lost. A button that looks the same is handed
// back as it was, and its press runs the latest drawing's handler
const kept = new Map<string, { look: string; button: RenderElement; press: () => unknown }>()

// A running agent's time counts on inside its drawing: the panel is drawn
// again only when that time changes layout (at one minute, then each hour)
const syncTicker = async ($: EngineInterface, list: readonly AgentRun[]) => {
  const now = await $.clock.now()
  const waits = list.filter(a => a.status === 'running').map(a => nextLayout(now - a.startedAt))
  const at = waits.length ? now + Math.min(...waits) + 50 : undefined
  if (ticker && ticker.at === at) return
  ticker?.cancel()
  ticker = undefined
  if (at === undefined) return
  const timer = $.clock.after(at - now, () => {
    ticker = undefined
    void update($, tick, n => n + 1)
      .then(() => read($, agents))
      .then(l => syncTicker($, l))
      .catch(() => undefined)
  })
  ticker = { at, cancel: () => timer.cancel() }
}

// What the Agents card shows. Each step, tool and token of an agent would draw
// the panel again, and the app draws a button under the pointer without its
// highlight for an instant at each drawing: those details show every 5
// seconds, with the System card's reading. An agent that starts, ends or
// stops shows at once
let isViewBehind = false
const outline = (list: readonly AgentRun[]) => list.map(a => `${a.id} ${a.status} ${a.isStopping ? 1 : 0} ${a.description}`).join('\n')
const showAgents = async ($: EngineInterface, list: readonly AgentRun[]) => {
  const shown = await read($, agentView)
  if (shown !== null && outline(shown) === outline(list)) {
    isViewBehind = true
    return
  }
  isViewBehind = false
  await update($, agentView, () => [...list])
  await syncTicker($, list)
}
const catchUpAgents = async ($: EngineInterface) => {
  if (!isViewBehind) return
  isViewBehind = false
  const list = await read($, agents)
  await update($, agentView, () => [...list])
}

// Every write of the agents goes through here, then to the card
const setAgents = async ($: EngineInterface, fn: (list: AgentRun[]) => AgentRun[]) => {
  const list = await update($, agents, fn)
  await showAgents($, list)
  return list
}

const patch = async ($: EngineInterface, id: string, fn: (a: AgentRun) => AgentRun) => {
  await setAgents($, list => list.map(a => (a.id === id ? fn(a) : a)))
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
// Each GPU client's time at the last reading, to turn into a share of the interval
let lastGpu: { at: number; clients: Map<string, GpuClient> } | undefined
// The GPU is measured over 2 seconds at least: closer readings (a sort that
// reads again at once) keep the last figures
const MIN_GPU_SPAN_MS = 2000

const platformOf = async ($: EngineInterface): Promise<Platform> =>
  (platform ??= (await $.env.get('APPDATA')) ? 'windows' : (await $.fs.exists('/proc/stat')) ? 'linux' : 'mac')

// One reading of the machine's load; undefined when the machine would not say
const readSystem = async ($: EngineInterface): Promise<Reading | undefined> => {
  await platformOf($)
  const r =
    platform === 'windows'
      ? await $.process.run(['powershell', '-NoProfile', '-Command', WINDOWS], { timeoutMs: 8000 })
      : await $.process.run(['sh', '-c', platform === 'linux' ? LINUX : MAC], { timeoutMs: 8000 })
  if (r.exitCode !== 0 && !r.stdout.trim()) return undefined
  const reading = platform === 'windows' ? parseWindows(r.stdout) : platform === 'linux' ? parseLinux(r.stdout) : parseMac(r.stdout)
  return reading.stats.cpu === undefined && reading.stats.ramUsed === undefined ? undefined : reading
}

// The GPU over the time since the last reading, in percent: each client's GPU
// time gained over the time that passed, added up per process and in all. An
// average over seconds, steadier than the driver's own instant figure, which
// reads 0% between two frames of an app drawing in bursts. Nothing on the
// first reading, nor over too short a span
const gpuShares = (clients: Map<string, GpuClient> | undefined, at: number) => {
  if (!clients) return undefined
  const before = lastGpu
  if (before && at - before.at < MIN_GPU_SPAN_MS) return undefined
  lastGpu = { at, clients }
  if (!before) return undefined
  const ns = (at - before.at) * 1e6
  const byPid = new Map<string, number>()
  let total = 0
  for (const [id, c] of clients) {
    // A client opened since the last reading gained all of its time in between
    const gained = c.time - (before.clients.get(id)?.time ?? 0)
    if (gained <= 0) continue
    const share = (gained / ns) * 100
    byPid.set(c.pid, (byPid.get(c.pid) ?? 0) + share)
    total += share
  }
  return { byPid, total: Math.min(100, total) }
}

// The last reading, ready to be ranked again: a new sort shows the apps that
// use the most of that column at once, without waiting for a new reading
// (seconds on Windows)
let lastReading: { procs: Proc[]; stats: SystemStats; gpuByPid?: Map<string, number>; isGpuKept: boolean } | undefined

// The machine's load as drawn (whole percents, tenths of a GB), its top apps
// ranked by the column picked: what changes nothing on screen writes nothing
const showSystem = async ($: EngineInterface) => {
  const r = lastReading
  if (!r) return
  const before = await read($, system)
  const whole = (n: number | undefined) => (n === undefined ? undefined : Math.round(n))
  const tenth = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 10) / 10)
  const lastShare = new Map((before?.apps ?? []).map(a => [a.name, a.gpu]))
  const hadShares = before?.apps?.some(a => a.gpu !== undefined) ?? false
  const apps = keepColors(
    before?.apps,
    topApps(r.procs, r.stats, r.gpuByPid, 4, await read($, appSort)).map(a => ({
      name: a.name,
      cpu: whole(a.cpu),
      gpu: r.isGpuKept ? (hadShares ? (lastShare.get(a.name) ?? 0) : undefined) : whole(a.gpu),
      ram: tenth(a.ram),
    })),
  )
  const s = r.stats
  const shown: SystemStats = {
    ...s,
    cpu: whole(s.cpu),
    gpu: whole(s.gpu),
    ramUsed: tenth(s.ramUsed),
    ramTotal: tenth(s.ramTotal),
    apps: apps.length ? apps : undefined,
  }
  if (!same(before, shown)) await update($, system, () => shown)
}

// One reading of the machine's load
const pollSystem = async ($: EngineInterface) => {
  // A hidden System card costs nothing: no reading until it comes back
  if (isReading || (await read($, hidden)).includes('system')) return
  isReading = true
  try {
    const reading = await readSystem($)
    if (!reading) return
    const gpu = gpuShares(reading.gpuTimes, await $.clock.now())
    const before = await read($, system)
    // No span to measure the GPU over (the first reading, one right after
    // another): the GPU and each app's share stay as last shown, so the figure
    // never drops to 0% and its column never leaves
    const isGpuKept = !gpu && reading.gpuTimes !== undefined && before?.gpu !== undefined
    const stats = gpu ? { ...reading.stats, gpu: gpu.total } : isGpuKept ? { ...reading.stats, gpu: before.gpu } : reading.stats
    // macOS: each app's GPU time over the interval; Windows: the system's own
    // share by process
    lastReading = { procs: reading.procs, stats, gpuByPid: gpu?.byPid ?? reading.gpuByPid, isGpuKept }
    await showSystem($)
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
  const startedAt = await $.clock.now()
  if (isManual) {
    if ((await read($, updateState)).status === 'checking') return
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'checking', message: undefined }))
  }
  let result: (u: UpdateState) => UpdateState
  try {
    const r = await $.http.fetch(`https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`)
    if (!r.ok) throw new Error(t.githubAnswered(r.status))
    const latest = String((JSON.parse(r.text) as { version?: unknown }).version ?? '')
    if (!/^\d+(\.\d+)*$/.test(latest)) throw new Error(t.noVersion)
    // Already installed from another conversation: it only waits for the next one
    const installed = await $.store.get('installedVersion').catch(() => undefined)
    const status = !isNewer(latest, VERSION) ? 'current' : installed === latest ? 'done' : 'idle'
    result = u => (u.status === 'running' || u.status === 'done' ? u : { latest, status, message: undefined })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result = u => (isManual || u.status === 'checking' ? { ...u, status: 'error', message } : { ...u, message })
  }
  const wait = isManual ? MIN_CHECK_MS - ((await $.clock.now()) - startedAt) : 0
  if (wait > 0) $.clock.after(wait, () => void update($, updateState, result).catch(() => undefined))
  else await update($, updateState, result)
}

// Claude Code's own command line updates: the copy this engine runs from when
// it says so, the desktop app's own copy (the newest), then the one on the
// PATH. Someone with only the desktop app has no claude command, and the
// one on the PATH may be old: the first one found is used, whatever version
// of Conso is installed. Exit 127: none found
const STEPS = `plugin marketplace update ${MARKETPLACE} && "$c" plugin update conso-bar@${MARKETPLACE}`
const UPDATE_SH =
  'for c in "$CLAUDE_CODE_EXECPATH" ' +
  '"$(ls -td "$HOME/Library/Application Support/Claude/claude-code/"*/*/claude.app/Contents/MacOS/claude 2>/dev/null | head -1)" ' +
  '"$(command -v claude)" "$HOME/.local/bin/claude"; do ' +
  `if [ -n "$c" ] && [ -x "$c" ]; then "$c" ${STEPS}; exit $?; fi; done; exit 127`
const UPDATE_PS =
  '$c = @($env:CLAUDE_CODE_EXECPATH) + ' +
  "@(Get-ChildItem \"$env:APPDATA\\Claude\\claude-code\" -Recurse -Filter claude.exe -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName }) + " +
  '@(Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }) + ' +
  "@(\"$env:USERPROFILE\\.local\\bin\\claude.exe\") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1; " +
  'if (-not $c) { exit 127 }; ' +
  `& $c plugin marketplace update ${MARKETPLACE}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; ` +
  `& $c plugin update conso-bar@${MARKETPLACE}; exit $LASTEXITCODE`

// In the background: refresh the marketplace, then the plugin. Nothing
// reloads under the conversation and nothing is posted in it: the new version
// takes effect in the next one
const runUpdate = async ($: EngineInterface) => {
  const t = await words($)
  const cur = await read($, updateState)
  if (cur.status === 'running') return
  await update($, updateState, (u): UpdateState => ({ ...u, status: 'running' }))
  try {
    const argv =
      (await platformOf($)) === 'windows' ? ['powershell', '-NoProfile', '-Command', UPDATE_PS] : ['sh', '-c', UPDATE_SH]
    const r = await $.process.run(argv, { timeoutMs: 300_000 })
    if (r.exitCode === 127) throw new Error(t.noClaude)
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop() || `code ${r.exitCode}`)
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'done', message: undefined }))
    if (cur.latest) await $.store.set('installedVersion', cur.latest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, updateState, (u): UpdateState => ({ ...u, status: 'error', message }))
    $.ui.toast(t.updateFailed(message))
  }
}

// ---- Card order, kept across sessions

// A stored order missing a card (an older version) gets it back right after the
// card that comes before it by default
const normalizeOrder = (stored: unknown): CardKey[] => {
  if (Array.isArray(stored) && stored.join() === OLD_ORDER) return [...DEFAULT_ORDER]
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

// Rank the System card's apps by one column; the column picked again goes back
// to all three. The last reading is ranked again at once: the apps that use
// the most of that column come first, the next reading keeps them so
const sortApps = async ($: EngineInterface, key: AppSort) => {
  const next = await update($, appSort, cur => (cur === key ? null : key))
  await $.store.set('appSort', next)
  if (lastReading) await showSystem($)
  else $.clock.after(0, () => void pollSystem($).catch(() => undefined))
}

// Hide a card, or bring it back where it was
const toggleCard = async ($: EngineInterface, key: CardKey) => {
  const next = await update($, hidden, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))
  await $.store.set('hiddenCards', next)
}

// Update banner: only when GitHub has a newer version. Installing or
// installed, a drawing; otherwise the line to click, drawn by the panel
const updateBanner = (u: UpdateState, t: Strings) =>
  u.latest && isNewer(u.latest, VERSION) && (u.status === 'running' || u.status === 'done') ? updateCard(u.latest, u.status, t) : null

// A colored dot as a tiny drawing, before a line of text
const dot = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 18" width="8" height="18"><circle cx="4" cy="9" r="3.5" fill="${color}"/></svg>`

// A newer version on GitHub, not yet installed: one line, pressed anywhere
const canUpdate = (u: UpdateState) => !!u.latest && isNewer(u.latest, VERSION) && (u.status === 'idle' || u.status === 'error')

// What the footer says about updates after the version number, and the color
// of its dot: green up to date, blue a new version, red a failed check
const updateLine = (u: UpdateState, t: Strings): { text: string; color: string; reason?: string; isBusy?: boolean } =>
  u.status === 'checking'
    ? { text: t.checking, color: HEX.blue!, isBusy: true }
    : u.status === 'current'
      ? { text: t.upToDate, color: HEX.green! }
      : u.status === 'error' && u.message
        ? { text: t.checkFailed, color: HEX.red!, reason: u.message }
        : u.status === 'done' && u.latest
          ? { text: t.ready(u.latest), color: HEX.green! }
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
    const storedSort = await $.store.get('appSort').catch(() => undefined)
    await update($, appSort, () => (storedSort === 'cpu' || storedSort === 'gpu' || storedSort === 'ram' ? storedSort : null))
    const storedHidden = await $.store.get('hiddenCards').catch(() => undefined)
    await update($, hidden, () =>
      Array.isArray(storedHidden) ? storedHidden.filter((k): k is CardKey => DEFAULT_ORDER.includes(k as CardKey)) : [],
    )
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
    // Agents still running (after a reload): their times change layout on time
    void read($, agents)
      .then(l => syncTicker($, l))
      .catch(() => undefined)
    // The machine's load, for the panel only: a first reading right away, then
    // every 5 seconds (10 on Windows, where PowerShell starts slower)
    systemPoller?.cancel()
    systemPoller = undefined
    if (e.surface !== 'terminal') {
      $.clock.after(500, () => void pollSystem($).catch(() => undefined))
      // A second reading as soon as the GPU can be measured, not 5 seconds later
      $.clock.after(500 + MIN_GPU_SPAN_MS + 600, () => void pollSystem($).catch(() => undefined))
      // The agents' details catch up on the same beat, after the reading: one
      // drawing for both
      let beat = 0
      systemPoller = $.clock.every(5000, () => {
        const isSkipped = platform === 'windows' && beat++ % 2 === 1
        void (isSkipped ? Promise.resolve() : pollSystem($))
          .catch(() => undefined)
          .then(() => catchUpAgents($))
          .catch(() => undefined)
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
    // A card that cannot be drawn is left out: the rest of the panel still shows
    const safely = <T,>(draw: () => T, otherwise: T): T => {
      try {
        return draw()
      } catch {
        return otherwise
      }
    }
    const limits = safely(() => limitCards(s, now, t), [])
    const upd = await read($, updateState)
    const banner = safely(() => updateBanner(upd, t), null)
    const days = await read($, history)
    const hist = safely(() => historyCard(days, t), null)
    const ctx = safely(() => contextCard(s, t), null)
    const stats = await read($, system)
    const sorting = await read($, appSort)
    const sys = stats ? safely(() => systemCard(stats, t, sorting), null) : null
    const busy = await read($, isCompacting)
    const runs = (await read($, agentView)) ?? (await read($, agents))
    const ag = safely(() => agentsCard(runs, now, t), agentsCard([], now, t))

    // Every button of the panel: plain, dim at rest unless told otherwise
    const site = `${e.surface}\u0000`
    const drawn = new Set<string>()
    const button = (key: string, label: string, press: () => unknown, look: Pick<ButtonProps, 'dimColor' | 'hover'> = { dimColor: true }) => {
      const id = site + key
      const sig = JSON.stringify([label, look])
      const was = kept.get(id)
      const b = was?.look === sig ? was.button : <els.Button key={key} label={label} plain {...look} onPress={() => kept.get(id)?.press()} />
      kept.set(id, { look: sig, button: b, press })
      drawn.add(id)
      return b
    }

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
    const clearFinished = () => setAgents($, list => list.filter(a => a.status === 'running'))

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
              {button('compact', busy ? t.compacting : t.compact, compact)}
            </els.Box>,
            <els.Svg key="body" source={ctx.svg} alt={ctx.alt} height={ctx.h} />,
          ])
        : null,
      system: sys
        ? frame('sys', [
            <els.Svg key="title" source={sys.title} alt={t.system} width={sys.titleW} height={14} />,
            <els.Svg key="rings" source={sys.rings.svg} alt={sys.rings.alt} height={sys.rings.h} />,
            // The apps' table: the names, then a column per resource, its header a
            // button that ranks the apps by it (▾ on the one picked). Every column
            // sits on the same bottom line, so the rows line up
            sys.table ? (
              <els.Box key="table" flexDirection="row" alignItems="flex-end" columnGap={1}>
                <els.Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <els.Svg source={sys.table.names.svg} alt={sys.table.names.alt} height={sys.table.names.h} />
                </els.Box>
                {sys.table.columns.map(c => (
                  <els.Box key={`col-${c.key}`} flexDirection="column" alignItems="center">
                    {sys.table?.isSortable ? (
                      button(`sort-${c.key}`, sorting === c.key ? `${c.label} ▾` : c.label, () => sortApps($, c.key), {
                        dimColor: sorting !== c.key,
                      })
                    ) : (
                      <els.Text dimColor>{c.label}</els.Text>
                    )}
                    <els.Svg source={c.svg} alt={c.alt} width={c.w} height={c.h} />
                  </els.Box>
                ))}
              </els.Box>
            ) : null,
          ])
        : null,
      history: hist ? frame('hist', <els.Svg source={hist.svg} alt={hist.alt} height={hist.h} />) : null,
      agents: frame('agents', [
        <els.Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center">
          <els.Svg source={ag.head} alt={t.agents} width={ag.headW} height={14} />
          {ag.finished > 0 ? button('clear', t.clear, clearFinished) : null}
        </els.Box>,
        ag.rows.length === 0 ? <els.Svg key="empty" source={ag.empty} alt={t.noAgents} height={ag.emptyH} /> : null,
        ...ag.rows.map(r => (
          <els.Box key={r.id} flexDirection="column">
            <els.Svg source={r.top.svg} alt={r.alt} height={r.top.h} />
            <els.Box flexDirection="row" alignItems="center">
              <els.Box flexGrow={1} flexShrink={1} minWidth={0}>
                <els.Svg source={r.mid.svg} alt={r.mid.alt} height={r.mid.h} />
              </els.Box>
              {r.canStop ? button(`stop-${r.id}`, t.stop, stop(r.id)) : null}
            </els.Box>
            <els.Svg source={r.bottom.svg} alt={r.bottom.alt} height={r.bottom.h} />
          </els.Box>
        )),
      ]),
    }

    // Customize: each block gets a header with its name, ↑ ↓ to move it, and
    // Hide or Show; a hidden card keeps its place and shows its header alone
    const cardOrder = await read($, order)
    const hiddenCards = await read($, hidden)
    const customizing = await read($, isCustomizing)
    const placed = cardOrder.map((key, i) => {
      const isHidden = hiddenCards.includes(key)
      if (!customizing) return isHidden ? null : <els.Box key={`block-${key}`} flexDirection="column" gap={1}>{blocks[key]}</els.Box>
      return (
        <els.Box key={`block-${key}`} flexDirection="column" gap={1}>
          <els.Box flexDirection="row" alignItems="center" gap={1}>
            <els.Box flexGrow={1}>
              <els.Text dimColor>{isHidden ? `${t.cards[key]} · ${t.hiddenTag}` : t.cards[key]}</els.Text>
            </els.Box>
            {i > 0 ? button(`up-${key}`, '↑', () => moveCard($, key, -1)) : null}
            {i < cardOrder.length - 1 ? button(`down-${key}`, '↓', () => moveCard($, key, 1)) : null}
            {button(`${isHidden ? 'show' : 'hide'}-${key}`, isHidden ? t.show : t.hide, () => toggleCard($, key))}
          </els.Box>
          {isHidden ? null : (blocks[key] ?? <els.Text dimColor>{t.nothingYet}</els.Text>)}
        </els.Box>
      )
    })

    const toggle = (
      <els.Box key="customize-row" flexDirection="row" justifyContent="flex-end">
        {button('customize', customizing ? t.done : t.customize, () => update($, isCustomizing, v => !v))}
      </els.Box>
    )

    // Footer, centered under the cards: the two actions, then the installed
    // version with what the last update check found. Centered, a button's own
    // padding lines up with the text, and a narrow panel wraps it cleanly
    const line = updateLine(upd, t)
    const foot = footerLine(VERSION, line.text, line.color, line.reason, line.isBusy)
    const footer = (
      <els.Box key="footer" flexDirection="column">
        <els.Box flexDirection="row" flexWrap="wrap" justifyContent="center" columnGap={1}>
          {button('check-updates', t.checkUpdates, () => checkUpdate($, true))}
          {customizing ? null : button('customize', t.customize, () => update($, isCustomizing, v => !v))}
        </els.Box>
        <els.Svg key="version" source={foot.svg} alt={foot.alt} height={foot.h} />
      </els.Box>
    )

    // Every drawing has a fixed height: the panel redraws on each scroll and
    // every second while an agent runs; without a height a drawing collapses
    // for an instant and throws the scroll back to the top
    const tree = (
      <els.Box flexDirection="column" gap={1}>
        {canUpdate(upd) && upd.latest ? (
          // A new version: one line in a blue-tinted card, the whole sentence the
          // button ("New version v… · Update"), blue and underlined under the
          // pointer. Started on a timer, the press returns at once
          <els.Box
            key="update-banner"
            flexDirection="row"
            alignItems="center"
            columnGap={1}
            paddingX={2}
            paddingY={1}
            borderStyle="round"
            borderColor="rgba(96,165,250,0.35)"
            backgroundColor="rgba(96,165,250,0.08)"
          >
            <els.Svg source={dot(HEX.blue!)} alt="●" width={8} height={18} />
            {button(
              'update',
              `${t.newVersion(upd.latest)} · ${t.update}`,
              () => void $.clock.after(0, () => void runUpdate($).catch(() => undefined)),
              { hover: { color: HEX.blue, underline: true } },
            )}
          </els.Box>
        ) : banner ? (
          frame('update-banner', <els.Svg source={banner.svg} alt={banner.alt} height={banner.h} />)
        ) : null}
        {/* While customizing, Done sits at the top, in reach right away */}
        {customizing ? toggle : null}
        {placed}
        {footer}
      </els.Box>
    )
    // The buttons this drawing no longer has are let go
    for (const id of kept.keys()) if (id.startsWith(site) && !drawn.has(id)) kept.delete(id)
    return tree
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
        prompt: (e.prompt ?? '').slice(0, 200),
        usd: 0,
        description: e.description ?? '',
        type: e.subagentType || 'Agent',
        model: r.model,
        status: 'running',
        startedAt: now,
        steps: 0,
        outputTokens: 0,
      }
      await setAgents($, cur => {
        const seen = cur.find(a => a.id === run.id)
        // Already seen through its first step: just give it its name
        if (seen) return cur.map(a => (a === seen ? { ...a, description: run.description, type: run.type, prompt: run.prompt } : a))
        return [...cur, run].slice(-50)
      })
    }
    return r
  })

  // An agent starts with its prompt: that is what links it to its launch, even
  // when several agents of the same model start together
  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const head = e.text.slice(0, 200)
      await setAgents($, list => {
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
      a.isStopping ? a : { ...a, model: e.model || a.model, effort: e.effort ?? a.effort, steps: a.steps + 1 }
    const list = await setAgents($, cur => {
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
