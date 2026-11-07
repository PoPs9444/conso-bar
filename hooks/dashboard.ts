import type { AppLoad, AppSort, Day, Limit, Snapshot, SystemStats } from '../types'

import type { Strings } from './i18n'

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

export const left = (resetsAt: string | undefined, now: number, u: Strings['units']) => {
  if (!resetsAt) return ''
  const d = Math.max(0, (Date.parse(resetsAt) - now) / 1000)
  if (d >= 86400) return `${Math.floor(d / 86400)}${u.d} ${Math.floor((d % 86400) / 3600)}${u.h}`
  if (d >= 3600) return `${Math.floor(d / 3600)}${u.h} ${Math.floor((d % 3600) / 60)}${u.m}`
  return `${Math.floor(d / 60)}${u.m}`
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

// Width of a title in capitals (11 px semibold, spaced), rounded up to stay clear
export const titleWidth = (text: string) => Math.ceil(text.length * 8.6) + 4

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

// Short stable hash: the same drawing always gets the same ids, so a redraw
// with nothing new hands the app the very same source and it repaints nothing
const hash = (t: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

// Fades and clips what runs past the right edge, keeping `reserve` pixels free
// at the edge (for a duration drawn there): the cut follows the real width
export const fadeRight = (h: number, reserve: number, body: string) => {
  const id = `f${hash(`${h}|${reserve}|${body}`)}`
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

// Full-width bar, filled in percent. The green-to-red scale spans the whole
// track, so the fill shows it up to where it stops: green on the left, and a
// tip that turns red as it nears the right end
const SCALE = [0, 25, 50, 65, 80, 90, 100]
  .map(p => `<stop offset="${p}%" stop-color="${heat(p)}"/>`)
  .join('')
const bar = (y: number, p: number, h = 6) =>
  `<defs><linearGradient id="heatbar" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100%" y2="0">${SCALE}</linearGradient></defs>` +
  `<rect class="trackfill" x="0" y="${y}" width="100%" height="${h}" rx="${h / 2}"/>` +
  (p > 0 ? `<rect fill="url(#heatbar)" x="0" y="${y}" width="${Math.max(1.5, Math.min(100, p)).toFixed(1)}%" height="${h}" rx="${h / 2}"/>` : '')

const ring = (cx: number, cy: number, r: number, p: number, color: string, w = 7) => {
  const c = 2 * Math.PI * r
  const on = (Math.min(100, Math.max(0, p)) / 100) * c
  return (
    `<circle class="track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="${w}"/>` +
    (on > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"
          stroke-dasharray="${Math.max(0.1, on).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`
      : '')
  )
}

// Readable duration for a forecast: 3d 4h, 5h 20m, 12m
const span = (ms: number, u: Strings['units']) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}${u.d} ${Math.floor((m % 1440) / 60)}${u.h}`
  if (m >= 60) return `${Math.floor(m / 60)}${u.h} ${String(m % 60).padStart(2, '0')}${u.m}`
  return `${m}${u.m}`
}

// Length of each window, and the minimum hindsight before risking a forecast
const WINDOWS: Record<string, { length: number; minElapsed: number }> = {
  five_hour: { length: 5 * 3_600_000, minElapsed: 30 * 60_000 },
  seven_day: { length: 7 * 86_400_000, minElapsed: 86_400_000 },
}

// Forecast from the average since the window began (nights and breaks
// included): steady, and it moves with every passing minute
const projection = (l: Limit, now: number, t: Strings) => {
  const w = WINDOWS[l.kind]
  if (!w || !l.resetsAt) return undefined
  const reset = Date.parse(l.resetsAt)
  const elapsed = now - (reset - w.length)
  if (elapsed < w.minElapsed) {
    return { text: t.forecastIn(span(w.minElapsed - elapsed, t.units)), color: '#6e6e74' }
  }
  const atReset = (l.percentUsed / elapsed) * w.length
  if (atReset < 100) {
    return { text: t.atReset(Math.round(atReset)), color: heat(atReset) }
  }
  const eta = ((100 - l.percentUsed) / l.percentUsed) * elapsed
  return { text: t.fullIn(span(eta, t.units)), color: heat(100) }
}

// Cost of recent days across all sessions, kept small: the title, then today
// and the week on one line, and the week as small bars on the right. Each bar
// takes its color from what the day cost next to the week's biggest day
export const historyCard = (days: readonly Day[], t: Strings) => {
  if (days.length === 0) return null
  const H = 34
  const today = days[days.length - 1]!
  const week = days.reduce((sum, d) => sum + d.usd, 0)
  const max = Math.max(...days.map(d => d.usd), 0.01)
  const color = (usd: number) => heat((usd / max) * 100)
  const bw = 6
  const gap = 3
  const x0 = -(days.length * bw + (days.length - 1) * gap)
  let bars = ''
  days.forEach((d, i) => {
    const h = Math.max(2, (d.usd / max) * 28)
    const isToday = i === days.length - 1
    bars += `<rect x="${x0 + i * (bw + gap)}" y="${(32 - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="2" fill="${color(d.usd)}" fill-opacity="${isToday ? 1 : 0.75}"/>`
  })
  const svg = fluid(
    H,
    // The figures fade out before the bars when the panel gets narrow
    fadeRight(
      H,
      -x0 + 12,
      title(0, 11, t.history.toUpperCase()) +
        `<text x="0" y="30" font-size="12"><tspan class="t3">${esc(t.today)}  </tspan><tspan font-weight="700" fill="${color(today.usd)}">${esc(dollars(today.usd))}</tspan>` +
        `<tspan class="t3">   ${esc(t.week)}  </tspan><tspan class="t1" font-weight="700">${esc(dollars(week))}</tspan></text>`,
    ) + right(bars),
  )
  return { svg, h: H, alt: `${t.history}: ${t.today} ${dollars(today.usd)}, ${t.week} ${dollars(week)}` }
}

