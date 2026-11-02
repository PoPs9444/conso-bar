import type { AppLoad, SystemStats } from '../types'

// The machine's load: CPU and GPU in percent, memory in use, and the apps
// behind it. One short system command per reading (run from register.tsx),
// nothing installed, nothing sent anywhere. Here: the commands, and reading
// what they print

const GIB = 2 ** 30

const num = (t: string | undefined) => {
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

const pct = (n: number | undefined) => (n === undefined ? undefined : Math.min(100, Math.max(0, n)))

// One process: its load in percent of one core (when known), its memory in
// GB, and the app it belongs to
export type Proc = { pid: string; cpu?: number; ram: number; app: string }

// One reading: the machine's figures, its processes, and on macOS each
// process's GPU time so far (in nanoseconds), to compare with the next reading
export type Reading = { stats: SystemStats; procs: Proc[]; gpuTimes?: Map<string, number> }

// The app a process belongs to: the outermost .app bundle in its path (an
// app's helpers count as the app), the system's own processes as "macOS"
export const appOf = (path: string) => {
  const bundle = /([^/]+)\.app\//.exec(`${path}/`)?.[1]
  if (bundle) return bundle
  if (/^\/(System|usr|sbin|bin|Library\/Apple)\//.test(path)) return 'macOS'
  return path.split('/').pop() || path
}

// `ps -A -o pid=,%cpu=,rss=,comm=`: one process per line
export const parsePs = (out: string): Proc[] =>
  out
    .split('\n')
    .map(l => /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ pid: m[1]!, cpu: Number(m[2]), ram: (Number(m[3]) * 1024) / GIB, app: appOf(m[4]!.trim()) }))

// The GPU's clients (ioreg, filtered): each block holds its GPU time, then
// the process that opened it
export const parseGpuClients = (out: string) => {
  const times = new Map<string, number>()
  for (const block of out.split('+-o AGXDeviceUserClient').slice(1)) {
    const pid = /"IOUserClientCreator" = "pid (\d+)/.exec(block)?.[1]
    if (!pid) continue
    const t = [...block.matchAll(/"accumulatedGPUTime"=(\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0)
    times.set(pid, (times.get(pid) ?? 0) + t)
  }
  return times
}

const PS = 'ps -A -o pid=,%cpu=,rss=,comm='

// macOS: iostat over one second (user + system), the GPU's own utilization,
// memory as Activity Monitor counts it (app + wired + compressed), the
// processes, and each GPU client's time
export const MAC =
  'iostat -n0 -c 2 -w 1 | tail -1; echo @@; ' +
  "ioreg -r -d 1 -w 0 -c IOAccelerator | grep -o '\"Device Utilization %\"=[0-9]*\\|\"model\" = \"[^\"]*\"' | head -4; echo @@; " +
  `vm_stat; echo @@; sysctl -n hw.memsize hw.logicalcpu; echo @@; ${PS}; echo @@; ` +
  "ioreg -r -c AGXDeviceUserClient -l -w 0 | grep -o '+-o AGXDeviceUserClient\\|\"accumulatedGPUTime\"=[0-9]*\\|\"IOUserClientCreator\" = \"pid [0-9]*'"

export const parseMac = (out: string): Reading => {
  const [cpuPart = '', gpuPart = '', vmPart = '', sysPart = '', psPart = '', clientsPart] = out.split('@@')
  const [us, sy] = cpuPart.trim().split(/\s+/).map(Number)
  const gpu = /"Device Utilization %"=(\d+)/.exec(gpuPart)?.[1]
  const model = /"model" = "([^"]+)"/.exec(gpuPart)?.[1]
  const pageSize = num(/page size of (\d+) bytes/.exec(vmPart)?.[1]) ?? 4096
  const pages = (name: string) => num(new RegExp(`${name}:\\s+(\\d+)`).exec(vmPart)?.[1])
  const anonymous = pages('Anonymous pages')
  const app = anonymous !== undefined ? anonymous - (pages('Pages purgeable') ?? 0) : pages('Pages active')
  const wired = pages('Pages wired down')
  const compressed = pages('Pages occupied by compressor') ?? 0
  const [memsize, cores] = sysPart.trim().split(/\s+/).map(Number)
  return {
    stats: {
      cpu: us !== undefined && sy !== undefined && Number.isFinite(us + sy) ? pct(us + sy) : undefined,
      gpu: pct(num(gpu)),
      gpuName: model?.replace(/^Apple\s+/, ''),
      ramUsed: app !== undefined && wired !== undefined ? ((app + wired + compressed) * pageSize) / GIB : undefined,
      ramTotal: memsize ? memsize / GIB : undefined,
      cores: cores || undefined,
    },
    procs: parsePs(psPart),
    gpuTimes: clientsPart === undefined ? undefined : parseGpuClients(clientsPart),
  }
}

