import { isArchivable } from '../data/contract'
import type { Context, ListGroup } from '../lib/list'
import type { Row } from '../lib/rows'
import { lossesOf } from './detail/losses'
import type { PaneData } from './types'

export function clearOf(group: ListGroup, data: PaneData, context: Context) {
  if (group.id !== 'done') return undefined
  const idle = group.items.flatMap((item): Row[] => (item.kind === 'session' && isArchivable(item.row.board ?? { state: item.row.state }, item.row.live) ? [item.row] : []))
  const clean = idle.filter(row => !lossesOf(row, data.trees, context.sessions).length)
  const isReady = clean.length > 0 || group.items.some(item => item.kind !== 'session')
  return isReady ? { rows: clean, skipped: idle.length - clean.length } : undefined
}
