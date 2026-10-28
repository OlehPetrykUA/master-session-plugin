import { spanOf } from '../../lib/list'
import type { RowItem } from '../../lib/list'

export const tokensOf = (count: number) => `${count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count} tokens`

export function runningTimeOf(item: RowItem, at: number) {
  if (item.kind === 'workflow') return item.run.state === 'running' ? spanOf(item.run.startedAt, undefined, at) : ''
  if (item.kind !== 'subagent' && item.kind !== 'agent') return ''
  const { agent } = item
  return agent.state === 'running' ? spanOf(item.status === 'needs' && agent.asking ? agent.asking.since : agent.startedAt, undefined, at) : ''
}
