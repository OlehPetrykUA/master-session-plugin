import type { AgentRecord, AgentState, WorkflowRecord } from '../../types'

export type StateCounts = Record<AgentState, number> & { total: number }

export type WorkflowAgent = { id: string; index: number; label: string; type: string; model?: string; state: AgentState; startedAt: number; endedAt?: number }

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
}

export const subagentsOf = (agents: readonly AgentRecord[]) => agents.filter(agent => !agent.run)

export function stateCountsOf(agents: readonly { state: AgentState }[]): StateCounts {
  const count = (state: AgentState) => agents.filter(agent => agent.state === state).length
  return { total: agents.length, running: count('running'), done: count('done'), failed: count('failed') }
}

export function workflowRunsOf(agents: readonly AgentRecord[], workflows: readonly WorkflowRecord[]): WorkflowRun[] {
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
      })),
      counts,
    }
  })
}
