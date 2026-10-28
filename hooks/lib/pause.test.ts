import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import type { Pause } from '../../types'
import { clockOf } from './list'
import type { ListItem } from './list'
import { HOLD, IDLE_PAUSE, PAUSE_HEAD, RESUME_HEAD, isHeld, pauseButtonOf, pausePromptOf, pauseStatusOf, resumePromptOf, targetsOf, waitingOf } from './pause'
import type { Target } from './pause'

const at = 3_600_000

const pause = (patch: Partial<Pause>): Pause => ({ ...IDLE_PAUSE, ...patch })

const sub = (id: string, status: AgentInfo['status']): AgentInfo => ({ id, description: `task ${id}`, type: 'general-purpose', status })

const row = (id: string, isRunning: boolean, isArchived = false) => ({ id, name: id, title: '', state: 'working' as const, live: { id, name: id, title: '', cwd: '/', isRunning, isArchived, lastActivityAt: 0 } })

const items = [
  { kind: 'session', id: 'run', group: 'working', status: 'working', row: row('run', true) },
  { kind: 'session', id: 'idle', group: 'waiting', status: 'waiting', row: row('idle', false) },
  { kind: 'session', id: 'gone', group: 'done', status: 'done', row: row('gone', true, true) },
  { kind: 'workflow', id: 'wf_1', group: 'working', status: 'working', run: { id: 'wf_1', name: 'review', taskId: 'task1', state: 'running' } },
  { kind: 'workflow', id: 'wf_2', group: 'working', status: 'working', run: { id: 'wf_2', name: 'orphan', state: 'running' } },
  { kind: 'workflow', id: 'wf_3', group: 'done', status: 'done', run: { id: 'wf_3', name: 'over', taskId: 'task3', state: 'done' } },
  { kind: 'subagent', id: 'sa', group: 'working', status: 'working', agent: { id: 'sa', state: 'running' } },
] as unknown as ListItem[]

test('targets are the running subagents, workflows and sessions only, and a workflow without a task id still counts', () => {
  const targets = targetsOf({ listed: [sub('a1', 'running'), sub('a2', 'idle'), sub('a3', 'waiting')], items, engines: { run: 'engine-run' } })
  expect(targets).toEqual([
    { kind: 'agent', id: 'a1', taskId: 'a1', name: 'task a1' },
    { kind: 'session', id: 'run', engineId: 'engine-run', name: 'run' },
    { kind: 'workflow', id: 'wf_1', taskId: 'task1', name: 'review' },
    { kind: 'workflow', id: 'wf_2', taskId: '', name: 'orphan' },
  ])
})

test('the prompt names stopped pieces and failures on one line each, cut to 120 characters', () => {
  const stopped: Target[] = [{ kind: 'agent', id: 'a', taskId: 'a', name: 'alpha' }]
  const failed = [{ target: { kind: 'agent', id: 'b', taskId: 'b', name: 'beta' } as Target, reason: `line one\n${'x'.repeat(300)}` }]
  const text = pausePromptOf({ at, stopped, failed })
  expect(text.startsWith(PAUSE_HEAD)).toBe(true)
  expect(text).toContain(`at ${clockOf(at)}.`)
  expect(text).toContain('Stopped: alpha.')
  expect(text).toContain(`Failed: beta (line one ${'x'.repeat(111)});`)
  expect(text).not.toContain('\n')
  expect(pausePromptOf({ at, stopped: [], failed: [] })).toContain('Stopped: nothing. Failed: none;')
})

test('the resume prompt opens with its head and names the resume steps', () => {
  const text = resumePromptOf()
  expect(text.startsWith(RESUME_HEAD)).toBe(true)
  for (const word of ['RESUME', 'heartbeat', 'board']) expect(text).toContain(word)
})

test('the header status per state, with singular wording', () => {
  const board = { plan: [{ name: 'a', state: 'working' }, { name: 'b', state: 'verifying' }, { name: 'c', state: 'done' }] } as never
  expect(pauseStatusOf(IDLE_PAUSE, board)).toBeUndefined()
  expect(pauseStatusOf(pause({ state: 'pausing', agents: 1, sessions: 1 }), board)).toEqual({ text: 'Pausing: stopping 1 agent and 1 session', icon: 'idle', tone: 'muted' })
  expect(pauseStatusOf(pause({ state: 'pausing', agents: 3, sessions: 0 }), board)?.text).toBe('Pausing: stopping 3 agents and 0 sessions')
  expect(pauseStatusOf(pause({ state: 'paused', at }), board)).toEqual({ text: `Paused at ${clockOf(at)} · 2 pieces waiting`, icon: 'idle', tone: 'amber' })
  expect(pauseStatusOf(pause({ state: 'paused', at }), { plan: [{ name: 'a', state: 'working' }] } as never)?.text).toBe(`Paused at ${clockOf(at)} · 1 piece waiting`)
  expect(pauseStatusOf(pause({ state: 'paused', at, failed: ['x'] }), null)?.text).toBe(`Paused at ${clockOf(at)} · 0 pieces waiting · 1 still running`)
  expect(pauseStatusOf(pause({ state: 'paused', at, isLedgerMissing: true, failed: ['x', 'y'] }), board)?.text).toBe('Paused · ledger not written: type pause in the chat · 2 still running')
  expect(pauseStatusOf(pause({ state: 'resuming' }), board)).toEqual({ text: 'Resuming', icon: 'now', tone: 'muted' })
})

test('the button flips between Pause and Resume and shows pressed while a change is under way', () => {
  const press = () => undefined
  expect(pauseButtonOf(IDLE_PAUSE, press)).toEqual({ id: 'pause', icon: 'pause', label: 'Pause', onPress: press, isPressed: false })
  expect(pauseButtonOf(pause({ state: 'pausing' }), press)).toEqual({ id: 'pause', icon: 'pause', label: 'Pause', onPress: press, isPressed: true })
  expect(pauseButtonOf(pause({ state: 'paused' }), press)).toEqual({ id: 'pause', icon: 'now', label: 'Resume', onPress: press, isPressed: false })
  expect(pauseButtonOf(pause({ state: 'resuming' }), press)).toEqual({ id: 'pause', icon: 'now', label: 'Resume', onPress: press, isPressed: true })
})

test('only pausing and paused hold the guards, and the hold text names Resume', () => {
  expect(['running', 'pausing', 'paused', 'resuming'].map(state => isHeld(state as Pause['state']))).toEqual([false, true, true, false])
  expect(HOLD).toBe('Paused from the master pane: ask the user to press Resume.')
  expect(waitingOf(null)).toBe(0)
})