// Both limits in one card: a small ring per limit, its name and the time to
// reset, then the forecast at the average pace; the session cost on the title
// line. Without a limit (no subscription), the session cost alone
export const limitCards = (s: Snapshot, now: number, t: Strings) => {
  const rows = (['five_hour', 'seven_day'] as const).flatMap(kind => {
    const l = s.limits.find(x => x.kind === kind)
    return l ? [{ kind, l }] : []
  })
  if (rows.length === 0) {
    if (s.usd === undefined) return []
    return [
      {
        key: 'session',
        h: 26,
        alt: `${t.session}: ${dollars(s.usd)}`,
        svg: fluid(
          26,
          title(0, 18, t.session.toUpperCase()) +
            `<text x="100%" y="20" text-anchor="end" font-size="19" font-weight="700" fill="${HEX.gold}">${esc(dollars(s.usd))}</text>`,
        ),
      },
    ]
  }
  const TOP = 24
  const ROW = 42
  const GAP = 10
  const H = TOP + rows.length * ROW + (rows.length - 1) * GAP
  const cost = s.usd === undefined ? '' : dollars(s.usd)
  let body =
    title(0, 11, t.cards.limits.toUpperCase()) +
    (cost
      ? `<text x="100%" y="11" text-anchor="end" font-size="11.5"><tspan class="t3">${esc(t.session)}  </tspan><tspan font-weight="700" fill="${HEX.gold}">${esc(cost)}</tspan></text>`
      : '')
  const alts: string[] = []
  rows.forEach(({ kind, l }, i) => {
    const y = TOP + i * (ROW + GAP)
    const p = l.percentUsed
    const color = heat(p)
    const reset = left(l.resetsAt, now, t.units)
    const proj = projection(l, now, t)
    const ny = proj ? y + 17 : y + 26
    body +=
      ring(21, y + 21, 18, p, color, 5.5) +
      `<text x="21" y="${y + 25}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${esc(pct(p))}</text>` +
      // The name fades out before the reset time, the forecast at the edge
      fadeRight(
        H,
        reset ? Math.ceil(reset.length * 7.2) + 10 : 0,
        `<text class="t1" x="52" y="${ny}" font-size="12.5" font-weight="600">${esc(t.limitNames[kind])}</text>`,
      ) +
      (reset
        ? `<text class="t2" x="100%" y="${ny}" text-anchor="end" font-size="12" font-weight="600" font-variant-numeric="tabular-nums">${esc(reset)}</text>`
        : '') +
      (proj ? fadeRight(H, 0, `<text x="52" y="${y + 35}" font-size="11.5" font-weight="600" fill="${proj.color}">${esc(proj.text)}</text>`) : '')
    alts.push(`${kind === 'five_hour' ? t.fiveHour : t.weekly}: ${pct(p)}${proj ? `, ${proj.text}` : ''}`)
  })
  if (cost) alts.push(`${t.session}: ${cost}`)
  return [{ key: 'limits', h: H, alt: alts.join('. '), svg: fluid(H, body) }]
}

// One color per app in the System card, in the order they hold, and a quieter
// one for all the others. None of them is green-to-red, kept for the load itself
export const APP_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf']
const OTHER_COLOR = '#7c7c84'

