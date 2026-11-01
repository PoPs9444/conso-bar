import type { Day, Limit, Snapshot } from '../types'

// The panel cards' content, drawn in SVG to the pixel. Each card is an app Box
// (frame, background, padding) that follows the panel's width; the SVG inside
// spans the full width at a fixed height, with no viewBox: what sits on the left
// is placed in pixels, what sits on the right starts from x="100%".

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif"

export const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const num = (n: number, digits: number) => n.toFixed(digits)

// Limits arrive as whole points: no made-up decimals
const pct = (p: number) => `${Math.round(p)}%`

// Continuous green → yellow → orange → red gradient as the value nears 100%
const hsl = (h: number, sat: number, l: number) => {
  const a = (sat / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export const heat = (p: number) => {
  const t = Math.min(100, Math.max(0, p))
  const hue = t <= 50 ? 142 - (t / 50) * 92 : t <= 80 ? 50 - ((t - 50) / 30) * 22 : 28 - ((t - 80) / 20) * 28
  return hsl(hue, 85, 60)
}

const left = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const d = Math.max(0, (Date.parse(resetsAt) - now) / 1000)
  if (d >= 86400) return `${Math.floor(d / 86400)}d ${Math.floor((d % 86400) / 3600)}h`
  if (d >= 3600) return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`
  return `${Math.floor(d / 60)}m`
}

// Amounts: cents under $100, whole dollars above ($1,803 rather than $1802.55)
export const dollars = (usd: number) =>
  usd >= 100 ? `$${String(Math.round(usd)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : `$${usd.toFixed(2)}`

export const tokens = (n: number) =>
  n >= 1_000_000 ? `${num(n / 1_000_000, n % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(n / 1000)}k`

// Colors are also set as attributes: they hold even if the app strips the <style>
export const HEX: Record<string, string> = {
  green: '#4ade80', amber: '#fbbf24', red: '#f87171', blue: '#60a5fa',
  violet: '#a78bfa', teal: '#2dd4bf', slate: '#9aa4b2', gold: '#facc15', pink: '#f472b6',
}

const INLINE: Record<string, string> = {
  card: 'fill="#ffffff" fill-opacity=".035" stroke="#ffffff" stroke-opacity=".09"',
  track: 'stroke="#ffffff" stroke-opacity=".08" fill="none"',
  trackfill: 'fill="#ffffff" fill-opacity=".08"',
  t1: 'fill="#f2f2f2"', t2: 'fill="#9a9aa0"', t3: 'fill="#6e6e74"',
  up: 'fill="#4ade80"',
  divider: 'stroke="#ffffff" stroke-opacity=".07"',
  ...Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, `color="${v}"`])),
}

export const inline = (svg: string) =>
  svg.replace(/class="([\w-]+)"/g, (all, c: string) => (INLINE[c] ? `${all} ${INLINE[c]}` : all))

// Card title: a discreet label, no color
export const title = (x: number, y: number, text: string) =>
  `<text class="t2" x="${x}" y="${y}" font-size="11" font-weight="600" letter-spacing=".7">${esc(text)}</text>`

export const STYLE = `
  text { font-family: ${FONT}; }
  .card { fill: #ffffff; fill-opacity: .035; stroke: #ffffff; stroke-opacity: .09; }
  .track { stroke: #ffffff; stroke-opacity: .08; fill: none; }
  .trackfill { fill: #ffffff; fill-opacity: .08; }
  .t1 { fill: #f2f2f2; } .t2 { fill: #9a9aa0; } .t3 { fill: #6e6e74; }
  .green { color: #4ade80; } .amber { color: #fbbf24; } .red { color: #f87171; } .blue { color: #60a5fa; }
  .violet { color: #a78bfa; } .teal { color: #2dd4bf; } .slate { color: #9aa4b2; } .gold { color: #facc15; }
  .up { fill: #4ade80; }
  @media (prefers-color-scheme: light) {
    .card { fill: #000000; fill-opacity: .025; stroke: #000000; stroke-opacity: .1; }
    .track { stroke: #000000; stroke-opacity: .08; } .trackfill { fill: #000000; fill-opacity: .08; }
    .t1 { fill: #1c1c1e; } .t2 { fill: #6b6b70; } .t3 { fill: #8e8e93; }
    .green { color: #16a34a; } .amber { color: #d97706; } .red { color: #dc2626; } .blue { color: #2563eb; }
    .up { fill: #16a34a; }
  }
`

// A full-width drawing at a fixed height (the fixed height keeps the scroll in place)
export const fluid = (h: number, body: string, style = '') =>
  inline(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" overflow="visible">` +
      `<style>${STYLE}${style}</style>${body}</svg>`,
  )

// Anchored to the right edge: negative coordinates from that edge
export const right = (body: string) => `<svg x="100%" y="0" width="1" height="1" overflow="visible">${body}</svg>`

// Fades and clips what runs past the right edge, keeping `reserve` pixels free
// at the edge (for a duration drawn there): the cut follows the real width
let fadeId = 0
export const fadeRight = (h: number, reserve: number, body: string) => {
  const id = `fade${fadeId++}`
  return (
    `<defs><linearGradient id="${id}g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="${h}">` +
    `<rect x="0" y="0" width="100%" height="${h}" fill="#fff"/>` +
    `<svg x="100%" y="0" width="1" height="${h}" overflow="visible">` +
    `<rect x="${-(reserve + 18)}" y="0" width="18" height="${h}" fill="url(#${id}g)"/>` +
    (reserve > 0 ? `<rect x="${-reserve}" y="0" width="${reserve}" height="${h}" fill="#000"/>` : '') +
    `</svg></mask></defs><g mask="url(#${id})">${body}</g>`
  )
}

// Full-width bar, filled in percent
const bar = (y: number, p: number, color: string) =>
  `<rect class="trackfill" x="0" y="${y}" width="100%" height="6" rx="3"/>` +
  (p > 0 ? `<rect fill="${color}" x="0" y="${y}" width="${Math.max(1.5, Math.min(100, p)).toFixed(1)}%" height="6" rx="3"/>` : '')

const ring = (cx: number, cy: number, r: number, p: number, color: string) => {
  const c = 2 * Math.PI * r
  const on = (Math.min(100, Math.max(0, p)) / 100) * c
  return (
    `<circle class="track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="7"/>` +
    (on > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round"
          stroke-dasharray="${Math.max(0.1, on).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`
      : '')
  )
}

// Readable duration for a forecast: 3d 4h, 5h 20m, 12m
const span = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  return `${m}m`
}

