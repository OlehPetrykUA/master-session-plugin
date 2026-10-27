import { compactOf, modelOf } from '../../lib/format'
import { across } from '../../lib/layout'
import { clockOf, foldPath, oneLine, relativeOf, shortNameOf } from '../../lib/list'
import type { Context, ListItem } from '../../lib/list'
import { headOf, syncOf, whereOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
import { activityWordsOf } from '../../lib/status'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Card } from '../list/Card'
import type { RowProps } from '../list/Row'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Actions, Ui } from '../types'
import { Activity } from './Activity'
import { ArchiveBox } from './ArchiveBox'
import { Block } from './Block'
import { Commits } from './Commits'
import { Lead } from './Lead'
import { lossLineOf, lossesOf } from './losses'
import { ModelValue } from './Model'
import { Pair } from './Pair'
import { Tests } from './Tests'

export type SessionDetailProps = { item: Extract<ListItem, { kind: 'session' }>; context: Context; rowProps: RowProps; home: string; asking: string; innerWidth: number; actions: Actions }

type ActionRowProps = { row: Row; canOpen: boolean; name: string; losses: readonly string[]; width: number; isAsking: boolean; actions: Actions }

function ActionRow(ui: Ui, props: ActionRowProps) {
  const { Box } = ui
  const { row, losses, width, actions } = props
  const id = row.id
  const isRunning = !!row.live?.isRunning
  const isNeeds = row.state === 'needs-you'
  const canArchive = !!row.live && !isRunning && !isNeeds
  const archive = () => (losses.length ? actions.confirm(`archive:${id}`) : actions.archive([row], undefined, losses))
  if (props.isAsking && canArchive) return ArchiveBox(ui, { id, name: props.name, losses, width, onCancel: () => actions.confirm(''), onArchive: () => actions.archive([row], undefined, losses) })
  const second =
    isRunning && !isNeeds
      ? ActionButton(ui, { id: `stop-${id}`, kind: 'secondary', icon: 'stop', label: 'Stop', size: 'b40', iconSize: 16, wide: (width - 8) / 2, onPress: () => actions.stop(id, row.name) })
      : canArchive
        ? ActionButton(ui, { id: `archive-${id}`, kind: 'secondary', icon: 'archive', label: losses.length ? 'Archive…' : 'Archive', size: 'b40', iconSize: 16, wide: (width - 8) / 2, onPress: archive })
        : null
  return (
    <Box key={`actions-${id}`} flexDirection="row" gap={across(8)}>
      {props.canOpen ? (
        <Box flexDirection="row" width={second ? '50%' : '100%'} flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `open-${id}`, kind: 'secondary', icon: 'open', label: 'Open', size: 'b40', iconSize: 16, wide: second ? (width - 8) / 2 : width, onPress: () => actions.open(id, row.name) })}
        </Box>
      ) : null}
      {second ? (
        <Box flexDirection="row" width={props.canOpen ? '50%' : '100%'} flexShrink={1} minWidth={0}>
          {second}
        </Box>
      ) : null}
    </Box>
  )
}

export function SessionDetail(ui: Ui, props: SessionDetailProps) {
  const { Text } = ui
  const { item, context, home, actions } = props
  const { row } = item
  const { trees, at } = context
  const facts = row.board
  const now = row.live
  const found = whereOf(row, trees)
  const where = found?.tree
  const model = modelOf(now?.model, now?.effort)
  const activity = activityWordsOf(row)
  const files = facts?.files ?? []
  const losses = lossesOf(row, trees, context.sessions)
  const idle = now ? at - now.lastActivityAt : 0
  const half = (label: string, icon: IconName, children: Parameters<typeof Block>[1]['children'], id: string, gap?: number) => Block(ui, { id: `${id}-${row.id}`, icon, label, children, isHalf: true, gap })
  const pathRoom = props.innerWidth - 24
  const loss = item.status === 'done' ? lossLineOf(row, trees, context.sessions) : ''
  return Card(ui, {
    ...props.rowProps,
    children: [
      ...Lead(ui, { item, context, home }),
      Pair(ui, {
        id: `pair-now-${row.id}`,
        left: half('Now', 'now', Strong(ui, { text: facts?.now || '—', isFull: true }), 'now'),
        right: half('Next', 'next', Strong(ui, { text: facts?.next || '—', isFull: true }), 'next'),
      }),
      activity.length ? Activity(ui, { id: row.id, activity }) : null,
      facts?.tests?.length ? Tests(ui, { id: row.id, tests: facts.tests, width: props.innerWidth }) : null,
      facts?.commits?.length ? Commits(ui, { id: row.id, commits: facts.commits }) : null,
      files.length
        ? Block(ui, {
            id: `files-${row.id}`,
            icon: 'files',
            label: 'Files owned',
            children: [
              Strong(ui, { text: `${files.length} file${files.length === 1 ? '' : 's'}`, isFull: true }),
              ...files.slice(0, 3).map((path, index) => (
                <Text key={`file-${row.id}-${index}`} size="footnote" color={C.muted} mono wrap="truncate-middle">
                  {foldPath(oneLine(relativeOf(path, [where?.path ?? '', found?.repo.path ?? ''], home)), pathRoom)}
                </Text>
              )),
              files.length > 3 ? Quiet(ui, { text: `+${files.length - 3} more`, isFull: true }) : null,
            ],
          })
        : null,
      Block(ui, {
        id: `git-${row.id}`,
        icon: where && !where.isMain ? 'branch' : 'git',
        label: 'Git',
        children: where
          ? [
              Strong(ui, { text: where.dirty ? `${where.dirty} uncommitted` : 'clean', isFull: true }),
              Quiet(ui, { text: loss || syncOf(where), isFull: true }),
              Quiet(ui, { text: where.isMain ? [where.branch, where.sha].filter(Boolean).join(' · ') : `${where.path.split('/').at(-1) ?? ''} · ${headOf(where)}`, isMono: true, isFull: true }),
            ]
          : [Strong(ui, { text: facts?.git ?? '—', isFull: true }), facts?.location ? Quiet(ui, { text: facts.location, isMono: true, isFull: true }) : null],
      }),
      Pair(ui, {
        id: `pair-model-time-${row.id}`,
        left: half('Model', 'modelChip', ModelValue(ui, { id: row.id, model: now?.model, text: model || '—' }), 'model', 8),
        right: half(
          'Time',
          'elapsed',
          now
            ? [
                Strong(ui, { text: now.createdAt !== undefined ? `started ${clockOf(now.createdAt)}` : (facts?.time ?? '—'), isFull: true }),
                Quiet(ui, { text: now.isRunning ? 'active now' : row.state === 'done' ? `idle ${compactOf(idle)}` : `active ${compactOf(idle)} ago`, isFull: true }),
              ]
            : Strong(ui, { text: facts?.time ?? '—', isFull: true }),
          'time',
        ),
      }),
      ActionRow(ui, { row, canOpen: !!item.isOwn, name: shortNameOf(item), losses, width: props.innerWidth, isAsking: props.asking === `archive:${row.id}`, actions }),
    ],
  })
}
