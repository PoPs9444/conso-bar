import type { AppLoad, AppSort, SystemStats } from '../types'

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

// One GPU client on macOS: the process that opened it and its GPU time so far,
// in nanoseconds
export type GpuClient = { pid: string; time: number }

// One reading: the machine's figures, its processes, on macOS each GPU client
// by its id, to compare with the next reading, and on Windows each process's
// GPU share as the system measured it
export type Reading = { stats: SystemStats; procs: Proc[]; gpuTimes?: Map<string, GpuClient>; gpuByPid?: Map<string, number> }

// A graphics card's name as people say it: NVIDIA GeForce RTX 3080 is
// RTX 3080, AMD Radeon RX 6800 XT is RX 6800 XT, Intel(R) Arc(TM) A770
// Graphics is Arc A770, Apple M4 Max is M4 Max
export const gpuShort = (name: string) => {
  let n = name.replace(/\((R|TM)\)/gi, '').replace(/\s+/g, ' ').trim()
  n = n.replace(/^(NVIDIA|AMD|Intel|Apple) /i, '').replace(/^GeForce /i, '').replace(/^Radeon (?=RX )/i, '')
  n = n.replace(/ GPU$/i, '')
  // "Graphics" at the end says nothing once a model number is there
  if (/\d/.test(n)) n = n.replace(/ Graphics$/i, '')
  return n
}

// Of the graphics cards Windows lists, the one doing the work: a dedicated
// card before one built into the processor, never a virtual display adapter
// (remote desktop, screen sharing)
export const pickGpu = (names: readonly string[]) => {
  const rank = (n: string) =>
    /microsoft|basic display|virtual|remote|parsec|displaylink|citrix|vmware|hyper-v|mirage|spacedesk/i.test(n)
      ? 0
      : /nvidia|geforce|quadro|tesla|rtx/i.test(n)
        ? 4
        : /radeon.*\b(rx|pro|vii|vega)\b|\barc\b/i.test(n)
          ? 3
          : /radeon|amd/i.test(n)
            ? 2
            : 1
  const best = names
    .map(n => n.trim())
    .filter(n => n && rank(n) > 0)
    .sort((a, b) => rank(b) - rank(a))[0]
  return best ? gpuShort(best) : undefined
}

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

// The GPU's clients (ioreg, filtered), each by its registry id: a client an
// app closes takes its time with it, so time is compared client by client,
// never as a process's total that would drop. Each block holds the id, the
// GPU time, then the process that opened it
export const parseGpuClients = (out: string) => {
  const clients = new Map<string, GpuClient>()
  for (const block of out.split('+-o AGXDeviceUserClient').slice(1)) {
    const id = /id (0x[0-9a-f]+)/.exec(block)?.[1]
    const pid = /"IOUserClientCreator" = "pid (\d+)/.exec(block)?.[1]
    if (!id || !pid) continue
    const time = [...block.matchAll(/"accumulatedGPUTime"=(\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0)
    clients.set(id, { pid, time })
  }
  return clients
}

const PS = 'ps -A -o pid=,%cpu=,rss=,comm='

// macOS: iostat over one second (user + system), the GPU's own utilization,
// memory as Activity Monitor counts it (app + wired + compressed), the
// processes, and each GPU client's time
export const MAC =
  'iostat -n0 -c 2 -w 1 | tail -1; echo @@; ' +
  "ioreg -r -d 1 -w 0 -c IOAccelerator | grep -o '\"Device Utilization %\"=[0-9]*\\|\"model\" = \"[^\"]*\"' | head -4; echo @@; " +
  `vm_stat; echo @@; sysctl -n hw.memsize hw.logicalcpu; echo @@; ${PS}; echo @@; ` +
  "ioreg -r -c AGXDeviceUserClient -l -w 0 | grep -o '+-o AGXDeviceUserClient  <class AGXDeviceUserClient, id 0x[0-9a-f]*\\|\"accumulatedGPUTime\"=[0-9]*\\|\"IOUserClientCreator\" = \"pid [0-9]*'"

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
      gpuName: model ? gpuShort(model) : undefined,
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
      gpuName: gpuShort(name.join(',')) || undefined,
      ramUsed: total !== undefined && available !== undefined ? ((total - available) * 1024) / GIB : undefined,
      ramTotal: total !== undefined ? (total * 1024) / GIB : undefined,
      cores: num(coresPart.trim()) || undefined,
    },
    // ps's %cpu on Linux averages since the process started, not now: memory only
    procs: parsePs(psPart).map(p => ({ ...p, cpu: undefined })),
  }
}

