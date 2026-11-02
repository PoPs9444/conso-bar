import type { SystemStats } from '../types'

// The machine's load: CPU and GPU in percent, memory in use. One short system
// command per reading (run from register.tsx), nothing installed, nothing
// sent anywhere. Here: the commands, and reading what they print

const GIB = 2 ** 30

const num = (t: string | undefined) => {
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

const pct = (n: number | undefined) => (n === undefined ? undefined : Math.min(100, Math.max(0, n)))

// macOS: iostat over one second (user + system), the GPU's own utilization,
// and memory as Activity Monitor counts it (app + wired + compressed)
export const MAC =
  'iostat -n0 -c 2 -w 1 | tail -1; echo @@; ' +
  "ioreg -r -d 1 -w 0 -c IOAccelerator | grep -o '\"Device Utilization %\"=[0-9]*\\|\"model\" = \"[^\"]*\"' | head -4; echo @@; " +
  'vm_stat; echo @@; sysctl -n hw.memsize hw.logicalcpu'

export const parseMac = (out: string): SystemStats => {
  const [cpuPart = '', gpuPart = '', vmPart = '', sysPart = ''] = out.split('@@')
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
    cpu: us !== undefined && sy !== undefined && Number.isFinite(us + sy) ? pct(us + sy) : undefined,
    gpu: pct(num(gpu)),
    gpuName: model?.replace(/^Apple\s+/, ''),
    ramUsed: app !== undefined && wired !== undefined ? ((app + wired + compressed) * pageSize) / GIB : undefined,
    ramTotal: memsize ? memsize / GIB : undefined,
    cores: cores || undefined,
  }
}

// Linux: two /proc/stat samples one second apart, MemAvailable, and an NVIDIA
// GPU when nvidia-smi is there
export const LINUX =
  'head -1 /proc/stat; sleep 1; head -1 /proc/stat; echo @@; ' +
  "grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; echo @@; nproc; echo @@; " +
  'nvidia-smi --query-gpu=utilization.gpu,name --format=csv,noheader,nounits 2>/dev/null | head -1'

export const parseLinux = (out: string): SystemStats => {
  const [cpuPart = '', memPart = '', coresPart = '', gpuPart = ''] = out.split('@@')
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
    cpu,
    gpu: gpuPart.trim() ? pct(num(gpu?.trim())) : undefined,
    gpuName: name.join(',').trim().replace(/^NVIDIA\s+/, '') || undefined,
    ramUsed: total !== undefined && available !== undefined ? ((total - available) * 1024) / GIB : undefined,
    ramTotal: total !== undefined ? (total * 1024) / GIB : undefined,
    cores: num(coresPart.trim()) || undefined,
  }
}

// Windows: the processors' load, free memory, and the 3D engines' utilization
export const WINDOWS =
  "$c=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; " +
  '$o=Get-CimInstance Win32_OperatingSystem; ' +
  '$n=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors; ' +
  "$g=try{((Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction Stop).CounterSamples | Measure-Object -Property CookedValue -Sum).Sum}catch{''}; " +
  '"$c|$($o.TotalVisibleMemorySize)|$($o.FreePhysicalMemory)|$n|$g"'

export const parseWindows = (out: string): SystemStats => {
  const [cpu, total, free, cores, gpu] = out.trim().split('|')
  const t = num(total)
  const f = num(free)
  return {
    cpu: pct(num(cpu)),
    gpu: gpu?.trim() ? pct(num(gpu.trim())) : undefined,
    ramUsed: t !== undefined && f !== undefined ? ((t - f) * 1024) / GIB : undefined,
    ramTotal: t !== undefined ? (t * 1024) / GIB : undefined,
    cores: num(cores) || undefined,
  }
}

export type Platform = 'mac' | 'linux' | 'windows'
