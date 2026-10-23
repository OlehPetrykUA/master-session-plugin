import type { RowItem } from '../../lib/list'

const pad = (value: number) => String(value).padStart(2, '0')

export function durationOf(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`
}


export const tokensOf = (count: number) => `${count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count} tokens`

export function runningTimeOf(item: RowItem, at: number) {
  if (item.kind === 'workflow') return item.run.state === 'running' ? durationOf(at - item.run.startedAt) : ''
  if (item.kind !== 'subagent' && item.kind !== 'agent') return ''
  const { agent } = item
  return agent.state === 'running' ? durationOf(at - (item.status === 'needs' && agent.asking ? agent.asking.since : agent.startedAt)) : ''
}