// Windows: the processors' load, free memory, the 3D engines' utilization by
// process, each process's memory and CPU, and the graphics cards' names. A process's CPU is its processor
// time gained over the second the GPU counters take to sample (one second at
// least), what Task Manager shows; its time so far alone would be a lifetime
// average. Idle (Id 0) is the processors' idle time, not an app
export const WINDOWS =
  "$c=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; " +
  '$o=Get-CimInstance Win32_OperatingSystem; ' +
  '$n=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors; ' +
  '$w=[Diagnostics.Stopwatch]::StartNew(); $a=@{}; Get-Process | ForEach-Object { $a[$_.Id]=$_.CPU }; ' +
  "$s=try{(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction Stop).CounterSamples}catch{$null}; " +
  "$g=if($s){($s | Measure-Object -Property CookedValue -Sum).Sum}else{''}; " +
  "$q=($s | ForEach-Object { if($_.CookedValue -gt 0 -and $_.InstanceName -match 'pid_(\\d+)_'){ \"$($matches[1])=$($_.CookedValue)\" } }) -join ';'; " +
  '$r=1000-$w.ElapsedMilliseconds; if($r -gt 0){ Start-Sleep -Milliseconds $r }; $d=$w.Elapsed.TotalSeconds; ' +
  "$p=(Get-Process | Where-Object Id -ne 0 | ForEach-Object { \"$($_.Id),$($_.ProcessName),$($_.CPU - $a[$_.Id]),$($_.WorkingSet64)\" }) -join ';'; " +
  "$v=(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join ';'; " +
  '"$c|$($o.TotalVisibleMemorySize)|$($o.FreePhysicalMemory)|$n|$g|$d|$p|$q|$v"'

export const parseWindows = (out: string): Reading => {
  const [cpu, total, free, cores, gpu, span, apps = '', gpuApps = '', cards = ''] = out.trim().split('|')
  const t = num(total)
  const f = num(free)
  const dt = num(span)
  // Id,name,processor seconds gained,memory in bytes: a name may hold a comma
  const procs = apps
    .split(';')
    .map(entry => /^(\d+),(.+),([^,]*),(\d+)$/.exec(entry.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => {
      const gained = num(m[3]) ?? 0
      return { pid: m[1]!, cpu: dt ? (Math.max(0, gained) / dt) * 100 : undefined, ram: Number(m[4]) / GIB, app: m[2]! }
    })
  // The GPU's share by process: every 3D engine it used, added up
  const gpuByPid = new Map<string, number>()
  for (const entry of gpuApps.split(';')) {
    const m = /^(\d+)=(.+)$/.exec(entry.trim())
    const v = num(m?.[2])
    if (m && v !== undefined) gpuByPid.set(m[1]!, (gpuByPid.get(m[1]!) ?? 0) + v)
  }
  const hasGpu = Boolean(gpu?.trim())
  return {
    stats: {
      cpu: pct(num(cpu)),
      gpu: hasGpu ? pct(num(gpu!.trim())) : undefined,
      gpuName: pickGpu(cards.split(';')),
      ramUsed: t !== undefined && f !== undefined ? ((t - f) * 1024) / GIB : undefined,
      ramTotal: t !== undefined ? (t * 1024) / GIB : undefined,
      cores: num(cores) || undefined,
    },
    procs,
    gpuByPid: hasGpu ? gpuByPid : undefined,
  }
}

// The biggest consumers, by one resource or by all three. CPU in percent of
// the whole machine, GPU in percent (each app's GPU time over the interval,
// when known), memory in GB. Each figure is scaled down where the apps add up
// to more than the machine reports, so the rings never overflow
export const topApps = (procs: Proc[], stats: SystemStats, gpuByPid?: Map<string, number>, n = 4, by?: AppSort | null): AppLoad[] => {
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
  const share = (a: (typeof all)[number]) => ({
    cpu: (a.cpu ?? 0) * kc,
    gpu: (a.gpu ?? 0) * kg,
    ram: ((a.ram * kr) / ramTotal) * 100,
  })
  const score = (a: (typeof all)[number]) => {
    const x = share(a)
    return x.cpu + x.gpu + x.ram
  }
  const rank = (a: (typeof all)[number]) => (by ? share(a)[by] : score(a))
  return all
    .filter(a => score(a) > 0)
    .sort((x, y) => rank(y) - rank(x) || score(y) - score(x))
    .slice(0, n)
    .map(a => ({
      name: a.name,
      cpu: a.cpu === undefined ? undefined : a.cpu * kc,
      gpu: gpuByPid ? (a.gpu ?? 0) * kg : undefined,
      ram: a.ram * kr,
    }))
}

// Each app keeps the color it had while it stays among the top ones, whatever
// its rank; a newcomer takes the first free one
export const keepColors = (shown: readonly AppLoad[] | undefined, next: AppLoad[], colors = 4): AppLoad[] => {
  const had = new Map((shown ?? []).flatMap(a => (a.color === undefined ? [] : [[a.name, a.color] as const])))
  const used = new Set<number>()
  const kept = next.map(a => {
    const c = had.get(a.name)
    if (c === undefined || c >= colors || used.has(c)) return { ...a, color: undefined }
    used.add(c)
    return { ...a, color: c }
  })
  return kept.map(a => {
    if (a.color !== undefined) return a
    let c = 0
    while (used.has(c)) c++
    used.add(c)
    return { ...a, color: c }
  })
}

export type Platform = 'mac' | 'linux' | 'windows'
