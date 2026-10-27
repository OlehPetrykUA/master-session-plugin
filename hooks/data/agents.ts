import type { AgentInfo, AgentSpawnInput, AgentSpawnResult, AgentStatus, EngineInterface, TurnCompleteInput, TurnUsage } from 'claude-code'

import type { AgentRecord, AgentState, WorkflowRecord } from '../../types'

import { getAgents, saveAgents, saveWorkflows } from '../state/atoms'
import { PLACEHOLDER, SOURCE_MAX, describe, isMasterRole } from './describe'
import { syncAgents } from './recorder'

const ENDED: Partial<Record<AgentStatus, AgentState>> = { completed: 'done', failed: 'failed', killed: 'failed' }

const TEXT_MAX = 2_000

export type AgentOutcome = { result?: string; tokens?: number }

export const clipped = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text)

export const tokensOf = (usage: TurnUsage | undefined) =>
  usage ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : undefined

const textOf = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

const QUOTED = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g

const META = /export\s+const\s+meta\s*=\s*\{/

const PHASES = /\bphases\s*:\s*\[/

const TITLE = /\btitle\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g

const launchOf = (result: unknown): Record<string, unknown> => (typeof result === 'object' && result ? { ...result } : {})

const unquoted = (quoted: string) => quoted.slice(1, -1).replace(/\\(.)/g, '$1')

function closeOf(masked: string, from: number) {
  const [open, close] = masked[from] === '[' ? ['[', ']'] : ['{', '}']
  let depth = 0
  for (let index = from; index < masked.length; index += 1) {
    depth += masked[index] === open ? 1 : masked[index] === close ? -1 : 0
    if (!depth) return index + 1
  }
  return from
}

export function phasesOf(script: string) {
  const masked = script.replace(QUOTED, quoted => `${quoted[0]}${' '.repeat(quoted.length - 2)}${quoted[0]}`)
  const meta = masked.search(META)
  if (meta < 0) return []
  const open = masked.indexOf('{', meta)
  const found = masked.slice(open, closeOf(masked, open)).search(PHASES)
  if (found < 0) return []
  const start = masked.indexOf('[', open + found)
  return [...script.slice(start, closeOf(masked, start)).matchAll(TITLE)].map(match => unquoted(match[1] ?? ''))
}

const META_DESCRIPTION = /\bdescription\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/

export function descriptionOf(script: string) {
  const masked = script.replace(QUOTED, quoted => `${quoted[0]}${' '.repeat(quoted.length - 2)}${quoted[0]}`)
  const meta = masked.search(META)
  if (meta < 0) return ''
  const open = masked.indexOf('{', meta)
  const body = script.slice(open, closeOf(masked, open))
  const found = body.match(META_DESCRIPTION)
  return found ? unquoted(found[1] ?? '') : ''
}

export function workflowSource(description: string, phases: readonly string[], script: string) {
  const head = [description, phases.length ? `Phases: ${phases.join(', ')}` : ''].filter(Boolean).join('\n')
  return [head, script].filter(Boolean).join('\n\n').slice(0, SOURCE_MAX)
}

export function spawned(agents: AgentRecord[], e: AgentSpawnInput, out: AgentSpawnResult, now: number) {
  const id = out.agentId
  if (!id || e.isTeammate) return agents
  const known = agents.find(one => one.id === id)
  const agent: AgentRecord = {
    id,
    name: e.name,
    type: e.subagentType,
    description: e.description,
    model: out.model || e.model,
    requestedModel: e.model,
    parentModel: e.parentModel,
    prompt: e.resume ? (known?.prompt ?? clipped(e.prompt)) : clipped(e.prompt),
    isBackground: e.background,
    isFork: e.fork,
    spawnedBy: known?.spawnedBy,
    run: e.workflow?.runId ? { id: e.workflow.runId, index: e.workflow.agentIndex } : undefined,
    parentAgentId: e.parentAgentId,
    state: 'running',
    startedAt: known?.startedAt ?? now,
    tokens: known?.tokens,
    task: known?.task,
  }
  return known ? agents.map(one => (one.id === id ? agent : one)) : [...agents, agent]
}

export const ended = (agents: AgentRecord[], id: string, isAnswered: boolean, now: number, outcome: AgentOutcome = {}) =>
  agents.map((one): AgentRecord =>
    one.id === id && one.state === 'running'
      ? {
          ...one,
          state: isAnswered ? 'done' : 'failed',
          endedAt: now,
          asking: undefined,
          result: outcome.result === undefined ? one.result : clipped(outcome.result),
          tokens: outcome.tokens === undefined ? one.tokens : (one.tokens ?? 0) + outcome.tokens,
        }
      : one,
  )

export function listed(agents: AgentRecord[], infos: readonly AgentInfo[], now: number) {
  const byId = new Map(infos.filter(info => !info.teammateId).map(info => [info.id, info]))
  const known = agents.map((one): AgentRecord => {
    if (one.parentSessionId) return one
    const info = byId.get(one.id)
    const named = info?.spawnedBy && info.spawnedBy !== one.spawnedBy ? { ...one, spawnedBy: info.spawnedBy } : one
    const parented = info?.parentId && !named.parentAgentId ? { ...named, parentAgentId: info.parentId } : named
    if (one.state !== 'running' || one.run) return parented
    const state = info ? ENDED[info.status] : 'done'
    return state ? { ...parented, state, endedAt: now, asking: undefined } : parented
  })
  const found = [...byId.values()]
    .filter(info => !ENDED[info.status] && !agents.some(one => one.id === info.id))
    .map((info): AgentRecord => ({ id: info.id, name: info.name, type: info.type, description: info.description, spawnedBy: info.spawnedBy, parentAgentId: info.parentId, state: 'running', startedAt: now }))
  return [...known, ...found]
}

export function launched(workflows: WorkflowRecord[], toolUseId: string, result: unknown, phases: string[], now: number) {
  const launch = launchOf(result)
  const id = launch.status === 'async_launched' ? textOf(launch.runId) : undefined
  if (!id) return workflows
  const known = workflows.find(one => one.id === id)
  const record: WorkflowRecord = { id, toolUseId, taskId: textOf(launch.taskId), name: textOf(launch.workflowName), description: textOf(launch.summary), phases, startedAt: known?.startedAt ?? now }
  return known ? workflows.map(one => (one.id === id ? record : one)) : [...workflows, record]
}

export async function recordSpawn($: EngineInterface, e: AgentSpawnInput, out: AgentSpawnResult) {
  const now = await $.clock.now()
  await saveAgents($, agents => spawned(agents, e, out, now))
  await syncAgents($)
}

export async function recordAgentEnd($: EngineInterface, e: TurnCompleteInput) {
  const id = e.agentId
  if (id === undefined) return
  const now = await $.clock.now()
  await saveAgents($, agents => ended(agents, id, e.reason === 'answer', now, { result: e.answer, tokens: tokensOf(e.usage) }))
  await syncAgents($)
}

export async function describeSpawn($: EngineInterface, e: AgentSpawnInput, out: AgentSpawnResult) {
  const id = out.agentId
  const source = clipped(e.prompt)
  if (!id || e.isTeammate || e.resume || e.prompt === PLACEHOLDER || !source.trim()) return
  await describe($, { target: { type: 'agent', id }, kind: e.workflow?.runId ? 'workflow agent' : 'subagent', name: e.description, source })
}

export async function describeMissing($: EngineInterface) {
  for (const one of await getAgents($)) {
    if (one.task || !one.prompt || one.prompt === PLACEHOLDER || !one.description) continue
    await describe($, { target: { type: 'agent', id: one.id }, kind: one.run ? 'workflow agent' : 'subagent', name: one.description, source: one.prompt })
  }
}

export async function recordWorkflow($: EngineInterface, e: { tool_use_id: string; script?: string }, result: unknown) {
  const now = await $.clock.now()
  const launch = launchOf(result)
  const path = textOf(launch.scriptPath)
  const id = launch.status === 'async_launched' ? textOf(launch.runId) : undefined
  const script = e.script ?? (path ? await $.fs.read(path).catch(() => '') : '')
  const phases = phasesOf(script)
  await saveWorkflows($, workflows => launched(workflows, e.tool_use_id, launch, phases, now))
  await syncAgents($)
  const source = workflowSource(descriptionOf(script), phases, script)
  if (id) await describe($, { target: { type: 'run', id }, kind: 'workflow', name: textOf(launch.workflowName) ?? id, source })
}

export async function refreshAgents($: EngineInterface) {
  const infos = await $.agent.list()
  const now = await $.clock.now()
  await saveAgents($, agents => listed(agents, infos, now))
  await syncAgents($)
  await describeMissing($)
}

const SESSION_ID = /local_[A-Za-z0-9][A-Za-z0-9_-]*/

export async function describeSession($: EngineInterface, e: { prompt?: unknown; title?: unknown }, result: unknown) {
  const id = JSON.stringify(result ?? '').match(SESSION_ID)?.[0]
  const source = typeof e.prompt === 'string' ? clipped(e.prompt) : ''
  if (!id || !source.trim() || !isMasterRole()) return
  await describe($, { target: { type: 'session', id }, kind: 'side chat', name: typeof e.title === 'string' && e.title ? e.title : id, source })
}
