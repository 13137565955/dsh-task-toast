/**
 * dsh-task-toast: show a Windows bottom-right popup when one DSH turn ends,
 * with the turn's own cost and token count.
 *
 * Cost is estimated from provider-reported usage at DeepSeek's published CNY
 * per-million-token prices (peak/valley). Nothing is persisted.
 *
 * @module dsh-task-toast
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOAST_SCRIPT = path.join(HERE, '..', 'assets', 'toast.ps1')
const TOAST_MS = 5000

/** CNY per million tokens as [valley, peak]. Source: DeepSeek API pricing. */
const FLASH = { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] }
const PRO = { hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] }

/** Beijing-time weekday peak windows: 09:00-12:00 and 14:00-18:00. */
const PEAK_HOURS = [[9, 12], [14, 18]]

/**
 * 2026 statutory holidays: billed at valley price all day.
 * shortcut: only 2026 is listed; add next year's dates when the State Council publishes them.
 */
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
])

const TITLES = {
  completed: '任务完成',
  aborted: '任务已停止',
  error: '任务出错',
  blocked: '任务已结束',
  'max-tokens': '任务已结束',
}

/** Peak index into a price row, or 0 for the valley price. */
function peakIndex(nowMs) {
  const bj = new Date(nowMs + 8 * 3600 * 1000)
  const day = bj.toISOString().slice(0, 10)
  const dow = bj.getUTCDay()
  if (dow === 0 || dow === 6 || HOLIDAYS.has(day)) return 0
  const hour = bj.getUTCHours()
  return PEAK_HOURS.some(([start, end]) => hour >= start && hour < end) ? 1 : 0
}

function priceFor(model) {
  return /pro/.test(String(model || '').toLowerCase()) ? PRO : FLASH
}

/** Price one provider usage sample in CNY. */
export function messageCost(model, usage, nowMs = Date.now()) {
  const peak = peakIndex(nowMs)
  const p = priceFor(model)
  const hit = Number(usage.cacheReadTokens) || 0
  const miss = Number(usage.inputTokens) || 0
  const out = Number(usage.outputTokens) || 0
  // reasoningTokens are already included in outputTokens; never bill them twice.
  return (hit / 1e6) * p.hit[peak] + (miss / 1e6) * p.miss[peak] + (out / 1e6) * p.out[peak]
}

function formatCost(cny) {
  if (cny >= 1) return '¥' + cny.toFixed(2)
  return '¥' + cny.toFixed(4)
}

function formatTokens(tokens) {
  if (tokens >= 1e6) return (tokens / 1e6).toFixed(1) + 'M tokens'
  if (tokens >= 1e3) return (tokens / 1e3).toFixed(1) + 'k tokens'
  return String(tokens) + ' tokens'
}

let currentToast = null

function showToast(title, sub, cost) {
  // The popup is a PowerShell WinForms window, so Windows only.
  if (process.platform !== 'win32') return
  // One toast at a time: a newer turn replaces the one still on screen instead
  // of stacking two windows in the same corner.
  if (currentToast && currentToast.exitCode === null) {
    try { currentToast.kill() } catch {}
  }
  // No `detached`: a detached PowerShell starts without a console and exits
  // before running the script on Windows. The unref'd child still outlives the
  // Host, which is all a 5s popup needs.
  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', TOAST_SCRIPT,
    '-Title', title, '-Sub', sub, '-Cost', cost, '-Ms', String(TOAST_MS),
  ], { stdio: 'ignore', windowsHide: true })
  child.on('error', () => {})
  child.unref()
  currentToast = child
}

export const name = 'task-toast'
export function apply(ctx) {
  const turns = new Map() // sessionId -> { turn, cost, tokens, model }
  const subagents = new Set() // sessions spawned as subagents: no toast of their own

  const rememberSubagent = (info) => {
    const id = info && info.id
    if (!id) return
    if (subagents.size >= 500) subagents.clear()
    subagents.add(String(id))
  }

  const finishTurn = (sessionId, data) => {
    const agg = turns.get(sessionId)
    turns.delete(sessionId)
    if (!agg || agg.cost <= 0 || subagents.has(sessionId)) return
    const title = TITLES[data && data.reason && data.reason.kind] || '任务结束'
    const model = agg.model || 'unknown'
    showToast(title, model + ' · ' + formatTokens(agg.tokens), formatCost(agg.cost))
  }

  ctx.on('subagent/start', rememberSubagent)
  ctx.on('subagent/end', rememberSubagent)
  ctx.on('session/disposed', (session) => {
    if (session && session.id) turns.delete(session.id)
  })
  ctx.on('session/event', (session, event) => {
    try {
      const data = event && event.data
      if (!data || typeof data !== 'object') return
      const sessionId = (session && session.id) || 'default'
      if (event.type === 'turn/end') {
        finishTurn(sessionId, data)
        return
      }
      if (event.type !== 'assistant/message') return
      const usage = data.usage
      const turn = Number(data.turn)
      if (!usage || typeof usage !== 'object' || !Number.isFinite(turn)) return
      let agg = turns.get(sessionId)
      if (!agg || agg.turn !== turn) {
        agg = { turn, cost: 0, tokens: 0, model: '' }
        turns.set(sessionId, agg)
      }
      const model = (data.message && data.message.source && data.message.source.model) || ''
      if (model) agg.model = model
      agg.cost += messageCost(model, usage)
      agg.tokens += (Number(usage.inputTokens) || 0)
        + (Number(usage.cacheReadTokens) || 0)
        + (Number(usage.outputTokens) || 0)
    } catch {
      // A malformed event must never break the agent loop.
    }
  })
}