// A ring cut into quarters, one per app, end to end from the top, with a thin
// gap between them; what is left of the circle stays the bare track
const quarters = (cx: number, cy: number, r: number, parts: { p: number; color: string }[]) => {
  const c = 2 * Math.PI * r
  const gap = parts.filter(x => x.p > 0).length > 1 ? 1.5 : 0
  let at = 0
  let out = `<circle class="track" cx="${cx}" cy="${cy}" r="${r}" stroke-width="7"/>`
  for (const { p, color } of parts) {
    const len = Math.min(c - at, (Math.max(0, p) / 100) * c)
    if (len <= 0) continue
    out +=
      `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="7" fill="none"` +
      ` stroke-dasharray="${Math.max(0.6, len - gap).toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}"` +
      ` transform="rotate(-90 ${cx} ${cy})"/>`
    at += len
  }
  return out
}

// System card: CPU, GPU and memory as three rings, each cut into the share of
// the apps that use the most, then those apps in a table with their colors,
// ranked by the column picked (its header marked) or by all three. The title
// sits above, beside the buttons that pick the column
export const systemCard = (sys: SystemStats, t: Strings, sort?: AppSort | null) => {
  // 50.8, 64, 128: a tenth only where there is one
  const gb = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10))
  // Ranked again right away when the column changes; each app keeps its color
  const by = (a: AppLoad, key: AppSort) => (key === 'ram' ? a.ram : a[key]) ?? -1
  const apps = sort ? [...(sys.apps ?? [])].sort((x, y) => by(y, sort) - by(x, sort)) : (sys.apps ?? [])
  const appColor = (a: AppLoad, i: number) => APP_COLORS[(a.color ?? i) % APP_COLORS.length]!
  const ramPct = sys.ramUsed !== undefined && sys.ramTotal ? (sys.ramUsed / sys.ramTotal) * 100 : undefined
  const ramShare = (a: AppLoad) => (a.ram !== undefined && sys.ramTotal ? (a.ram / sys.ramTotal) * 100 : undefined)
  const sum = (xs: (number | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0)
  // Each resource: its load, and each app's share when the system gives it
  const resources = [
    { label: 'CPU', p: sys.cpu, share: (a: AppLoad) => a.cpu },
    { label: 'GPU', p: sys.gpu, share: (a: AppLoad) => a.gpu },
    { label: 'RAM', p: ramPct, share: ramShare },
  ].map(r => ({ ...r, isSplit: r.p !== undefined && apps.some(a => r.share(a) !== undefined) }))

  const gauge = (x: string, r: (typeof resources)[number], detail: string) => {
    const color = r.p === undefined ? '#6e6e74' : heat(r.p)
    const parts = apps.map((a, i) => ({ p: r.share(a) ?? 0, color: appColor(a, i) }))
    const others = Math.max(0, (r.p ?? 0) - sum(parts.map(x => x.p)))
    return (
      `<svg x="${x}" y="0" width="1" height="1" overflow="visible">` +
      (r.isSplit ? quarters(0, 52, 24, [...parts, { p: others, color: OTHER_COLOR }]) : ring(0, 52, 24, r.p ?? 0, color)) +
      `<text x="0" y="57" text-anchor="middle" font-size="13.5" font-weight="700" fill="${color}">${r.p === undefined ? '—' : esc(pct(r.p))}</text>` +
      `<text class="t2" x="0" y="96" text-anchor="middle" font-size="11" font-weight="600" letter-spacing=".7">${r.label}</text>` +
      `<text x="0" y="110" text-anchor="middle" font-size="10.5">${detail}</text>` +
      `</svg>`
    )
  }
  const cpuDetail = `<tspan class="t3">${esc(sys.cores ? t.cores(sys.cores) : '')}</tspan>`
  // A long card name stays within its ring's column
  const card = sys.gpuName && sys.gpuName.length > 16 ? `${sys.gpuName.slice(0, 15).trimEnd()}…` : (sys.gpuName ?? '')
  const gpuDetail = `<tspan class="t3">${esc(sys.gpu === undefined ? t.na : card)}</tspan>`
  const ramDetail =
    sys.ramUsed !== undefined && sys.ramTotal
      ? `<tspan class="t1" font-weight="700">${esc(String(gb(sys.ramUsed)))}</tspan><tspan class="t3"> / ${esc(String(gb(sys.ramTotal)))} ${esc(t.gb)}</tspan>`
      : `<tspan class="t3">${esc(t.na)}</tspan>`
  let body =
    gauge('16.67%', resources[0]!, cpuDetail) +
    gauge('50%', resources[1]!, gpuDetail) +
    gauge('83.33%', resources[2]!, ramDetail)

  // The rings end on a thin rule; the apps' table comes under it, in columns
  // the panel lays out: the names, then one column per resource the system
  // splits by app, its header a button that ranks the apps by it
  const H = 130
  body += apps.length ? `<rect class="trackfill" x="0" y="124" width="100%" height="1"/>` : ''

  const figure = (p: number | undefined) => (p === undefined ? t.na : pct(p))
  const ram = sys.ramUsed !== undefined && sys.ramTotal ? `${gb(sys.ramUsed)} / ${gb(sys.ramTotal)} ${t.gb}` : t.na
  const appsAlt = apps
    .map(a =>
      [a.cpu !== undefined && `CPU ${Math.round(a.cpu)}%`, a.gpu !== undefined && `GPU ${Math.round(a.gpu)}%`, a.ram !== undefined && `RAM ${gb(a.ram)} ${t.gb}`]
        .filter(Boolean)
        .join(', '),
    )
    .map((figures, i) => `${apps[i]!.name}: ${figures}`)
    .join('; ')
  // The title alone, drawn like the other cards' titles; the drawing below it
  // starts at the rings
  const name = t.system.toUpperCase()
  const titleW = titleWidth(name)
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${titleW} 14" width="${titleW}" height="14">` +
    `<style>${STYLE}</style>${title(0, 11, name)}</svg>`
  const TOP = 24
  const rings = {
    svg: fluid((apps.length ? H : 112) - TOP, `<g transform="translate(0 ${-TOP})">${body}</g>`),
    h: (apps.length ? H : 112) - TOP,
    alt: `${t.system}: CPU ${figure(sys.cpu)}, GPU ${figure(sys.gpu)}, RAM ${ram}${appsAlt ? `. ${appsAlt}` : ''}`,
  }
  if (!apps.length) return { title: inline(head), titleW, rings, table: null }

  const cols = resources.filter(r => r.isSplit)
  const value = (label: string, v: number | undefined) =>
    v === undefined ? '—' : label === 'RAM' ? `${gb(v)} ${t.gb}` : `${Math.round(v)}%`
  // An app's figure in the color of its share of the machine, as the rings
  // are: green when light, red as it nears the whole
  const appCell = (r: (typeof cols)[number], a: AppLoad) => {
    const share = r.share(a)
    return { text: value(r.label, r.label === 'RAM' ? a.ram : share), color: share === undefined ? undefined : heat(share) }
  }
  const otherCell = (r: (typeof cols)[number]) => {
    if (r.label === 'RAM') return { text: value('RAM', sys.ramUsed === undefined ? undefined : Math.max(0, sys.ramUsed - sum(apps.map(a => a.ram)))) }
    return { text: value(r.label, r.p === undefined ? undefined : Math.max(0, r.p - sum(apps.map(a => r.share(a))))) }
  }
  const rows: { name: string; color: string; isOther: boolean; cells: { text: string; color?: string }[] }[] = [
    ...apps.map((a, i) => ({ name: a.name, color: appColor(a, i), isOther: false, cells: cols.map(r => appCell(r, a)) })),
    { name: t.other, color: OTHER_COLOR, isOther: true, cells: cols.map(otherCell) },
  ]
  // Every column the same height, one row each 18 px, so they line up
  const ROW = 18
  const TH = (rows.length - 1) * ROW + 17
  const y = (i: number) => 13 + i * ROW
  const names = {
    svg: fluid(
      TH,
      fadeRight(TH, 0, rows.map((row, i) => `<text class="${row.isOther ? 't3' : 't1'}" x="14" y="${y(i)}" font-size="12">${esc(row.name)}</text>`).join('')) +
        rows.map((row, i) => `<circle cx="4" cy="${y(i) - 4}" r="3.5" fill="${row.color}"/>`).join(''),
    ),
    h: TH,
    alt: rows.map(row => row.name).join(', '),
  }
  // A column's figures centered under its header button, whatever the button's
  // own width and padding
  const COL = 52
  const columns = cols.map((r, j) => ({
    key: r.label.toLowerCase() as AppSort,
    label: r.label,
    w: COL,
    h: TH,
    alt: `${r.label}: ${rows.map(row => row.cells[j]!.text).join(', ')}`,
    svg: inline(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COL} ${TH}" width="${COL}" height="${TH}"><style>${STYLE}</style>` +
        rows
          .map((row, i) => {
            const cell = row.cells[j]!
            const look = cell.color && !row.isOther ? `font-weight="600" fill="${cell.color}"` : `class="${row.isOther ? 't3' : 't2'}"`
            return `<text ${look} x="${COL / 2}" y="${y(i)}" text-anchor="middle" font-size="11.5">${esc(cell.text)}</text>`
          })
          .join('') +
        `</svg>`,
    ),
  }))
  // Ranking needs two columns at least
  return { title: inline(head), titleW, rings, table: { names, columns, isSortable: columns.length > 1 } }
}

