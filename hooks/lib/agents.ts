import type { AgentAsk, AgentRecord, AgentState, Report, ReportAgent, WorkflowRecord } from '../../types'

const REPORTED_MAX = 20

const REPORTED_TEXT = 300

const clip = (text: string) => text.slice(0, REPORTED_TEXT)

const rankOf = (agent: AgentRecord) => (agent.state === 'running' && agent.asking ? 0 : agent.state === 'running' ? 1 : 2)

export type StateCounts = Record<AgentState, number> & { total: number; asking: number }

export type WorkflowAgent = { id: string; index: number; label: string; type: string; model?: string; state: AgentState; startedAt: number; endedAt?: number; result?: string; tokens?: number; asking?: AgentAsk }

export type WorkflowRun = {
  id: string
  name: string
  description: string
  taskId?: string
  phases: string[]
  state: AgentState
  startedAt: number
  endedAt?: number
  agents: WorkflowAgent[]
  counts: StateCounts
  tokens: number
}

export const subagentsOf = (agents: readonly AgentRecord[]) => agents.filter(agent => !agent.run && !agent.parentSessionId)

export function stateCountsOf(agents: readonly { state: AgentState; asking?: AgentAsk }[]): StateCounts {
  const count = (state: AgentState) => agents.filter(agent => agent.state === state).length
  const asking = agents.filter(agent => agent.state === 'running' && agent.asking).length
  return { total: agents.length, running: count('running'), done: count('done'), failed: count('failed'), asking }
}

export function workflowRunsOf(all: readonly AgentRecord[], workflows: readonly WorkflowRecord[]): WorkflowRun[] {
  const agents = all.filter(agent => !agent.parentSessionId)
  const ids = [...new Set([...workflows.map(one => one.id), ...agents.flatMap(agent => (agent.run ? [agent.run.id] : []))])]
  return ids.map(id => {
    const record = workflows.find(one => one.id === id)
    const members = agents.filter(agent => agent.run?.id === id).sort((left, right) => (left.run?.index ?? 0) - (right.run?.index ?? 0))
    const counts = stateCountsOf(members)
    const isRunning = counts.running > 0 || !members.length
    const ends = members.flatMap(agent => (agent.endedAt === undefined ? [] : [agent.endedAt]))
    return {
      id,
      name: record?.name || id,
      description: record?.description ?? '',
      taskId: record?.taskId,
      phases: record?.phases ?? [],
      state: isRunning ? 'running' : counts.failed ? 'failed' : 'done',
      startedAt: Math.min(record?.startedAt ?? Infinity, ...members.map(agent => agent.startedAt)),
      endedAt: isRunning || !ends.length ? undefined : Math.max(...ends),
      agents: members.map(agent => ({
        id: agent.id,
        index: agent.run?.index ?? 0,
        label: agent.description,
        type: agent.type,
        model: agent.model,
        state: agent.state,
        startedAt: agent.startedAt,
        endedAt: agent.endedAt,
        result: agent.result,
        tokens: agent.tokens,
        asking: agent.asking,
      })),
      counts,
      tokens: members.reduce((sum, agent) => sum + (agent.tokens ?? 0), 0),
    }
  })
}

export const asked = (agents: AgentRecord[], id: string, asking: AgentAsk | undefined) =>
  agents.map((one): AgentRecord => (one.id === id && !one.parentSessionId && (asking ? one.state === 'running' : !!one.asking) ? { ...one, asking } : one))

export const reportAgentsOf = (agents: readonly AgentRecord[]): ReportAgent[] =>
  agents
    .filter(one => !one.parentSessionId)
    .map((one, index) => ({ one, index }))
    .sort((left, right) => rankOf(left.one) - rankOf(right.one) || right.index - left.index)
    .slice(0, REPORTED_MAX)
    .map(({ one }) => ({
      id: one.id,
      type: one.type,
      description: clip(one.description),
      name: one.name,
      state: one.state,
      startedAt: one.startedAt,
      endedAt: one.endedAt,
      asking: one.asking && { ...one.asking, text: clip(one.asking.text) },
      parentAgentId: one.parentAgentId,
      runId: one.run?.id,
      runIndex: one.run?.index,
    }))

export const withReported = (agents: AgentRecord[], reports: readonly Report[]): AgentRecord[] => [
  ...agents.filter(one => !one.parentSessionId),
  ...reports.flatMap(report =>
    (report.agents ?? []).map(({ runId, runIndex, ...one }): AgentRecord => ({ ...one, parentSessionId: report.session, run: runId ? { id: runId, index: runIndex ?? 0 } : undefined })),
  ),
]