// Length of each window, and the minimum hindsight before risking a forecast
const WINDOWS: Record<string, { length: number; minElapsed: number }> = {
  five_hour: { length: 5 * 3_600_000, minElapsed: 30 * 60_000 },
  seven_day: { length: 7 * 86_400_000, minElapsed: 86_400_000 },
}

// Forecast from the average since the window began (nights and breaks
// included): steady, and it moves with every passing minute
const projection = (l: Limit, now: number) => {
  const w = WINDOWS[l.kind]
  if (!w || !l.resetsAt) return undefined
  const reset = Date.parse(l.resetsAt)
  const elapsed = now - (reset - w.length)
  if (elapsed < w.minElapsed) {
    return { text: `Forecast in ${span(w.minElapsed - elapsed)}`, color: '#6e6e74' }
  }
  const atReset = (l.percentUsed / elapsed) * w.length
  if (atReset < 100) {
    return { text: `≈ ${Math.round(atReset)}% at reset`, color: heat(atReset) }
  }
  const eta = ((100 - l.percentUsed) / l.percentUsed) * elapsed
  return { text: `100% in ≈ ${span(eta)}`, color: heat(100) }
}

// A limit: gauge on the left; on the right the title and time to reset, then
// the session cost (weekly card) and the forecast at the average pace
const limitCard = (name: string, l: Limit, now: number, usd?: number) => {
  const p = l.percentUsed
  const color = heat(p)
  const reset = left(l.resetsAt, now)
  const proj = projection(l, now)
  // One line per figure under the title: never two texts on the same line
  const lines = (usd !== undefined ? 1 : 0) + (proj ? 1 : 0)
  const H = lines === 2 ? 72 : 60
  const cx = 30
  const cy = H / 2
  const tx = 72
  const ty = lines === 0 ? cy + 4 : lines === 1 ? 17 : 14
  let body = ''
  if (usd !== undefined) {
    body += `<text x="${tx}" y="${lines === 2 ? 42 : 47}" font-size="22" font-weight="700" fill="${HEX.gold}">${esc(dollars(usd))}</text>`
  }
  if (proj) {
    body += `<text x="${tx}" y="${lines === 2 ? 63 : 43}" font-size="11.5" font-weight="600" fill="${proj.color}">${esc(proj.text)}</text>`
  }
  return {
    key: l.kind,
    h: H,
    alt: `${name}: ${pct(p)}${usd !== undefined ? `, cost ${dollars(usd)}` : ''}${proj ? `, ${proj.text}` : ''}`,
    svg: fluid(
      H,
      ring(cx, cy, 26, p, color) +
        `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14.5" font-weight="700" fill="${color}">${esc(pct(p))}</text>` +
        // The title fades out before the reset time; the lines below fade at the edge
      fadeRight(H, reset ? Math.ceil(reset.length * 7.2) + 10 : 0, title(tx, ty, name.toUpperCase())) +
        (reset
          ? `<text class="t2" x="100%" y="${ty}" text-anchor="end" font-size="12" font-weight="600" font-variant-numeric="tabular-nums">${esc(reset)}</text>`
          : '') +
        fadeRight(H, 0, body),
    ),
  }
}