// Context card content (the title and the Compact button sit above it): the
// percentage and the tokens on one line, the bar right under them
export const contextCard = (s: Snapshot, t: Strings) => {
  if (s.tokens === undefined || s.window <= 0) return null
  const H = 22
  const cp = (s.tokens / s.window) * 100
  const color = heat(cp)
  const tokenLabel = `${tokens(s.tokens)} / ${tokens(s.window)} ${t.tokens}`
  const svg = fluid(
    H,
    fadeRight(14, Math.ceil(tokenLabel.length * 6.6) + 10, `<text x="0" y="11" font-size="13" font-weight="700" fill="${color}">${esc(num(cp, 1))}%</text>`) +
      `<text x="100%" y="11" text-anchor="end" font-size="11.5"><tspan font-weight="700" fill="${color}">${esc(tokens(s.tokens))}</tspan><tspan class="t2"> / ${esc(tokens(s.window))}</tspan><tspan class="t3"> ${esc(t.tokens)}</tspan></text>` +
      bar(17, cp, 5),
  )
  // The title alone, drawn like the other cards' titles, as wide as its word
  const name = t.context.toUpperCase()
  const titleW = titleWidth(name)
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${titleW} 14" width="${titleW}" height="14">` +
    `<style>${STYLE}</style>${title(0, 11, name)}</svg>`
  return { svg, h: H, title: inline(head), titleW, alt: `${t.context}: ${tokenLabel}, ${num(cp, 1)}%` }
}

