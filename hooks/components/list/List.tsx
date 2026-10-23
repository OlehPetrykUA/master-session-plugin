import type { RenderChildren } from 'claude-code'

import { isArchivable } from '../../data/contract'
import { bodyWidthOf, across, down } from '../../lib/layout'
import { ARCHIVED_PEEK, EMPTY_TEXT, GROUP_LABEL, CHAT_LABEL, archivedItemOf, chatTargetOf, openIdOf, plural, shownArchived } from '../../lib/list'
import type { ListGroup, RowItem } from '../../lib/list'
import type { Row as SessionRow } from '../../lib/rows'
import type { PaneView } from '../../lib/view'
import type { Tone } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { ArchivedDetail } from '../detail/ArchivedDetail'
import { lossesOf } from '../detail/losses'
import { SessionDetail } from '../detail/SessionDetail'
import { SubagentDetail } from '../detail/SubagentDetail'
import { UndoBar } from '../detail/UndoBar'
import { WorkflowDetail } from '../detail/WorkflowDetail'
import type { PaneData, Ui } from '../types'
import { EmptyBox } from './EmptyBox'
import { Group } from './Group'
import { Row } from './Row'
import type { RowChat } from './Row'

const TONE: Record<ListGroup['id'], Tone | undefined> = { 'needs-you': 'red', working: 'green', waiting: 'amber', done: 'grey', archived: undefined }

const CARD_INSET = 2 + 24

export function List(ui: Ui, data: PaneData, view: PaneView) {
  const { Box } = ui
  const { actions } = data
  const width = bodyWidthOf(data.columns)
  const { context } = view
  const empty = (id: string) => {
    const text = EMPTY_TEXT[data.chosen]
    const isAll = data.chosen === 'all'
    return EmptyBox(ui, {
      id,
      icon: isAll ? 'all' : data.chosen === 'archived' ? 'archive' : 'clock',
      title: text.title,
      body: text.body,
      command: isAll ? '/master-session:start' : undefined,
      onShowAll: isAll ? undefined : () => actions.filter('all'),
    })
  }
  const chatOf = (item: RowItem): RowChat | undefined => {
    const target = chatTargetOf(item, context)
    return target ? { label: CHAT_LABEL, onPress: () => actions.open(target.id, target.name) } : undefined
  }
  const itemOf = (item: RowItem, room: number): RenderChildren => {
    const onOpen = () => {
      if (item.kind === 'agent' && data.open.includes(item.id)) return actions.toggle(item.run.id)
      return actions.toggle(openIdOf(item, data.open) ?? item.id)
    }
    const rowProps = { item, context, home: data.home, width: room, isNarrow: view.isNarrow, onOpen, chat: chatOf(item) }
    if (!openIdOf(item, data.open)) return Row(ui, rowProps)
    const innerWidth = room - CARD_INSET
    if (item.kind === 'workflow') return WorkflowDetail(ui, { item, context, rowProps, innerWidth, agentOf: agent => itemOf(agent, innerWidth - 24) })
    if (item.kind === 'subagent' || item.kind === 'agent') return SubagentDetail(ui, { item, context, rowProps, innerWidth, actions })
    if (item.kind === 'archived') return ArchivedDetail(ui, { item, context, rowProps, asking: data.asking, innerWidth, actions })
    return SessionDetail(ui, { item, context, rowProps, home: data.home, asking: data.asking, innerWidth, actions })
  }
  const items = (group: ListGroup) => {
    const drawn = group.items.map(item => itemOf(item, width))
    return undone?.group === group.id ? [...drawn.slice(0, undone.index), undoBar(), ...drawn.slice(undone.index)] : drawn
  }
  const idleSessions = (group: ListGroup) =>
    group.items.flatMap((item): SessionRow[] => (item.kind === 'session' && isArchivable(item.row.board ?? { state: item.row.state }, item.row.live) ? [item.row] : []))
  const undone = data.undone
  const undoBar = () =>
    undone
      ? UndoBar(ui, {
          id: undone.group,
          name: undone.name || undefined,
          text: undone.name ? 'archived' : `Archived ${plural(undone.ids.length, 'session')}${undone.skipped ? ` · skipped ${undone.skipped} with work to keep` : ''}`,
          onUndo: undone.ids.length ? actions.undo : undefined,
        })
      : null
  const archiveAll = (rows: readonly SessionRow[]) => {
    const clean = rows.filter(row => !lossesOf(row, data.trees, context.sessions).length)
    actions.archive(clean, { group: 'done', skipped: rows.length - clean.length })
  }
  const groupOf = (group: ListGroup) => {
    if (group.id === 'archived') {
      if (data.chosen === 'archived' && !group.archived.length) return empty('archived')
      const isAllChip = data.chosen === 'all'
      const action = !isAllChip
        ? undefined
        : group.isOpen
          ? { id: 'archived-hide', icon: 'collapse' as const, label: 'Hide', onPress: () => actions.archiveView('closed') }
          : { id: 'archived-show', icon: 'expand' as const, label: 'Show', onPress: () => actions.archiveView('open') }
      return Group(ui, {
        id: 'archived',
        label: GROUP_LABEL.archived,
        count: group.archived.length,
        tone: 'grey',
        isPinned: false,
        action,
        children: group.isOpen ? shownArchived(group, data.archiveView, data.chosen).map(one => itemOf(archivedItemOf(one, data.board), width)) : [],
      })
    }
    if (!group.items.length && undone?.group !== group.id) return empty(`group-${group.id}`)
    const idle = group.id === 'done' ? idleSessions(group) : []
    return Group(ui, {
      id: group.id,
      label: GROUP_LABEL[group.id],
      count: group.items.length,
      tone: TONE[group.id],
      isPinned: group.isPinned,
      action: idle.length ? { id: 'archive-all', icon: 'archive', label: 'Archive all', onPress: () => archiveAll(idle) } : undefined,
      children: items(group),
    })
  }
  const archived = view.groups.find(group => group.id === 'archived')
  const more = archived ? archived.archived.length - ARCHIVED_PEEK : 0
  return (
    <Box key="section-list" flexDirection="column" gap={down(16)} paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(16)} paddingBottom={down(16)}>
      {data.chosen === 'all' && !view.items.length ? empty('all') : null}
      {view.groups.map(groupOf)}
      {view.hasMore ? (
        <Box key="archived-more" flexDirection="row" justifyContent="center">
          {ActionButton(ui, { id: 'archived-more', kind: 'link', icon: 'showAll', label: `Show ${more} more`, onPress: () => actions.archiveView('all'), size: 'b32', iconSize: 16 })}
        </Box>
      ) : null}
    </Box>
  )
}
