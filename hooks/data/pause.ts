import type { EngineInterface, On } from 'claude-code'

import { messageOf } from '../lib/format'
import { ANY, HOLD, IDLE_PAUSE, PAUSE_HEAD, PAUSE_MESSAGE, RESUME_HEAD, isHeld, oneLine, pausePromptOf, resumePromptOf, targetsOf } from '../lib/pause'
import type { Failure, Target } from '../lib/pause'
import { runSetOf } from '../lib/totals'
import { getAgents, getCleared, getLive, getPause, getReports, getRepos, getWorkflows, savePause } from '../state/atoms'
import { askTargets } from './contract'
import { boardOf, call, isMaster } from './sources'
import { sendText } from './status'

const START = /^mcp__ccd_session__start_session$/

let running = ''
let settle = ''
let isPressing = false
let isAwaiting = false
let isSent = false
let aborted = ''
let held = false
let isBusy = false

type Outcome = { target: Target; isStopped: boolean; reason?: string }

async function holding($: EngineInterface) {
  try {
    held = isHeld((await getPause($)).state)
  } catch {
    return held
  }
  return held
}

async function taskStop($: EngineInterface, taskId: string) {
  if (!taskId) throw new Error('no task id to stop')
  const verdict = await $.tool.check({ tool: 'TaskStop', input: { task_id: taskId } })
  if (verdict.decision !== 'allow') throw new Error(verdict.decision === 'ask' ? 'needs your approval, so ask the master to stop it' : verdict.reason || 'denied')
  const out = await $.tool.call({ tool: 'TaskStop', task_id: taskId })
  if ('deny' in out && out.deny) throw new Error(out.deny)
  if ('isError' in out && out.isError) throw new Error(out.text || 'TaskStop failed')
}

async function stopTarget($: EngineInterface, target: Target): Promise<Outcome> {
  try {
    if (target.kind === 'session') await call($, 'ccd_session_mgmt', 'stop_session', { session_id: target.id })
    else await taskStop($, target.taskId)
  } catch (error) {
    const reason = oneLine(messageOf(error))
    $.ui.toast(`Couldn't stop ${target.name}: ${reason}`)
    return { target, isStopped: false, reason }
  }
  if (target.kind !== 'session' || (await sendText($, target, PAUSE_MESSAGE)) !== 'failed') return { target, isStopped: true }
  $.ui.toast(`${target.name} is stopped but did not get PAUSE; its Monitors may wake it.`)
  return { target, isStopped: true, reason: 'stopped, but PAUSE not delivered' }
}

async function targetsFor($: EngineInterface) {
  const { board } = await boardOf($)
  const live = await getLive($)
  const set = runSetOf({ board, live, agents: await getAgents($), workflows: await getWorkflows($), cleared: await getCleared($), at: await $.clock.now(), trees: await getRepos($) })
  const onBoard = new Set(board?.sessions.map(one => one.id))
  const items = set.items.filter(item => item.kind !== 'session' || onBoard.has(item.id) || item.row.live?.startedBy === live.self)
  const engines = Object.fromEntries(askTargets(await getReports($), live, set.rows.map(row => row.id)).map(one => [one.id, one.engineId]))
  return targetsOf({ listed: await $.agent.list(), items, engines })
}

async function submit($: EngineInterface, text: string) {
  isAwaiting = true
  try {
    const out = await $.prompt.submit({ text })
    isSent = true
    return out.drop === undefined ? undefined : oneLine(out.drop) || 'dropped'
  } catch (error) {
    return oneLine(messageOf(error))
  }
}

function finish($: EngineInterface) {
  isPressing = false
  isAwaiting = false
  isSent = false
  settle = ''
  $.ui.invalidate('ui.render')
}

function begin() {
  isPressing = true
  isSent = false
  aborted = ''
  settle = ''
}

