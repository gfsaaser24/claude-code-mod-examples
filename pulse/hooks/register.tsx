// Pulse: the technical layer.
// The mod is thin. A Node sidecar does the work and the mod draws its JSON.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PulseStats } from '../types'

const PANE = 'pulse'
const stats = atom({ plugin: 'pulse', key: 'stats' } as const, null)

let port = 0
let isStarted = false

async function poll($: EngineInterface) {
  if (!port) return
  try {
    const res = await $.http.fetch(`http://127.0.0.1:${port}/stats`)
    if (res.ok) {
      const data = JSON.parse(res.text) as PulseStats
      await update($, stats, () => ({ ...data, port }))
    }
  } catch {}
}

async function startSidecar($: EngineInterface) {
  if (isStarted) return
  isStarted = true
  const cwd = await $.session.cwd()
  const script = `${$.plugin.root}/sidecar/server.mjs`.split('\\').join('/')
  let seen = ''
  try {
    for await (const piece of $.process.spawn({ argv: ['node', script, cwd] })) {
      if (!port) {
        seen += piece.text
        const m = /PORT=(\d+)/.exec(seen)
        if (m) {
          port = Number(m[1])
          void poll($)
        }
      }
    }
  } catch {}
  port = 0
  isStarted = false
}

function cpuChart(samples: readonly number[]): string {
  const W = 340
  const H = 96
  const n = Math.max(samples.length, 2)
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => H - 6 - (Math.min(v, 100) / 100) * (H - 16)
  const pts = samples.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = pts.length ? `M${pts.join(' L')}` : ''
  const area = pts.length ? `${line} L${W},${H} L0,${H} Z` : ''
  const last = samples.length ? samples[samples.length - 1] : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7235" stop-opacity="0.7"/><stop offset="1" stop-color="#FF7235" stop-opacity="0.05"/></linearGradient></defs>
  <rect width="${W}" height="${H}" rx="10" fill="#1b1b1b"/>
  <g stroke="#333" stroke-width="1"><line x1="0" y1="${y(25)}" x2="${W}" y2="${y(25)}"/><line x1="0" y1="${y(50)}" x2="${W}" y2="${y(50)}"/><line x1="0" y1="${y(75)}" x2="${W}" y2="${y(75)}"/></g>
  <path d="${area}" fill="url(#a)"/><path d="${line}" fill="none" stroke="#FF7235" stroke-width="2"/>
  <text x="10" y="20" font-family="system-ui, sans-serif" font-size="12" fill="#bbb">CPU, last ${samples.length} s</text>
  <text x="${W - 10}" y="22" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="end">${last}%</text>
</svg>`
}

function memBar(used: number, total: number): string {
  const W = 340
  const pct = total > 0 ? Math.min(used / total, 1) : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30" viewBox="0 0 ${W} 30">
  <rect width="${W}" height="30" rx="8" fill="#1b1b1b"/>
  <rect x="3" y="3" width="${((W - 6) * pct).toFixed(1)}" height="24" rx="6" fill="#4C8DFF"/>
  <text x="12" y="20" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#fff">Memory ${used} of ${total} GB (${Math.round(pct * 100)}%)</text>
</svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pulse', description: 'Open the Pulse pane (sidecar stats)' })
    void startSidecar($)
    $.clock.every(3000, () => {
      void poll($)
    })
    void $.ui.open({ id: PANE, title: 'Pulse' })
    return next(e)
  })

  on('command.run', { command: 'pulse' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Pulse' })
    return { text: 'Pulse pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown, Svg } = $.ui.resolve(e) as Record<string, any>
    const s = (await read($, stats)) as PulseStats | null
    const hasSvg = e.surface !== 'terminal'
    const intro = (
      <Markdown
        text={
          '**Pulse** shows the *technical layer*. The mod itself is a thin script. A **Node sidecar** runs next to it, samples the CPU, and reads git. The mod asks it for JSON on `localhost` each 3 seconds and draws the answer.'
        }
      />
    )
    if (!s) {
      return (
        <Box flexDirection="column" gap={1}>
          {intro}
          <Text dimColor>Starting the sidecar...</Text>
        </Box>
      )
    }
    const lastCpu = s.cpu.length ? s.cpu[s.cpu.length - 1] : 0
    return (
      <Box flexDirection="column" gap={1}>
        {intro}
        <Box borderStyle="round" borderColor="success" paddingX={1} flexDirection="column">
          <Text>
            <Text color="success">● sidecar alive</Text> node {s.node} / pid {s.pid}
          </Text>
          <Text dimColor>
            127.0.0.1:{s.port} / up {s.upSec} s / {s.cores} cores
          </Text>
        </Box>
        {hasSvg ? <Svg source={cpuChart(s.cpu)} alt={`CPU chart, now ${lastCpu} percent`} width={340} height={96} /> : <Text>CPU {lastCpu}%</Text>}
        {hasSvg ? (
          <Svg source={memBar(s.memUsedGb, s.memTotalGb)} alt={`Memory ${s.memUsedGb} of ${s.memTotalGb} GB`} width={340} height={30} />
        ) : (
          <Text>
            Memory {s.memUsedGb} of {s.memTotalGb} GB
          </Text>
        )}
        {s.repo.isRepo ? (
          <Box flexDirection="column">
            <Text bold>
              Git <Text color="claude">{s.repo.branch}</Text>{' '}
              <Text dimColor>{s.repo.changed.length ? `${s.repo.changed.length} changed files` : 'working tree clean'}</Text>
            </Text>
            {s.repo.changed.slice(0, 6).map(f => (
              <Text color={f.code === '??' ? 'warning' : f.code.includes('D') ? 'error' : 'suggestion'} wrap="truncate-end">
                {f.code.padEnd(2)} {f.path}
              </Text>
            ))}
          </Box>
        ) : (
          <Text dimColor>This folder is not a git repo.</Text>
        )}
        {s.repo.commits.length ? (
          <Box flexDirection="column">
            <Text bold>Last commits</Text>
            {s.repo.commits.map(c => (
              <Text wrap="truncate-end">
                <Text color="claude">{c.hash}</Text> {c.subject} <Text dimColor>({c.age})</Text>
              </Text>
            ))}
          </Box>
        ) : null}
        <Text dimColor>How: $.process.spawn starts Node. $.http.fetch reads it. $.state redraws the pane.</Text>
      </Box>
    )
  })
}