// Linux: two /proc/stat samples one second apart, MemAvailable, an NVIDIA GPU
// when nvidia-smi is there, and the processes
export const LINUX =
  'head -1 /proc/stat; sleep 1; head -1 /proc/stat; echo @@; ' +
  "grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; echo @@; nproc; echo @@; " +
  `nvidia-smi --query-gpu=utilization.gpu,name --format=csv,noheader,nounits 2>/dev/null | head -1; echo @@; ${PS}`

export const parseLinux = (out: string): Reading => {
  const [cpuPart = '', memPart = '', coresPart = '', gpuPart = '', psPart = ''] = out.split('@@')
  const samples = cpuPart
    .trim()
    .split('\n')
    .map(l => l.trim().split(/\s+/).slice(1, 9).map(Number))
  let cpu: number | undefined
  if (samples.length === 2 && samples[0]!.length >= 4 && samples[1]!.length >= 4) {
    const idle = (s: number[]) => (s[3] ?? 0) + (s[4] ?? 0)
    const total = (s: number[]) => s.reduce((a, b) => a + b, 0)
    const dt = total(samples[1]!) - total(samples[0]!)
    if (dt > 0) cpu = pct((1 - (idle(samples[1]!) - idle(samples[0]!)) / dt) * 100)
  }
  const kb = (name: string) => num(new RegExp(`${name}:\\s+(\\d+)`).exec(memPart)?.[1])
  const total = kb('MemTotal')
  const available = kb('MemAvailable')
  const [gpu, ...name] = gpuPart.trim().split(',')
  return {
    stats: {
      cpu,
      gpu: gpuPart.trim() ? pct(num(gpu?.trim())) : undefined,
      gpuName: name.join(',').trim().replace(/^NVIDIA\s+/, '') || undefined,
      ramUsed: total !== undefined && available !== undefined ? ((total - available) * 1024) / GIB : undefined,
      ramTotal: total !== undefined ? (total * 1024) / GIB : undefined,
      cores: num(coresPart.trim()) || undefined,
    },
    // ps's %cpu on Linux averages since the process started, not now: memory only
    procs: parsePs(psPart).map(p => ({ ...p, cpu: undefined })),
  }
}

// Windows: the processors' load, free memory, the 3D engines' utilization,
// and each app's memory
export const WINDOWS =
  "$c=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; " +
  '$o=Get-CimInstance Win32_OperatingSystem; ' +
  '$n=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors; ' +
  "$g=try{((Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction Stop).CounterSamples | Measure-Object -Property CookedValue -Sum).Sum}catch{''}; " +
  "$p=(Get-Process | Group-Object ProcessName | ForEach-Object { $_.Name + '=' + ($_.Group | Measure-Object WorkingSet64 -Sum).Sum }) -join ';'; " +
  '"$c|$($o.TotalVisibleMemorySize)|$($o.FreePhysicalMemory)|$n|$g|$p"'

