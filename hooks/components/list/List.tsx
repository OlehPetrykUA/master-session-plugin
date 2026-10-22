import { isArchivable } from '../../data/contract'
import { bodyWidthOf, across, down } from '../../lib/layout'
import { ARCHIVED_PEEK, EMPTY_TEXT, GROUP_LABEL, plural, shownArchived } from '../../lib/list'
import type { ListGroup, ListItem } from '../../lib/list'
import type { Row as SessionRow } from '../../lib/rows'
import type { PaneView } from '../../lib/view'
import type { Tone } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { lossesOf } from '../detail/losses'
import { SessionDetail } from '../detail/SessionDetail'
import { SubagentDetail } from '../detail/SubagentDetail'
import { UndoBar } from '../detail/UndoBar'
import { WorkflowDetail } from '../detail/WorkflowDetail'
import type { PaneData, Ui } from '../types'
import { ArchivedRow } from './ArchivedRow'
import { EmptyBox } from './EmptyBox'
import { Group } from './Group'
import { Row } from './Row'

const TONE: Record<ListGroup['id'], Tone | undefined> = { 'needs-you': 'red', working: 'green', waiting: 'amber', done: 'grey', archived: undefined }

export function List(ui: Ui, data: PaneData, view: PaneView) {
  const { Box } = ui
  const { actions } = data
  const isReadOnly = !!data.from
  const width = bodyWidthOf(data.columns)
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
  const innerWidth = width - 2 - 24
  const collapse = (id: string) => () => actions.collapse(id)
  const detailOf = (item: ListItem) => {
    if (item.kind === 'workflow') return WorkflowDetail(ui, { run: item.run, at: data.at, innerWidth, onCollapse: collapse(item.id) })
    if (item.kind === 'subagent') return SubagentDetail(ui, { agent: item.agent, at: data.at, onCollapse: collapse(item.id) })
    return SessionDetail(ui, { row: item.row, trees: data.trees, home: data.home, at: data.at, asking: data.asking, isReadOnly, innerWidth, actions })
  }
  const items = (group: ListGroup) => {
    const drawn = group.items.map(item => {
      if (data.open.includes(item.id)) return detailOf(item)
      const name = item.kind === 'session' ? item.row.name : item.id
      return Row(ui, { item, trees: data.trees, home: data.home, at: data.at, isNarrow: view.isNarrow, width, onOpen: () => actions.toggle(item.id), onChat: () => actions.open(item.id, name) })
    })
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
          text: undone.name ? 'archived, worktree removed' : `Archived ${plural(undone.ids.length, 'session')}${undone.skipped ? ` · skipped ${undone.skipped} with work to keep` : ''}`,
          onUndo: undone.ids.length ? actions.undo : undefined,
        })
      : null
  const archiveAll = (rows: readonly SessionRow[]) => {
    const clean = rows.filter(row => !lossesOf(row, data.trees).length)
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
        icon: 'archive',
        isPinned: false,
        action,
        children: group.isOpen ? shownArchived(group, data.archiveView, data.chosen).map(one => ArchivedRow(ui, { one, at: data.at, asking: data.asking, isReadOnly, actions })) : [],
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
      action: idle.length && !isReadOnly ? { id: 'archive-all', icon: 'archive', label: 'Archive all', onPress: () => archiveAll(idle) } : undefined,
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
