import type { AgentRun } from '../types'

import { HEX, drawing, esc, fadeRight, fluid, heat, num, title, titleWidth } from './dashboard'
import type { Strings } from './i18n'

// Live agents card: model, effort, duration, activity, cost


// claude-opus-5-5 → Opus 5.5; an alias or an unknown name stays as it is
export const modelName = (id: string | undefined) => {
  if (!id) return ''
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(id)
  if (!m || !m[1] || !m[2]) return id.replace(/^claude-/, '')
  const family = m[1][0]!.toUpperCase() + m[1].slice(1).toLowerCase()
  return `${family} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}`
}

// The effort in two parts: the level (colored) and the word "effort" (white),
// in the language's order; a thinking budget or an unknown level in one part
const effortParts = (e: string | number | undefined, t: Strings) => {
  if (e === undefined) return undefined
  if (typeof e === 'number') return { level: `${t.thinking} ${Math.round(e / 1000)}k` }
  const level = (t.effort as Record<string, unknown>)[e]
  if (typeof level !== 'string' || e === 'word' || e === 'isWordFirst') return { level: e }
  return { level, word: t.effort.word }
}

export const effortName = (e: string | number | undefined, t: Strings) => {
  const p = effortParts(e, t)
  if (!p) return undefined
  if (!p.word) return p.level
  return t.effort.isWordFirst ? `${p.word} ${p.level}` : `${p.level} ${p.word}`
}

