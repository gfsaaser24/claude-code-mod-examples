// Pulse sidecar: a plain Node program next to the mod.
// It samples the CPU each second, reads git with read-only commands,
// and serves one JSON document on a random localhost port.
import http from 'node:http'
import os from 'node:os'
import { execFile } from 'node:child_process'

const cwd = process.argv[2] || process.cwd()
const samples = []

function cpuTimes() {
  let idle = 0
  let total = 0
  for (const core of os.cpus()) {
    for (const k in core.times) total += core.times[k]
    idle += core.times.idle
  }
  return { idle, total }
}

let prev = cpuTimes()
setInterval(() => {
  const now = cpuTimes()
  const dt = now.total - prev.total
  const di = now.idle - prev.idle
  prev = now
  samples.push(dt > 0 ? Math.round((1 - di / dt) * 100) : 0)
  if (samples.length > 60) samples.shift()
}, 1000)

function git(args) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, timeout: 4000, windowsHide: true }, (err, out) => resolve(err ? null : String(out)))
  })
}

let repo = { isRepo: false, branch: '', changed: [], commits: [] }
let repoAt = 0
async function refreshRepo() {
  if (Date.now() - repoAt < 5000) return
  repoAt = Date.now()
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === null) {
    repo = { isRepo: false, branch: '', changed: [], commits: [] }
    return
  }
  const status = (await git(['status', '--porcelain'])) ?? ''
  const log = (await git(['log', '-5', '--pretty=format:%h%x09%s%x09%cr'])) ?? ''
  repo = {
    isRepo: true,
    branch: branch.trim(),
    changed: status.split('\n').filter(Boolean).slice(0, 40).map(l => ({ code: l.slice(0, 2).trim() || '?', path: l.slice(3) })),
    commits: log.split('\n').filter(Boolean).map(l => {
      const [hash, subject, age] = l.split('\t')
      return { hash, subject, age }
    }),
  }
}

const server = http.createServer(async (req, res) => {
  await refreshRepo()
  res.setHeader('content-type', 'application/json')
  res.end(
    JSON.stringify({
      pid: process.pid,
      node: process.version,
      upSec: Math.round(process.uptime()),
      cores: os.cpus().length,
      cpu: samples,
      memUsedGb: +((os.totalmem() - os.freemem()) / 2 ** 30).toFixed(1),
      memTotalGb: +(os.totalmem() / 2 ** 30).toFixed(1),
      repo,
    }),
  )
})
server.listen(0, '127.0.0.1', () => console.log('PORT=' + server.address().port))
