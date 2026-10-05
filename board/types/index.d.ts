export type BoardCard = {
  id: string
  url: string
  job: number
  title: string
  pri: string
  owner: string
  status: string
  pr: string
}

declare module 'claude-code' {
  interface PluginState {
    board: { cards: BoardCard[]; note: string }
  }
}