async function startPause($: EngineInterface) {
  begin()
  const targets = await targetsFor($)
  const at = await $.clock.now()
  await savePause($, () => ({ state: 'pausing', at, agents: targets.filter(one => one.kind !== 'session').length, sessions: targets.filter(one => one.kind === 'session').length, failed: [], isLedgerMissing: false }))
  held = true
  $.ui.invalidate('ui.render')
  aborted = running
  if (running) await $.turn.abort({ turnId: running }).catch(() => undefined)
  const alive = new Set((await $.agent.list()).flatMap(one => (one.status === 'running' ? [one.id] : [])))
  const outcomes = await Promise.all(targets.map((target): Promise<Outcome> | Outcome => (target.kind === 'agent' && !alive.has(target.id) ? { target, isStopped: true } : stopTarget($, target))))
  const failed: Failure[] = outcomes.flatMap(one => (one.reason ? [{ target: one.target, reason: one.reason }] : []))
  const stopped = outcomes.filter(one => one.isStopped && !one.reason).map(one => one.target)
  await savePause($, pause => ({ ...pause, failed: outcomes.filter(one => !one.isStopped).map(one => one.target.name) }))
  const refusal = await submit($, pausePromptOf({ at, stopped, failed }))
  if (refusal === undefined || (await getPause($)).state !== 'pausing') return
  $.ui.toast(`Paused, but the ledger was not written: ${refusal}. Type pause in the chat.`)
  await savePause($, pause => ({ ...pause, state: 'paused', isLedgerMissing: true }))
  finish($)
}

async function startResume($: EngineInterface) {
  begin()
  await savePause($, pause => ({ ...pause, state: 'resuming' }))
  held = false
  $.ui.invalidate('ui.render')
  const refusal = await submit($, resumePromptOf())
  if (refusal === undefined || (await getPause($)).state !== 'resuming') return
  $.ui.toast(`Couldn't resume: ${refusal}`)
  await savePause($, pause => ({ ...pause, state: 'paused' }))
  held = true
  finish($)
}

export async function pressPause($: EngineInterface) {
  if (isBusy) return
  isBusy = true
  try {
    if (!(await isMaster($))) return
    const { state } = await getPause($)
    if (state === 'running') await startPause($)
    else if (state === 'paused') await startResume($)
  } catch (error) {
    isPressing = false
    throw error
  } finally {
    isBusy = false
  }
}

export async function clearPause($: EngineInterface) {
  held = false
  isBusy = false
  await savePause($, () => IDLE_PAUSE)
  finish($)
}

async function settled($: EngineInterface, turnId: string) {
  const { state } = await getPause($)
  if (state !== 'pausing' && state !== 'resuming') return
  if (isPressing && turnId !== settle && !(isSent && turnId !== aborted)) return
  const isPause = state === 'pausing'
  await savePause($, pause => (isPause ? { ...pause, state: 'paused' } : IDLE_PAUSE))
  held = isPause
  finish($)
}

export function resetPause() {
  running = ''
  settle = ''
  isPressing = false
  isAwaiting = false
  isSent = false
  aborted = ''
  held = false
  isBusy = false
}

export function pauseHooks(on: On) {
  on('turn.start', { turnId: ANY }, async ($, e, next) => {
    const started = await next(e)
    if (e.agentId !== undefined) return started
    running = e.turnId
    if (isAwaiting && (e.text.startsWith(PAUSE_HEAD) || e.text.startsWith(RESUME_HEAD))) settle = e.turnId
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', { turnId: ANY }, async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done
    if (running === e.turnId) running = ''
    await settled($, e.turnId).catch(() => undefined)
    return done
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => ((await holding($)) && e.origin.kind === 'scheduled-trigger' ? { drop: HOLD } : next(e))).catch(($, e, next) => (next.called ? next(e) : held && e.origin.kind === 'scheduled-trigger' ? { drop: HOLD } : next(e)))

  on('agent.spawn', { prompt: ANY }, async ($, e, next) => ((await holding($)) ? { deny: HOLD } : next(e))).catch(($, e, next) => (next.called ? next(e) : held ? { deny: HOLD } : next(e)))

  on('tool.call', { tool: START }, async ($, e, next) => ((await holding($)) ? { deny: HOLD } : next(e))).catch(($, e, next) => (next.called ? next(e) : held ? { deny: HOLD } : next(e)))
}