export const duration = (ms: number, u: Strings['units']) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}${u.s}`
  if (s < 3600) return `${Math.floor(s / 60)}${u.m} ${String(s % 60).padStart(2, '0')}${u.s}`
  return `${Math.floor(s / 3600)}${u.h} ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}${u.m}`
}

// A running agent's time, counting on by itself. Each digit is drawn with all
// its values, and an animation shows the one of the moment, started at the
// time already gone by. So the panel is not drawn again every second (the app
// draws a button under the pointer without its highlight for an instant at
// each drawing). The layout changes at one minute and at each hour: the panel
// is drawn again then
const fixed = (n: number) => String(Math.round(n * 1e5) / 1e5)
const digit = (values: readonly string[], step: number, elapsed: number) => {
  const n = values.length
  const cycle = n * step
  const at = fixed(elapsed % cycle)
  return values
    .map((v, k) => {
      const [shown, times] =
        k === 0 ? ['inline;none', `0;${fixed(1 / n)}`] : k === n - 1 ? ['none;inline', `0;${fixed(k / n)}`] : ['none;inline;none', `0;${fixed(k / n)};${fixed((k + 1) / n)}`]
      return (
        `<tspan display="none">${v}<animate attributeName="display" values="${shown}" keyTimes="${times}" calcMode="discrete" ` +
        `dur="${cycle}s" begin="-${at}s" repeatCount="indefinite"/></tspan>`
      )
    })
    .join('')
}
const TENS = ['0', '1', '2', '3', '4', '5']
const UNITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
// A leading ten that is zero is not written: 7s, 9min 05s
const LEAD = ['', '1', '2', '3', '4', '5']

export const liveDuration = (ms: number, u: Strings['units']) => {
  const e = Math.max(0, ms / 1000)
  if (e < 60) return `${digit(LEAD, 10, e)}${digit(UNITS, 1, e)}${esc(u.s)}`
  if (e < 3600) return `${digit(LEAD, 600, e)}${digit(UNITS, 60, e)}${esc(u.m)} ${digit(TENS, 10, e)}${digit(UNITS, 1, e)}${esc(u.s)}`
  return `${Math.floor(e / 3600)}${esc(u.h)} ${digit(TENS, 600, e)}${digit(UNITS, 60, e)}${esc(u.m)}`
}

// When a running time next changes layout (one minute, each hour), in ms
export const nextLayout = (ms: number) => {
  const e = Math.max(0, ms / 1000)
  const next = e < 60 ? 60 : e < 3600 ? 3600 : (Math.floor(e / 3600) + 1) * 3600
  return (next - e) * 1000
}

const compactNum = (n: number) => (n >= 1000 ? `${num(n / 1000, n >= 10_000 ? 0 : 1)}k` : String(n))

// Small amounts: enough decimals to stay readable
const money = (usd: number) => (usd >= 1 ? usd.toFixed(2) : usd >= 0.01 ? usd.toFixed(3) : usd.toFixed(4))

const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)

// Rows drawn at most; the rest are counted on one line
export const MAX_ROWS = 10

const AGENT_STYLE = `
  .violet { color: #a78bfa; } .slate { color: #9aa4b2; } .teal { color: #2dd4bf; }
  .divider { stroke: #ffffff; stroke-opacity: .07; }
  @media (prefers-color-scheme: light) {
    .violet { color: #7c3aed; } .slate { color: #64748b; } .teal { color: #0d9488; }
    .divider { stroke: #000000; stroke-opacity: .07; }
  }
`

const EFFORT_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

const effortLevel = (e: string | number | undefined) =>
  e === undefined ? 0 : typeof e === 'number' ? Math.min(5, Math.max(1, Math.ceil(e / 8000))) : (EFFORT_LEVEL[e] ?? 0)

// Low = green, max = red
const effortColor = (level: number) => heat((level - 1) * 25)

// Fable in red: it is the most expensive model
const familyColor = (model: string) =>
  /fable|mythos/i.test(model)
    ? HEX.red!
    : /opus/i.test(model)
      ? HEX.violet!
      : /sonnet/i.test(model)
        ? HEX.blue!
        : /haiku/i.test(model)
          ? HEX.teal!
          : HEX.slate!

const statusName = (st: AgentRun['status'], t: Strings) =>
  st === 'running' ? t.status.running : st === 'done' ? t.status.done : st === 'failed' ? t.status.failed : t.status.aborted

// Status indicator, drawn fully inside the drawing (nothing spills on the left):
// running, a solid dot in a thin ring; done, a check mark; stopped or failed,
// a cross
const status = (st: AgentRun['status'], cx: number, cy: number) => {
  if (st === 'running') {
    return (
      `<circle cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="${HEX.green}" stroke-opacity=".35" stroke-width="1.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${HEX.green}"/>`
    )
  }
  if (st === 'done') {
    return (
      `<circle cx="${cx}" cy="${cy}" r="7" fill="#ffffff" fill-opacity=".07"/>` +
      `<path d="M${cx - 3} ${cy + 0.2} l2.1 2.2 l4 -4.4" fill="none" stroke="#9a9aa0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    )
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="7" fill="${HEX.red}" fill-opacity=".14"/>` +
    `<path d="M${cx - 2.5} ${cy - 2.5} l5 5 M${cx + 2.5} ${cy - 2.5} l-5 5" stroke="${HEX.red}" stroke-width="1.6" stroke-linecap="round"/>`
  )
}

// An agent row in three drawings: title and duration, model and effort (the
// Stop button sits to its right), then the activity. o shifts the first one
// down, for the divider.
const rowParts = (a: AgentRun, o: number, now: number, t: Strings) => {
  const running = a.status === 'running'
  const time = duration((a.endedAt ?? now) - a.startedAt, t.units)

  const side = running ? (a.isStopping ? `${t.status.stopping} · ${time}` : time) : `${statusName(a.status, t)} · ${time}`
  // A running time counts on by itself, drawn with its prefix when stopping
  const sideSvg = running
    ? `${a.isStopping ? `${esc(t.status.stopping)} · ` : ''}${liveDuration(now - a.startedAt, t.units)}`
    : esc(side)
  // The title fades out before the duration, at the drawing's real width
  // (11.5 px semibold ≈ 7 px per character, rounded up to stay clear; a
  // running time may gain a digit before the next drawing)
  const sideW = Math.ceil((side.length + (running ? 1 : 0)) * 7) + 10

  const top =
    (o > 0 ? `<line class="divider" x1="0" x2="100%" y1="0.5" y2="0.5"/>` : '') +
    status(a.status, 8, o + 9) +
    fadeRight(
      o + 18,
      sideW,
      `<text class="${running ? 't1' : 't2'}" x="24" y="${o + 13}" font-size="13" font-weight="600">${esc(clip(a.description || a.type, 90))}</text>`,
    ) +
    `<text x="100%" y="${o + 13}" text-anchor="end" font-size="11.5" font-weight="600" font-variant-numeric="tabular-nums" fill="${running ? HEX.green : a.status === 'done' ? '#6e6e74' : HEX.red}">${sideSvg}</text>`

  const dim = running ? '' : ' fill-opacity=".65"'
  // No model told (none came with the agent's steps): its type in its place
  const model = modelName(a.model) || a.type
  const sep = `<tspan class="t3">  ·  </tspan>`
  const eff = effortName(a.effort, t)
  const parts = effortParts(a.effort, t)
  const level = parts
    ? `<tspan font-weight="600" fill="${effortColor(effortLevel(a.effort))}"${dim}>${esc(parts.level)}</tspan>`
    : ''
  const word = parts?.word ? `<tspan class="t1" font-weight="600"${dim}>${esc(parts.word)}</tspan>` : ''
  const mid = fadeRight(
    20,
    0,
    `<text x="24" y="15" font-size="12">` +
    `<tspan font-weight="700" fill="${familyColor(a.model)}"${dim}>${esc(model)}</tspan>` +
    // Only the level takes its color, the word "effort" stays white
    (parts ? sep + (word ? (t.effort.isWordFirst ? `${word} ${level}` : `${level} ${word}`) : level) : '') +
      `</text>`,
  )

  // Most important first: on a narrow panel the end of the line fades out
  const bits = [
    running && a.lastTool ? `<tspan class="t1" font-weight="600">▸ ${esc(a.lastTool)}</tspan>` : '',
    a.usd > 0 ? `<tspan font-weight="700" fill="${HEX.gold}">≈ $${esc(money(a.usd))}</tspan>` : '',
    a.outputTokens > 0
      ? `<tspan class="t1" font-weight="600">${esc(compactNum(a.outputTokens))}</tspan><tspan class="t3"> ${esc(t.tokens)}</tspan>`
      : '',
    `<tspan class="t1" font-weight="600">${a.steps}</tspan><tspan class="t3"> ${esc(t.step(a.steps))}</tspan>`,
  ].filter(Boolean)
  const bottom = fadeRight(17, 0, `<text x="24" y="13" font-size="11"${dim}>${bits.join('<tspan class="t3">  ·  </tspan>')}</text>`)

  // Every drawing has its alt text: the app does not show a Svg without one
  const activity = [
    running && a.lastTool ? a.lastTool : '',
    a.usd > 0 ? `≈ $${money(a.usd)}` : '',
    a.outputTokens > 0 ? `${compactNum(a.outputTokens)} ${t.tokens}` : '',
    `${a.steps} ${t.step(a.steps)}`,
  ]
    .filter(Boolean)
    .join(', ')
  return {
    top: { svg: fluid(o + 18, top, AGENT_STYLE), h: o + 18 },
    mid: {
      svg: fluid(20, mid, AGENT_STYLE),
      h: 20,
      alt: `${model}${eff ? `, ${eff}` : ''}`,
    },
    bottom: { svg: fluid(17, bottom, AGENT_STYLE), h: 17, alt: activity },
  }
}

// A record an event left a field out of (a workflow's agent, a step with no
// model, a record from an older version): every field the row is drawn by
const sound = (a: AgentRun, now: number): AgentRun => ({
  ...a,
  id: String(a.id),
  description: typeof a.description === 'string' ? a.description : '',
  type: typeof a.type === 'string' && a.type ? a.type : 'Agent',
  model: typeof a.model === 'string' ? a.model : '',
  startedAt: Number.isFinite(a.startedAt) ? a.startedAt : now,
  steps: Number.isFinite(a.steps) ? a.steps : 0,
  outputTokens: Number.isFinite(a.outputTokens) ? a.outputTokens : 0,
  usd: Number.isFinite(a.usd) ? a.usd : 0,
})

// The card itself is a Box (to hold Clear and the Stop buttons): here the title
// with the counter, and one drawing per agent, from the most active to the oldest
export const agentsCard = (list: readonly AgentRun[], now: number, t: Strings) => {
  const agents = list.map(a => sound(a, now))
  const running = agents.filter(a => a.status === 'running')
  const finished = agents.filter(a => a.status !== 'running')
  // The running ones first, then the latest finished, up to a panel's worth:
  // every row is a few drawings, and a long session would make each redraw heavy
  const ordered = [...running, ...[...finished].reverse()]
  const shown = ordered.slice(0, MAX_ROWS)
  const hiddenCount = ordered.length - shown.length

  // The counter right after the title, whatever the title's length
  const name = t.agents.toUpperCase()
  const cx = titleWidth(name) + 8
  const label = running.length > 0 ? t.running(running.length) : finished.length > 0 ? t.finished(finished.length) : ''
  const count =
    running.length > 0
      ? `<text class="up" x="${cx}" y="11" font-size="11" font-weight="600">${esc(label)}</text>`
      : label
        ? `<text class="t3" x="${cx}" y="11" font-size="11">${esc(label)}</text>`
        : ''
  const headW = cx + Math.ceil(label.length * 6.6) + 4
  const head = drawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${headW} 14" width="${headW}" height="14">`, title(0, 11, name) + count)

  // A row that cannot be drawn is left out, never the whole panel
  let drawn = 0
  const rows = shown.flatMap(a => {
    try {
      const row = {
        id: a.id,
        canStop: a.status === 'running' && !a.isStopping,
        ...rowParts(a, drawn > 0 ? 12 : 0, now, t),
        alt: `${a.description || a.type}: ${modelName(a.model) || a.type}${a.effort !== undefined ? `, ${effortName(a.effort, t)}` : ''}, ${statusName(a.status, t)}`,
      }
      drawn++
      return [row]
    } catch {
      return []
    }
  })

  const empty = fluid(18, `<text class="t3" x="0" y="13" font-size="12">${esc(t.noAgents)}</text>`)
  const more = hiddenCount > 0
    ? { svg: fluid(16, `<text class="t3" x="24" y="12" font-size="11.5">${esc(t.moreAgents(hiddenCount))}</text>`), h: 16, alt: t.moreAgents(hiddenCount) }
    : null

  return { head, headW, rows, more, empty, emptyH: 18, finished: finished.length }
}
