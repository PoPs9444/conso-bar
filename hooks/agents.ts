import type { AgentRun } from '../types'

import { HEX, STYLE, esc, fadeRight, fluid, heat, inline, num, title, titleWidth } from './dashboard'
import type { Strings } from './i18n'

// Live agents card: model, effort, duration, activity, cost


// claude-opus-5-5 → Opus 5.5; an alias or an unknown name stays as it is
export const modelName = (id: string) => {
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

const compactNum = (n: number) => (n >= 1000 ? `${num(n / 1000, n >= 10_000 ? 0 : 1)}k` : String(n))

// Small amounts: enough decimals to stay readable
const money = (usd: number) => (usd >= 1 ? usd.toFixed(2) : usd >= 0.01 ? usd.toFixed(3) : usd.toFixed(4))

const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)

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
  // The title fades out before the duration, at the drawing's real width
  // (11.5 px semibold ≈ 7 px per character, rounded up to stay clear)
  const sideW = Math.ceil(side.length * 7) + 10

  const top =
    (o > 0 ? `<line class="divider" x1="0" x2="100%" y1="0.5" y2="0.5"/>` : '') +
    status(a.status, 8, o + 9) +
    fadeRight(
      o + 18,
      sideW,
      `<text class="${running ? 't1' : 't2'}" x="24" y="${o + 13}" font-size="13" font-weight="600">${esc(clip(a.description || a.type, 90))}</text>`,
    ) +
    `<text x="100%" y="${o + 13}" text-anchor="end" font-size="11.5" font-weight="600" font-variant-numeric="tabular-nums" fill="${running ? HEX.green : a.status === 'done' ? '#6e6e74' : HEX.red}">${esc(side)}</text>`

  const dim = running ? '' : ' fill-opacity=".65"'
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
    `<tspan font-weight="700" fill="${familyColor(a.model)}"${dim}>${esc(modelName(a.model))}</tspan>` +
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
      alt: `${modelName(a.model)}${eff ? `, ${eff}` : ''}`,
    },
    bottom: { svg: fluid(17, bottom, AGENT_STYLE), h: 17, alt: activity },
  }
}

// The card itself is a Box (to hold Clear and the Stop buttons): here the title
// with the counter, and one drawing per agent, from the most active to the oldest
export const agentsCard = (agents: readonly AgentRun[], now: number, t: Strings) => {
  const running = agents.filter(a => a.status === 'running')
  const finished = agents.filter(a => a.status !== 'running')
  const shown = [...running, ...[...finished].reverse()]

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
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${headW} 14" width="${headW}" height="14">` +
    `<style>${STYLE}</style>${title(0, 11, name)}${count}</svg>`

  const rows = shown.map((a, i) => ({
    id: a.id,
    canStop: a.status === 'running' && !a.isStopping,
    ...rowParts(a, i > 0 ? 12 : 0, now, t),
    alt: `${a.description || a.type}: ${modelName(a.model)}${a.effort !== undefined ? `, ${effortName(a.effort, t)}` : ''}, ${statusName(a.status, t)}`,
  }))

  const empty = fluid(18, `<text class="t3" x="0" y="13" font-size="12">${esc(t.noAgents)}</text>`)

  return { head: inline(head), headW, rows, empty, emptyH: 18, finished: finished.length }
}
