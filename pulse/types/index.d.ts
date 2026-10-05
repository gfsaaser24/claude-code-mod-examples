export type PulseStats = {
  port: number
  pid: number
  node: string
  upSec: number
  cores: number
  cpu: number[]
  memUsedGb: number
  memTotalGb: number
  repo: {
    isRepo: boolean
    branch: string
    changed: { code: string; path: string }[]
    commits: { hash: string; subject: string; age: string }[]
  }
}

declare module 'claude-code' {
  interface PluginState {
    pulse: { stats: PulseStats | null }
  }
}
