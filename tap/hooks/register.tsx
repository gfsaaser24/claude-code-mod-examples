// Tap: the translation layer.
// It sits on the hook chain and records what crosses the wall:
// each tool call, each turn, each transcript row, and any secret in a tool result.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TapCall, TapData } from '../types'

const PANE = 'tap'
const EMPTY: TapData = {
  turns: 0, toolCalls: 0, errors: 0, denied: 0, rows: 0, doors: [], calls: [],
  lastTurn: null, costUsd: null, ctxPct: null, ctxTokens: null, secretsSeen: 0, redacted: 0,
}
const data = atom({ plugin: 'tap', key: 'data' } as const, EMPTY)
const redactOn = atom({ plugin: 'tap', key: 'redactOn' } as const, false)

const SECRET =
  /(sk-[A-Za-z0-9_-]{24,}|sk_live_[A-Za-z0-9]{24,}|rk_live_[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{32,}|ghp_[A-Za-z0-9]{30,}|pit-[0-9a-f-]{30,}|xox[bap]-[A-Za-z0-9-]{20,}|EAA[A-Za-z0-9]{60,})/g
const MASK = '[secret hidden by Tap]'

let isRedacting = false
let turnStartedAt = 0
let rowCount = 0
let secretsSeen = 0
let redacted = 0
const doorCounts: Record<string, number> = {}

function shortTool(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const parts = name.split('__')
  return `${parts[parts.length - 1]} (mcp)`
}

function clock(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

function doorList(): { name: string; count: number }[] {
  return Object.entries(doorCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

async function flush($: EngineInterface, patch: (d: TapData) => TapData) {
  await update($, data, d => ({ ...patch(d ?? EMPTY), rows: rowCount, doors: doorList(), secretsSeen, redacted }))
}

async function toggleRedact($: EngineInterface) {
  isRedacting = !isRedacting
  await update($, redactOn, () => isRedacting)
}

async function togglePane($: EngineInterface) {
  const isOpen = ((await $.ui.panes()) as readonly { id: string }[]).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
  } else {
    await $.ui.open({ id: PANE, title: 'Tap' })
  }
}

function durationChart(calls: readonly TapCall[]): string {
  const W = 340
  const H = 78
  const max = Math.max(1, ...calls.map(c => c.ms))
  const bw = calls.length ? Math.min(22, (W - 20) / calls.length - 3) : 0
  const bars = calls
    .map((c, i) => {
      const h = Math.max(3, (c.ms / max) * (H - 34))
      const fill = c.status === 'ok' ? '#3FB950' : c.status === 'denied' ? '#D29922' : '#F85149'
      return `<rect x="${(10 + i * (bw + 3)).toFixed(1)}" y="${(H - 8 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="10" fill="#1b1b1b"/>
  <text x="10" y="18" font-family="system-ui, sans-serif" font-size="12" fill="#bbb">Tool call time, last ${calls.length} calls (longest ${max} ms)</text>
  ${bars}
</svg>`
}

function contextBar(pct: number): string {
  const W = 340
  const fill = pct > 80 ? '#F85149' : pct > 60 ? '#D29922' : '#3FB950'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30" viewBox="0 0 ${W} 30">
  <rect width="${W}" height="30" rx="8" fill="#1b1b1b"/>
  <rect x="3" y="3" width="${(((W - 6) * Math.min(pct, 100)) / 100).toFixed(1)}" height="24" rx="6" fill="${fill}"/>
  <text x="12" y="20" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#fff">Context window ${pct}% full</text>
</svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isRedacting = Boolean(await read($, redactOn))
    await $.command.register({ name: 'tap', description: 'Open the Tap pane (live hook recorder)' })
    void $.ui.open({ id: PANE, title: 'Tap' })
    return next(e)
  })

  on('command.run', { command: 'tap' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Tap' })
    return { text: 'Tap pane opened.' }
  })

  on('prompt.submit', ($, e, next) => {
    turnStartedAt = Date.now()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const t0 = Date.now()
    const ran = await next(e)
    const out = ran as { deny?: string; isError?: boolean }
    const call: TapCall = {
      at: clock(t0),
      tool: shortTool(String((e as { tool: string }).tool)),
      ms: Date.now() - t0,
      status: out.deny !== undefined ? 'denied' : out.isError ? 'error' : 'ok',
    }
    await flush($, d => ({
      ...d,
      toolCalls: d.toolCalls + 1,
      errors: d.errors + (call.status === 'error' ? 1 : 0),
      denied: d.denied + (call.status === 'denied' ? 1 : 0),
      calls: [...d.calls, call].slice(-14),
    }))
    return ran
  })

  on('session.append', ($, e, next) => {
    const row = e as { door: string; message: unknown }
    rowCount++
    doorCounts[row.door] = (doorCounts[row.door] ?? 0) + 1
    if (row.door !== 'tool-result') return next(e)
    const raw = JSON.stringify(row.message)
    const hits = raw.match(SECRET)
    if (!hits) return next(e)
    secretsSeen += hits.length
    if (!isRedacting) return next(e)
    redacted += hits.length
    return (next as (x: unknown) => ReturnType<typeof next>)({ ...row, message: JSON.parse(raw.replace(SECRET, MASK)) })
  })

  on('turn.complete', async ($, e, next) => {
    const t = e as { agentId?: string; durationMs?: number; usage?: Record<string, number> }
    if (!t.agentId) {
      let costUsd: number | null = null
      let ctxPct: number | null = null
      let ctxTokens: number | null = null
      try {
        const u = (await $.session.usage()) as { cost?: { usd?: number }; context?: { percent?: number; tokens?: number } }
        costUsd = u.cost?.usd ?? null
        ctxPct = u.context?.percent ?? null
        ctxTokens = u.context?.tokens ?? null
      } catch {}
      const ms = t.durationMs ?? (turnStartedAt ? Date.now() - turnStartedAt : 0)
      await flush($, d => ({
        ...d,
        turns: d.turns + 1,
        lastTurn: {
          ms,
          inTok: t.usage?.input_tokens ?? 0,
          outTok: t.usage?.output_tokens ?? 0,
          cacheRead: t.usage?.cache_read_input_tokens ?? 0,
        },
        costUsd,
        ctxPct,
        ctxTokens,
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown, Svg } = $.ui.resolve(e) as Record<string, any>
    const d = ((await read($, data)) ?? EMPTY) as TapData
    const isOn = Boolean(await read($, redactOn))
    const hasSvg = e.surface !== 'terminal'
    const dot = (s: TapCall['status']) => (s === 'ok' ? 'success' : s === 'denied' ? 'warning' : 'error')
    return (
      <Box flexDirection="column" gap={1}>
        <Markdown
          text={
            '**Tap** shows the *translation layer*. It sits on the hook chain and sees each thing that crosses the wall: every tool call, every turn, every new transcript row. It can also hide API keys in a tool result before the model reads them.'
          }
        />
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Text>
            <Text bold>{d.turns}</Text> <Text dimColor>turns</Text>
          </Text>
          <Text>
            <Text bold>{d.toolCalls}</Text> <Text dimColor>tool calls</Text>
          </Text>
          <Text>
            <Text bold color={d.errors ? 'error' : undefined}>{d.errors}</Text> <Text dimColor>errors</Text>
          </Text>
          <Text>
            <Text bold>{d.rows}</Text> <Text dimColor>transcript rows</Text>
          </Text>
        </Box>
        {d.ctxPct !== null && hasSvg ? <Svg source={contextBar(d.ctxPct)} alt={`Context window ${d.ctxPct} percent full`} width={340} height={30} /> : null}
        {d.lastTurn ? (
          <Box borderStyle="round" borderColor="suggestion" paddingX={1} flexDirection="column">
            <Text>
              <Text bold>Last turn</Text> {(d.lastTurn.ms / 1000).toFixed(1)} s
              {d.costUsd !== null ? <Text dimColor> / session cost ${d.costUsd.toFixed(2)}</Text> : null}
            </Text>
            <Text dimColor>
              {d.lastTurn.outTok} tokens out / {d.lastTurn.cacheRead.toLocaleString()} read from cache
            </Text>
          </Box>
        ) : (
          <Text dimColor>Waiting for the first turn to end...</Text>
        )}
        {d.calls.length && hasSvg ? <Svg source={durationChart(d.calls)} alt="Bar chart of tool call time" width={340} height={78} /> : null}
        <Box flexDirection="column">
          <Text bold>Tool calls</Text>
          {d.calls.length === 0 ? <Text dimColor>None yet.</Text> : null}
          {d.calls.slice(-8).map(c => (
            <Text wrap="truncate-end">
              <Text dimColor>{c.at}</Text> <Text color={dot(c.status)}>●</Text> {c.tool} <Text dimColor>{c.ms} ms</Text>
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold>Transcript rows, by door</Text>
          <Text dimColor wrap="wrap">
            {d.doors.length ? d.doors.map(x => `${x.name} ${x.count}`).join(' / ') : 'None yet.'}
          </Text>
        </Box>
        <Box borderStyle="round" borderColor={isOn ? 'success' : 'inactive'} paddingX={1} flexDirection="column">
          <Text>
            <Text bold>Secret guard</Text> is {isOn ? <Text color="success">on</Text> : <Text dimColor>off</Text>}
          </Text>
          <Text dimColor>
            {d.secretsSeen} keys seen in tool results / {d.redacted} hidden from the model
          </Text>
          <Button key="redact" variant={isOn ? 'secondary' : 'primary'} label={isOn ? 'Turn guard off' : 'Turn guard on'} onPress={() => toggleRedact($)} />
        </Box>
        <Text dimColor>How: hooks on tool.call, turn.complete and session.append. Each one calls next(e).</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = ((await read($, data)) ?? EMPTY) as TapData
    const parts = [
      d.ctxPct !== null ? `context ${d.ctxPct}%` : null,
      d.costUsd !== null ? `$${d.costUsd.toFixed(2)}` : null,
      `${d.toolCalls} tool calls`,
      d.lastTurn ? `last turn ${(d.lastTurn.ms / 1000).toFixed(0)} s` : null,
    ].filter(Boolean)
    return (
      <Box columnGap={1}>
        <Text dimColor>{parts.join(' / ')}</Text>
        <Button key="tap" label="Tap" onPress={() => togglePane($)} />
      </Box>
    )
  })
}
