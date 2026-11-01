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
  status: 'idle' | 'running' | 'done' | 'error'
}

declare module 'claude-code' {
  interface PluginState {
    'conso-bar': {
      snapshot: Snapshot | null
      isCompacting: boolean
      agentRuns: AgentRun[]
      tick: number
      history: Day[]
      update: UpdateState
    }
  }
}
