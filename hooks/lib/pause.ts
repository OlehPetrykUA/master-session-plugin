import type { AgentInfo } from 'claude-code'

import type { Board, Pause, PauseState } from '../../types'
import type { HeaderButton } from '../components/Header'
import type { IconName } from '../theme/icons'
import type { Tone } from '../theme/tokens'
import { clockOf } from './list'
import type { ListItem } from './list'

export const IDLE_PAUSE: Pause = { state: 'running', at: 0, agents: 0, sessions: 0, failed: [], isLedgerMissing: false }

export const isHeld = (state: PauseState) => state === 'pausing' || state === 'paused'

export const HOLD = 'Paused from the master pane: ask the user to press Resume.'

export const PAUSE_HEAD = 'The user paused the run from the master pane'

export const RESUME_HEAD = 'The user resumed the run from the master pane'

export const PAUSE_MESSAGE = 'PAUSE'

export const ANY = /^/

const REASON_MAX = 120

export type Target = { kind: 'agent' | 'workflow'; id: string; taskId: string; name: string } | { kind: 'session'; id: string; engineId: string; name: string }

export type Failure = { target: Target; reason: string }

export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX)

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function targetsOf(input: { listed: readonly AgentInfo[]; items: readonly ListItem[]; engines: Readonly<Record<string, string>> }): Target[] {
  const agents = input.listed.flatMap((one): Target[] => (one.status === 'running' ? [{ kind: 'agent', id: one.id, taskId: one.id, name: oneLine(one.description || one.type) }] : []))
  const others = input.items.flatMap((item): Target[] => {
    if (item.kind === 'workflow') return item.run.state === 'running' ? [{ kind: 'workflow', id: item.run.id, taskId: item.run.taskId ?? '', name: oneLine(item.run.name) }] : []
    if (item.kind === 'session') return item.row.live?.isRunning && !item.row.live.isArchived ? [{ kind: 'session', id: item.row.id, engineId: input.engines[item.row.id] ?? '', name: oneLine(item.row.name || item.row.title || item.row.id) }] : []
    return []
  })
  return [...agents, ...others]
}

const namesOf = (names: readonly string[]) => (names.length ? names.join(', ') : 'nothing')

export function pausePromptOf(input: { at: number; stopped: readonly Target[]; failed: readonly Failure[] }) {
  const failed = input.failed.length ? input.failed.map(one => `${one.target.name} (${oneLine(one.reason)})`).join(', ') : 'none'
  return `${PAUSE_HEAD} at ${clockOf(input.at)}. Stopped: ${namesOf(input.stopped.map(one => one.name))}. Failed: ${failed}; stop any that failed yourself. Now record each piece's pending step and its worktree's \`git status --short\` in the ledger, stop the heartbeat (ScheduleWakeup with stop: true, or delete the /loop job), stop your own background jobs and Monitors (TaskStop) and list them in the ledger, post one board, then end the turn. Start, message or resume nothing.`
}

export const resumePromptOf = () =>
  `${RESUME_HEAD}. Follow the resume steps of skills/start/shape.md, Pause and resume: a fresh agent for each paused subagent piece, in its recorded worktree and briefed on its uncommitted diff and pending step; one RESUME with its pending step to each paused session; fresh Workflow calls and Monitors armed again; the heartbeat re-armed. Then post one board.`

export const waitingOf = (board: Board | null) => (board?.plan ?? []).filter(piece => piece.state === 'working' || piece.state === 'verifying').length

export function pauseStatusOf(pause: Pause, board: Board | null): { text: string; icon: IconName; tone: Tone } | undefined {
  if (pause.state === 'pausing') return { text: `Pausing: stopping ${plural(pause.agents, 'agent')} and ${plural(pause.sessions, 'session')}`, icon: 'idle', tone: 'muted' }
  if (pause.state === 'resuming') return { text: 'Resuming', icon: 'now', tone: 'muted' }
  if (pause.state === 'running') return undefined
  const still = pause.failed.length ? ` · ${pause.failed.length} still running` : ''
  const head = pause.isLedgerMissing ? 'Paused · ledger not written: type pause in the chat' : `Paused at ${clockOf(pause.at)} · ${plural(waitingOf(board), 'piece')} waiting`
  return { text: head + still, icon: 'idle', tone: 'amber' }
}

export function pauseButtonOf(pause: Pause, onPress: () => void): HeaderButton {
  const isResume = pause.state === 'paused' || pause.state === 'resuming'
  return { id: 'pause', icon: isResume ? 'now' : 'pause', label: isResume ? 'Resume' : 'Pause', onPress, isPressed: pause.state === 'pausing' || pause.state === 'resuming' }
}