export const parseWindows = (out: string): Reading => {
  const [cpu, total, free, cores, gpu, apps = ''] = out.trim().split('|')
  const t = num(total)
  const f = num(free)
  const procs = apps
    .split(';')
    .map(entry => /^(.+)=(\d+)$/.exec(entry.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m, i) => ({ pid: `w${i}`, ram: Number(m[2]) / GIB, app: m[1]! }))
  return {
    stats: {
      cpu: pct(num(cpu)),
      gpu: gpu?.trim() ? pct(num(gpu.trim())) : undefined,
      ramUsed: t !== undefined && f !== undefined ? ((t - f) * 1024) / GIB : undefined,
      ramTotal: t !== undefined ? (t * 1024) / GIB : undefined,
      cores: num(cores) || undefined,
    },
    procs,
  }
}

// The biggest consumers. CPU in percent of the whole machine, GPU in percent
// (each app's GPU time over the interval, when known), memory in GB. Each
// figure is scaled down where the apps add up to more than the machine
// reports, so the rings never overflow
export const topApps = (procs: Proc[], stats: SystemStats, gpuByPid?: Map<string, number>, n = 4): AppLoad[] => {
  if (procs.length === 0) return []
  const cores = stats.cores ?? 1
  const apps = new Map<string, { name: string; cpu?: number; gpu?: number; ram: number }>()
  const appOfPid = new Map<string, string>()
  for (const p of procs) {
    const key = p.app.toLowerCase()
    appOfPid.set(p.pid, key)
    const a = apps.get(key) ?? { name: p.app, ram: 0 }
    // "Claude" over "claude": the capitalized spelling names the app
    if (/^[A-Z]/.test(p.app) && !/^[A-Z]/.test(a.name)) a.name = p.app
    if (p.cpu !== undefined) a.cpu = (a.cpu ?? 0) + p.cpu / cores
    a.ram += p.ram
    apps.set(key, a)
  }
  for (const [pid, g] of gpuByPid ?? []) {
    const a = apps.get(appOfPid.get(pid) ?? '')
    if (a) a.gpu = (a.gpu ?? 0) + g
  }
  const all = [...apps.values()]
  const fit = (total: number | undefined, pick: (a: (typeof all)[number]) => number | undefined) => {
    const sum = all.reduce((s, a) => s + (pick(a) ?? 0), 0)
    return total !== undefined && sum > total ? total / sum : 1
  }
  const kc = fit(stats.cpu, a => a.cpu)
  const kg = fit(stats.gpu, a => a.gpu)
  const kr = fit(stats.ramUsed, a => a.ram)
  const ramTotal = stats.ramTotal || 1
  const score = (a: (typeof all)[number]) => (a.cpu ?? 0) * kc + (a.gpu ?? 0) * kg + ((a.ram * kr) / ramTotal) * 100
  return all
    .filter(a => score(a) > 0)
    .sort((x, y) => score(y) - score(x))
    .slice(0, n)
    .map(a => ({
      name: a.name,
      cpu: a.cpu === undefined ? undefined : a.cpu * kc,
      gpu: gpuByPid ? (a.gpu ?? 0) * kg : undefined,
      ram: a.ram * kr,
    }))
}

// The new top apps, each one already shown keeping its place, so its color
// does not jump from one reading to the next; newcomers take the free places
export const keepPlaces = (shown: readonly AppLoad[] | undefined, next: AppLoad[]): AppLoad[] => {
  const places: (AppLoad | undefined)[] = new Array(next.length).fill(undefined)
  const rest = [...next]
  ;(shown ?? []).forEach((old, i) => {
    const j = rest.findIndex(a => a.name === old.name)
    if (i < places.length && j >= 0) places[i] = rest.splice(j, 1)[0]
  })
  return places.map(a => a ?? rest.shift()!)
}

export type Platform = 'mac' | 'linux' | 'windows'
