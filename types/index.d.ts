export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  usd?: number
  limits: Limit[]
  tokens?: number
  window: number
  // when the limits were read (by this session or another one)
  limitsAt?: number
}

export type AgentRun = {
  id: string
  description: string
  type: string
  model: string
  effort?: string | number
  status: 'running' | 'done' | 'failed' | 'aborted'
  startedAt: number
  endedAt?: number
  steps: number
  outputTokens: number
  lastTool?: string
  // false while the id comes from the tool call, not yet from the agent itself
  isLinked: boolean
  // start of its prompt, to recognize it at its first turn
  prompt?: string
  // estimated cost at list price
  usd: number
  // stop requested from the panel: the agent finishes at its next step
  isStopping?: boolean
}

// Cost of one day, across all sessions
export type Day = { date: string; usd: number }

// Update from GitHub
export type UpdateState = {
  latest?: string
  // checking: asking GitHub; current: no newer version; running: installing;
  // done: installed, restart needed; error: the last check or install failed
  status: 'idle' | 'checking' | 'current' | 'running' | 'done' | 'error'
  // why the last check or install failed, shown under the panel; 'restart'
  // after an install that could not reload the plugins by itself
  message?: string
}

// The panel's blocks, in the order the person chose
export type CardKey = 'limits' | 'context' | 'history' | 'agents'

declare module 'claude-code' {
  interface PluginState {
    'conso-bar': {
      snapshot: Snapshot | null
      isCompacting: boolean
      agentRuns: AgentRun[]
      tick: number
      history: Day[]
      update: UpdateState
      order: CardKey[]
      isCustomizing: boolean
    }
  }
}
