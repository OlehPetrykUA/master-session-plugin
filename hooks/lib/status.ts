import type { AgentAsk, AgentRecord, Running, TaskText } from '../../types'

import { lossLineOf, mergedLineOf } from '../components/detail/losses'
import { durationOf, tokensOf } from '../components/detail/format'
import { pillsOf } from '../components/detail/Tests'
import type { Status } from '../theme/icons'
import type { WorkflowAgent } from './agents'
import { stepOf } from './board'
import { compactOf } from './format'
import { MASTER, ageOf, displayNameOf, isStartedBy, nameText, oneLine, parentsOf, sessionOfAgent, spanOf, tildeOf } from './list'
import type { Context, ListItem, RowItem } from './list'
import { locate } from './git'
import { activityOf, whereOf } from './rows'
import type { Row } from './rows'

export type StateWord = { text: 'needs you' | 'running' | 'waiting' | 'done' | 'failed' | 'archived'; glyph: Status }

export type Sentence = { text: string; isAlert: boolean }

type Agent = AgentRecord | WorkflowAgent

const WORD: Record<Status, StateWord> = {
  needs: { text: 'needs you', glyph: 'needs' },
  working: { text: 'running', glyph: 'working' },
  waiting: { text: 'waiting', glyph: 'waiting' },
  ready: { text: 'waiting', glyph: 'waiting' },
  queued: { text: 'waiting', glyph: 'waiting' },
  idle: { text: 'waiting', glyph: 'idle' },
  verified: { text: 'done', glyph: 'done' },
  merged: { text: 'done', glyph: 'done' },
  done: { text: 'done', glyph: 'done' },
  unmerged: { text: 'done', glyph: 'done' },
  failed: { text: 'failed', glyph: 'failed' },
  archived: { text: 'archived', glyph: 'archived' },
}

export const stateWordOf = (status: Status): StateWord => WORD[status]

const PROGRAMS = new Set(['git', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'node', 'python', 'pip', 'cd', 'ls', 'cat', 'rm', 'mv', 'cp', 'grep', 'rg', 'sed', 'awk', 'curl', 'wget', 'bash', 'sh', 'zsh', 'tsc', 'jq', 'make', 'docker', 'kubectl', 'mysql', 'psql', 'ssh', 'sudo', 'chmod', 'echo', 'export'])