// A small turning wheel: something is under way
const wheel = (cx: number, cy: number, color: string) =>
  `<g transform="translate(${cx} ${cy})"><circle class="track" r="4.5" stroke-width="1.6"/>` +
  `<circle r="4.5" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-dasharray="9 30">` +
  `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur=".8s" repeatCount="indefinite"/></circle></g>`

// The update banner while installing (a turning wheel) and once installed (a
// second line: it takes effect in the next conversation, nothing reloads under
// this one). A new version itself is one clickable line, drawn by the panel
export const updateCard = (latest: string, status: 'running' | 'done', t: Strings) => {
  const text = status === 'running' ? t.updating(latest) : t.installed(latest)
  const color = status === 'done' ? HEX.green! : HEX.blue!
  const H = status === 'done' ? 34 : 18
  const svg = fluid(
    H,
    (status === 'running' ? wheel(5, 9, color) : `<circle cx="5" cy="9" r="3.5" fill="${color}"/>`) +
      fadeRight(
        H,
        0,
        `<text x="16" y="13" font-size="12.5" font-weight="600" fill="${color}">${esc(text)}</text>` +
          (status === 'done' ? `<text class="t2" x="16" y="30" font-size="11.5">${esc(t.nextConversation)}</text>` : ''),
      ),
  )
  return { svg, h: H, alt: status === 'done' ? `${text}. ${t.nextConversation}` : text }
}

// Panel footer under the cards: a status dot, the installed version and what
// the last update check found; a failure's reason on a second line. The
// version stays put whatever the status says: it ends just left of the middle
// and the status grows to the right, so a check moves nothing. While checking,
// a small wheel turns before the status
export const footerLine = (version: string, status: string, color: string, reason?: string, isBusy = false) => {
  const H = reason ? 32 : 16
  const line = `v${version}${status ? ` · ${status}` : ''}`
  const svg = fluid(
    H,
    `<svg x="50%" y="0" width="1" height="${H}" overflow="visible">` +
      `<text x="8" y="12" text-anchor="end" font-size="11" font-variant-numeric="tabular-nums">` +
      `<tspan fill="${color}">●</tspan><tspan class="t3">  v${esc(version)}</tspan></text>` +
      (isBusy
        ? `<text class="t3" x="8" y="12" font-size="11" xml:space="preserve"> · </text>${wheel(23, 8, color)}<text class="t3" x="32" y="12" font-size="11">${esc(status)}</text>`
        : status
          ? `<text class="t3" x="8" y="12" font-size="11" xml:space="preserve"> · ${esc(status)}</text>`
          : '') +
      `</svg>` +
      (reason ? `<text class="t3" x="50%" y="28" text-anchor="middle" font-size="11">${esc(reason)}</text>` : ''),
  )
  return { svg, h: H, alt: reason ? `${line}: ${reason}` : line }
}