// Cost of recent days across all sessions: today in large type, the week as bars
export const historyCard = (days: readonly Day[]) => {
  if (days.length === 0) return null
  const H = 80
  const today = days[days.length - 1]!
  const week = days.reduce((sum, d) => sum + d.usd, 0)
  const max = Math.max(...days.map(d => d.usd), 0.01)
  const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const bw = 10
  const gap = 5
  const x0 = -(days.length * bw + (days.length - 1) * gap)
  let bars = ''
  days.forEach((d, i) => {
    const h = Math.max(2, (d.usd / max) * 44)
    const x = x0 + i * (bw + gap)
    const isToday = i === days.length - 1
    bars +=
      `<rect x="${x}" y="${(60 - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="3" fill="${HEX.gold}" fill-opacity="${isToday ? 1 : 0.45}"/>` +
      `<text class="${isToday ? 't1' : 't3'}" x="${x + bw / 2}" y="76" text-anchor="middle" font-size="9.5" font-weight="600">${LETTERS[new Date(`${d.date}T12:00:00`).getDay()] ?? ''}</text>`
  })
  const svg = fluid(
    H,
    // The figures fade out before the bars when the panel gets narrow
    fadeRight(
      H,
      -x0 + 10,
      title(0, 11, 'HISTORY') +
        `<text class="t3" x="0" y="33" font-size="11">Today</text>` +
        `<text x="0" y="57" font-size="21" font-weight="700" fill="${HEX.gold}">${esc(dollars(today.usd))}</text>` +
        `<text x="0" y="76" font-size="11"><tspan class="t3">7 days  </tspan><tspan class="t1" font-weight="700">${esc(dollars(week))}</tspan></text>`,
    ) + right(bars),
  )
  return { svg, h: H, alt: `History: today ${dollars(today.usd)}, 7 days ${dollars(week)}` }
}

// The top cards: one per limit (the cost on the weekly card), or the cost alone
// when there is no limit (no subscription)
export const limitCards = (s: Snapshot, now: number) => {
  const h5 = s.limits.find(l => l.kind === 'five_hour')
  const w7 = s.limits.find(l => l.kind === 'seven_day')
  const cards = [
    h5 ? limitCard('5-hour limit', h5, now, w7 ? undefined : s.usd) : null,
    w7 ? limitCard('Weekly limit', w7, now, s.usd) : null,
  ].filter(c => c !== null)
  if (cards.length === 0 && s.usd !== undefined) {
    cards.push({
      key: 'session',
      h: 26,
      alt: `Session: ${dollars(s.usd)}`,
      svg: fluid(
        26,
        title(0, 18, 'SESSION') +
          `<text x="100%" y="20" text-anchor="end" font-size="19" font-weight="700" fill="${HEX.gold}">${esc(dollars(s.usd))}</text>`,
      ),
    })
  }
  return cards
}

// Context card content (the title and the Compact button sit above it)
export const contextCard = (s: Snapshot) => {
  if (s.tokens === undefined || s.window <= 0) return null
  const H = 44
  const cp = (s.tokens / s.window) * 100
  const color = heat(cp)
  const tokenLabel = `${tokens(s.tokens)} / ${tokens(s.window)} tokens`
  const svg = fluid(
    H,
    fadeRight(32, Math.ceil(tokenLabel.length * 6.6) + 10, `<text x="0" y="24" font-size="22" font-weight="700" fill="${color}">${esc(num(cp, 1))}%</text>`) +
      `<text x="100%" y="24" text-anchor="end" font-size="11.5"><tspan font-weight="700" fill="${color}">${esc(tokens(s.tokens))}</tspan><tspan class="t2"> / ${esc(tokens(s.window))}</tspan><tspan class="t3"> tokens</tspan></text>` +
      bar(36, cp, color),
  )
  // The title alone, drawn like the other cards' titles
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 14" width="80" height="14">` +
    `<style>${STYLE}</style>${title(0, 11, 'CONTEXT')}</svg>`
  return { svg, h: H, title: inline(head), alt: `Context: ${tokens(s.tokens)} / ${tokens(s.window)} tokens, ${num(cp, 1)}%` }
}

// "New version" banner at the top of the panel
export const updateCard = (latest: string, status: 'idle' | 'running' | 'done' | 'error', needsRestart = false) => {
  const text =
    status === 'running'
      ? `Updating to v${latest}…`
      : status === 'done'
        ? needsRestart
          ? `v${latest} installed · restart Claude Code`
          : `v${latest} installed · reloading…`
        : `New version v${latest}`
  const color = status === 'done' ? HEX.green! : HEX.blue!
  const svg = fluid(
    18,
    `<circle cx="5" cy="9" r="3.5" fill="${color}"/>` +
      `<text x="16" y="13" font-size="12.5" font-weight="600" fill="${color}">${esc(text)}</text>`,
  )
  return { svg, h: 18, alt: text }
}