const OPERATOR = /&&|\|\||[|;>`]|\$\(/

const FLAG = /(^|\s)--?[A-Za-z]/

const ASSIGN = /(^|\s)[A-Za-z_][A-Za-z0-9_]*=/

const wordOf = (token: string) => token.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase()

export const isCommandText = (text: string) => OPERATOR.test(text) || FLAG.test(text) || ASSIGN.test(text) || text.split(/\s+/).some(token => PROGRAMS.has(wordOf(token)))

const SHELL = ['Bash', 'BashOutput', 'KillShell', 'PowerShell']

const clean = (text: string | undefined) => {
  const flat = oneLine(text ?? '')
  return flat && !isCommandText(flat) ? flat : ''
}

const firstLineOf = (text: string | undefined) => clean((text ?? '').split('\n').find(line => line.trim()))

const firstSentenceOf = (text: string | undefined) => oneLine(text ?? '').match(/^.*?[.!?](?=\s|$)|^.+$/)?.[0]?.replace(/\.+$/, '') ?? ''

const stop = (text: string) => text.replace(/[.\s]+$/, '')

const SHELL_EVENT = /^(ran|running|asked to use|used) (Bash|BashOutput|KillShell|PowerShell)\b/i

const sessionItemOf = (row: Row): ListItem => ({ kind: 'session', id: row.id, group: row.state, status: 'working', row })

const personaOfRow = (row: Row | undefined) => (row ? displayNameOf(sessionItemOf(row)).persona : undefined)

export function starterOf(item: RowItem, context: Context): string {
  if (item.kind === 'session') return item.isOwn ? MASTER : ''
  if (item.kind === 'archived') return isStartedBy(item.one, context.self) ? MASTER : ''
  if (item.kind === 'agent') return 'Workflow'
  if (item.kind === 'workflow') return personaOfRow(context.rows.find(row => row.id === item.run.parentSessionId)) ?? MASTER
  return parentsOf(item, context).at(-1)?.persona ?? MASTER
}

export function nameIdentOf(item: RowItem, context: Context): { full: string; ident: string } {
  const full = nameText(displayNameOf(item))
  if (item.kind === 'session') return { full, ident: `session ${item.row.name} · started by ${item.isOwn ? 'this master' : 'you'}` }
  if (item.kind === 'archived') return { full, ident: `session ${item.one.name} · archived` }
  if (item.kind === 'workflow') return { full, ident: `workflow ${item.run.name} · run ${item.run.id}` }
  if (item.kind === 'agent') return { full, ident: `workflow agent ${item.agent.type}` }
  return { full, ident: `subagent ${item.agent.type}` }
}

const taskTextOf = (task: TaskText | undefined) => (task?.state === 'pending' ? 'pending' : task?.state === 'done' && task.text && clean(task.text) ? { text: task.text } : undefined)

export function taskOf(item: RowItem, context: Context): { text: string } | 'pending' | undefined {
  if (item.kind === 'session') return item.isOwn ? taskTextOf(context.tasks?.[item.id]) : undefined
  if (item.kind === 'archived') return isStartedBy(item.one, context.self) ? taskTextOf(context.tasks?.[item.id]) : undefined
  if (item.kind === 'workflow') return taskTextOf(item.run.task)
  return taskTextOf(item.agent.task)
}

export const partOfOf = (item: Extract<RowItem, { kind: 'agent' }>): readonly [string, string] => [`Workflow · ${item.run.name}`, `agent ${item.run.agents.findIndex(one => one.id === item.agent.id) + 1} of ${item.run.counts.total}`]

export function activityWordsOf(row: Row): ReturnType<typeof activityOf> {
  if (!row.board) return []
  const activity = (row.board.activity ?? []).flatMap(line => {
    const cut = line.lastIndexOf(' · ')
    const text = cut > 0 ? line.slice(0, cut) : line
    const tail = cut > 0 ? line.slice(cut) : ''
    const shell = SHELL_EVENT.exec(text)?.[0]
    const shown = shell ?? text
    return !shell && isCommandText(shown) ? [] : [`${shown}${tail}`]
  })
  return activityOf({ ...row, board: { ...row.board, activity } })
}

const hostOf = (text: string) => (/\s/.test(text) || !URL.canParse(text) ? '' : new URL(text).hostname)

const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

function foldOf(path: string) {
  const parts = path.split('/')
  return parts.length > 4 ? [parts[0], '…', ...parts.slice(-2)].join('/') : path
}

function placeOf(running: Running, home: string) {
  const text = (running.text ?? '').trim()
  if (!text || SHELL.includes(running.tool)) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return hostOf(text)
  if (/\s/.test(text) || isCommandText(text)) return ''
  if (/^(\/|~\/|\.\/)/.test(text)) return foldOf(tildeOf(text, home))
  return BARE_HOST.test(text) ? text : ''
}

function liveOf(running: Running, at: number, home: string, step = '') {
  const span = spanOf(running.since, undefined, at)
  const place = placeOf(running, home)
  const what = place ? `${running.tool} on ${place}` : SHELL.includes(running.tool) || running.text ? `a ${running.tool} command` : running.tool
  return `Running ${what} for ${span}${step}`
}

const listed = (names: readonly string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

const checksOf = (tests: readonly string[]) => {
  const count = pillsOf(tests).filter(pill => !pill.isFailed).length
  return count ? `${count} ${count === 1 ? 'check' : 'checks'} passed` : ''
}

const chatOf = (row: Row | undefined) => (row ? `${nameText(displayNameOf(sessionItemOf(row)))}’s chat` : 'this chat')

function waitingOnOf(children: readonly AgentRecord[]) {
  const named = children.map(child => `“${clean(displayNameOf({ kind: 'subagent', id: child.id, group: 'working', status: 'working', agent: child }).task) || clean(child.type) || 'subagent'}”`)
  if (named.length > 1) return `Waiting for its ${named.length} subagents ${listed(named)} to finish`
  const why = children[0]?.task?.state === 'done' ? clean(firstSentenceOf(children[0].task.text)) : ''
  return `Waiting for its subagent ${named[0]} to finish${why ? `: ${why}` : ''}`
}

function askedOf(ask: AgentAsk | string | undefined, who: string, where: string) {
  const text = typeof ask === 'string' ? ask : ask?.text
  const tool = /^Allow ([A-Za-z0-9_.-]+)(?::|$)/.exec(text ?? '')?.[1]
  return [`Needs you: ${who} ${tool ? `asks to use ${tool}` : 'is waiting for your answer'}`, `Answer in ${where}`]
}

function sessionParts(item: Extract<RowItem, { kind: 'session' }>, context: Context, home: string): string[] {
  const { row } = item
  const board = row.board
  const tail = item.isOwn ? ' (Open chat on the top row)' : ''
  if (item.status === 'needs') return askedOf(board?.needsYou, 'it', `its chat${tail}`)
  if (item.status === 'working') {
    const running = context.running?.[item.id]
    const step = stepOf(board?.progress)
    if (running) return [liveOf(running, context.at, home, step ? `, step ${step.done} of ${step.total}${clean(step.label) ? `: ${clean(step.label)}` : ''}` : '')]
    return [`Running${clean(step?.label || board?.now) ? `: ${clean(step?.label || board?.now)}` : ''}`]
  }
  if (item.status === 'ready') {
    const branch = whereOf(row, context.trees)?.tree.branch
    const checks = checksOf(board?.tests ?? [])
    return [`Waiting for QA: ready at ${board?.sha ?? 'its last commit'}${branch ? ` on ${branch}` : ''}${checks ? `; ${checks}` : ''}`]
  }
  if (item.status === 'idle') {
    const last = activityWordsOf(row)[0]?.text
    return [`Idle${row.live ? ` for ${compactOf(context.at - row.live.lastActivityAt)}` : ''}${last ? `; last: ${last}` : ''}`]
  }
  if (item.status === 'waiting') {
    const children = context.agents.filter(one => one.parentSessionId === row.id && !one.parentAgentId && one.state === 'running')
    if (children.length) return [waitingOnOf(children)]
    return [`Waiting${clean(board?.now) ? `: ${clean(board?.now)}` : ''}`]
  }
  if (item.status === 'verified') return [`Verified${board?.sha ? ` at ${board.sha}` : ''} and waiting for the merge`]
  if (item.status === 'merged') return [`Done: ${mergedLineOf(row, context.trees)}${board?.sha ? ` at ${board.sha}` : ''}`]
  const loss = lossLineOf(row, context.trees, context.sessions)
  if (loss) return [`Done, but ${loss}`]
  const done = firstLineOf(board?.done)
  return [done ? `Done: ${done}` : 'Done; not verified']
}

function agentParts(item: Extract<RowItem, { kind: 'subagent' | 'agent' }>, context: Context, home: string): string[] {
  const agent: Agent = item.agent
  const durationAt = (end: number | undefined) => durationOf((end ?? context.at) - agent.startedAt)
  if (item.status === 'needs') return askedOf(agent.asking, 'it', chatOf(item.kind === 'agent' ? context.rows.find(row => row.id === item.run.parentSessionId) : sessionOfAgent(item.agent, context)))
  if (item.status === 'working') {
    const running = context.running?.[item.id]
    return [running ? liveOf(running, context.at, home) : `Running for ${spanOf(agent.startedAt, undefined, context.at)}`]
  }
  if (item.status === 'waiting') {
    const children = context.agents.filter(one => one.parentAgentId === agent.id && one.state === 'running')
    return [children.length ? waitingOnOf(children) : 'Waiting']
  }
  if (item.status === 'failed') {
    const reason = firstLineOf(agent.result)
    return [reason ? `Failed after ${durationAt(agent.endedAt)}: ${reason}` : `Failed after ${durationAt(agent.endedAt)}${agent.result?.trim() ? '' : '; it stopped without an answer'}`]
  }
  const result = firstLineOf(agent.result)
  return [`Done in ${durationAt(agent.endedAt)}${result ? `: ${result}` : ''}`, ...(agent.tokens ? [`Used ${tokensOf(agent.tokens)}`] : [])]
}

function runParts(item: Extract<RowItem, { kind: 'workflow' }>, context: Context): string[] {
  const { run } = item
  const { done, total } = { done: run.counts.done, total: run.counts.total }
  if (item.status === 'needs') {
    const asking = run.agents.find(one => one.asking && one.state === 'running')
    const who = asking ? nameText(displayNameOf({ kind: 'agent', id: asking.id, group: 'needs-you', status: 'needs', run, agent: asking })) : 'an agent'
    return askedOf(asking?.asking, who, chatOf(context.rows.find(row => row.id === run.parentSessionId)))
  }
  if (item.status === 'failed') {
    const failed = run.agents.find(one => one.state === 'failed')
    const reason = firstLineOf(failed?.result)
    return [`Failed: ${failed?.label ?? 'an agent'} ${reason ? `threw “${reason}”` : 'failed'}; ${done} of ${total} agents finished`]
  }
  if (item.status === 'working') return [total ? `Running: ${done} of ${total} agents done` : 'Starting: no agent has started yet']
  return [`Done in ${durationOf((run.endedAt ?? context.at) - run.startedAt)}: ${done} of ${total} agents finished`]
}

function archivedParts(item: Extract<RowItem, { kind: 'archived' }>, context: Context): string[] {
  const isGone = context.trees.length > 0 && !locate(item.one.cwd, context.trees)
  return [`Archived ${ageOf(context.at - item.one.lastActivityAt)}${item.board?.verified ? ', after QA passed' : ''}${isGone ? '; its worktree was removed and is made again on its next turn' : ''}`]
}

export function statusSentenceOf(item: RowItem, context: Context, home: string): Sentence {
  const parts = item.kind === 'session' ? sessionParts(item, context, home) : item.kind === 'workflow' ? runParts(item, context) : item.kind === 'archived' ? archivedParts(item, context) : agentParts(item, context, home)
  const raised = item.kind === 'session' && !!item.row.board?.risk
  const risk = item.kind === 'session' ? clean(item.row.board?.risk) : ''
  const body = parts.filter(Boolean).map(stop).join('. ')
  return { text: `${body}${risk ? `; risk: ${stop(risk)}` : raised ? '; it reported a risk' : ''}.`, isAlert: item.status === 'needs' || item.status === 'failed' || raised }
}
