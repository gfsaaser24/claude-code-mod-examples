export type TapCall = { at: string; tool: string; ms: number; status: 'ok' | 'error' | 'denied' }

export type TapData = {
  turns: number
  toolCalls: number
  errors: number
  denied: number
  rows: number
  doors: { name: string; count: number }[]
  calls: TapCall[]
  lastTurn: { ms: number; inTok: number; outTok: number; cacheRead: number } | null
  costUsd: number | null
  ctxPct: number | null
  ctxTokens: number | null
  secretsSeen: number
  redacted: number
}

declare module 'claude-code' {
  interface PluginState {
    tap: { data: TapData; redactOn: boolean }
  }
}
