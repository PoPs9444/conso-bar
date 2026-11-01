// API list prices, in $ per million tokens (as of 2026-10-06).
// Claude Code caches for 1 hour: a cache write costs 2 × input (1.25 × for 5 minutes).
// Used to estimate an agent's cost.
type Price = { input: number; output: number; cacheRead: number }

const PRICES: [RegExp, Price][] = [
  [/fable|mythos/i, { input: 10, output: 50, cacheRead: 0.25 }],
  [/opus/i, { input: 4, output: 20, cacheRead: 0.2 }],
  [/sonnet/i, { input: 2, output: 10, cacheRead: 0.2 }],
  [/haiku/i, { input: 0.1, output: 0.5, cacheRead: 0.01 }],
]

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const costOf = (model: string, u: Usage) => {
  const p = PRICES.find(([re]) => re.test(model))?.[1]
  if (!p) return 0
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_creation_input_tokens * p.input * 2 +
      u.cache_read_input_tokens * p.cacheRead) /
    1_000_000
  )
}
