import type { AgentInfo, AgentSpawnInput, AgentSpawnResult, AgentStatus, EngineInterface, TurnCompleteInput, TurnUsage } from 'claude-code'

import type { AgentRecord, AgentState, WorkflowRecord } from '../../types'

import { workflowRunsOf } from '../lib/agents'
import { AGENT_SHOWN_MS } from '../lib/constants'
import { getAgents, getWorkflows, saveAgents, saveWorkflows } from '../state/atoms'
import { syncAgents } from './recorder'

const ENDED: Partial<Record<AgentStatus, AgentState>> = { completed: 'done', failed: 'failed', killed: 'failed' }

const isOld = (at: number | undefined, now: number) => at !== undefined && now - at >= AGENT_SHOWN_MS

const TEXT_MAX = 2_000

export type AgentOutcome = { result?: string; tokens?: number }

const clipped = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text)

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
    prompt: clipped(e.prompt),
    isBackground: e.background,
    isFork: e.fork,
    spawnedBy: known?.spawnedBy,
    run: e.workflow?.runId ? { id: e.workflow.runId, index: e.workflow.agentIndex } : undefined,
    parentAgentId: e.parentAgentId,
    state: 'running',
    startedAt: known?.startedAt ?? now,
    tokens: known?.tokens,
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

function staleRunsOf(agents: AgentRecord[], workflows: WorkflowRecord[], now: number) {
  const runs = workflowRunsOf(agents, workflows)
  return new Set(runs.filter(run => (run.agents.length ? run.state !== 'running' && isOld(run.endedAt, now) : isOld(run.startedAt, now))).map(run => run.id))
}

export function keptAgents(agents: AgentRecord[], workflows: WorkflowRecord[], now: number) {
  const stale = staleRunsOf(agents, workflows, now)
  return agents.filter(one => (one.run ? !stale.has(one.run.id) : !isOld(one.endedAt, now)))
}

export function keptWorkflows(workflows: WorkflowRecord[], agents: AgentRecord[], now: number) {
  const stale = staleRunsOf(agents, workflows, now)
  return workflows.filter(one => !stale.has(one.id))
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

export async function recordWorkflow($: EngineInterface, e: { tool_use_id: string; script?: string }, result: unknown) {
  const now = await $.clock.now()
  const path = textOf(launchOf(result).scriptPath)
  const script = e.script ?? (path ? await $.fs.read(path).catch(() => '') : '')
  const phases = phasesOf(script)
  await saveWorkflows($, workflows => launched(workflows, e.tool_use_id, result, phases, now))
}

export async function refreshAgents($: EngineInterface) {
  const infos = await $.agent.list()
  const now = await $.clock.now()
  const workflows = await getWorkflows($)
  await saveAgents($, agents => keptAgents(listed(agents, infos, now), workflows, now))
  const agents = await getAgents($)
  await saveWorkflows($, current => keptWorkflows(current, agents, now))
  await syncAgents($)
}
