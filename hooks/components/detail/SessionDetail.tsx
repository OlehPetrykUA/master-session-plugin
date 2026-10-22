import { compactOf, modelOf } from '../../lib/format'
import { across, tall } from '../../lib/layout'
import { clockOf, shortNameOf } from '../../lib/list'
import type { Context, ListItem } from '../../lib/list'
import { activityOf, headOf, othersOf, syncOf, whereOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
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
import { Callout } from './Callout'
import { Commits } from './Commits'
import { lossesOf } from './losses'
import { ModelValue } from './Model'
import { Pair } from './Pair'
import { Tests } from './Tests'

export type SessionDetailProps = { item: Extract<ListItem, { kind: 'session' }>; context: Context; rowProps: RowProps; home: string; asking: string; isReadOnly: boolean; innerWidth: number; actions: Actions }

type ActionRowProps = { row: Row; name: string; losses: readonly string[]; width: number; isAsking: boolean; isReadOnly: boolean; actions: Actions }

function ActionRow(ui: Ui, props: ActionRowProps) {
  const { Box } = ui
  const { row, losses, width, actions } = props
  const id = row.id
  const isRunning = !!row.live?.isRunning
  const isNeeds = row.state === 'needs-you'
  const canArchive = !!row.live && !isRunning && !isNeeds && !props.isReadOnly
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
      <Box flexDirection="row" width={second ? '50%' : '100%'} flexShrink={1} minWidth={0}>
        {ActionButton(ui, { id: `open-${id}`, kind: 'secondary', icon: 'open', label: 'Open', size: 'b40', iconSize: 16, wide: second ? (width - 8) / 2 : width, onPress: () => actions.open(id, row.name) })}
      </Box>
      {second ? (
        <Box flexDirection="row" width="50%" flexShrink={1} minWidth={0}>
          {second}
        </Box>
      ) : null}
    </Box>
  )
}

export function SessionDetail(ui: Ui, props: SessionDetailProps) {
  const { Box, Text } = ui
  const { item, context, home, actions } = props
  const { row } = item
  const { trees, at } = context
  const facts = row.board
  const now = row.live
  const found = whereOf(row, trees)
  const where = found?.tree
  const others = othersOf(row, where, trees, home)
  const model = modelOf(now?.model, now?.effort)
  const activity = activityOf(row)
  const files = facts?.files ?? []
  const losses = lossesOf(row, trees, context.sessions)
  const idle = now ? at - now.lastActivityAt : 0
  const half = (label: string, icon: IconName, children: Parameters<typeof Block>[1]['children'], id: string, gap?: number) => Block(ui, { id: `${id}-${row.id}`, icon, label, children, isHalf: true, gap })
  const base = found?.repo.base ?? 'main'
  const callout =
    item.status === 'ready'
      ? Callout(ui, { id: row.id, status: 'ready', label: 'Ready for verify', lines: [{ text: [`ready ${facts?.sha ?? ''}`.trim(), where?.branch ? `on ${where.branch}` : ''].filter(Boolean).join(' '), isStrong: true }, ...(facts?.tests?.length ? [{ text: `gate: ${facts.tests.join(', ')}`, isStrong: false }] : [])] })
      : item.status === 'verified'
        ? Callout(ui, { id: row.id, status: 'verified', label: 'Verified', lines: [{ text: facts?.verified ?? '', isStrong: true }, { text: `merge to ${base} pending`, isStrong: false }] })
        : null
  return Card(ui, {
    ...props.rowProps,
    children: [
      callout,
      Pair(ui, {
        id: `pair-now-${row.id}`,
        left: half('Now', 'now', Strong(ui, { text: facts?.now || '—', isFull: true }), 'now'),
        right: half('Next', 'next', Strong(ui, { text: facts?.next || '—', isFull: true }), 'next'),
      }),
      activity.length ? Activity(ui, { id: row.id, activity }) : null,
      where
        ? Block(ui, {
            id: `place-${row.id}`,
            icon: where.isMain ? 'house' : 'branch',
            label: where.isMain ? 'Main checkout' : 'Worktree',
            children: [
              Strong(ui, { text: where.isMain ? (found?.repo.name.split('/').at(-1) ?? 'main checkout') : (where.path.split('/').at(-1) ?? ''), isMono: true, isFull: true }),
              Quiet(ui, { text: where.isMain ? [where.branch, where.sha].filter(Boolean).join(' · ') : headOf(where), isMono: true, isFull: true }),
            ],
          })
        : Block(ui, { id: `place-${row.id}`, icon: 'house', label: 'Location', children: Strong(ui, { text: facts?.location ?? '—', isFull: true }) }),
      ...others.map(tree =>
        Block(ui, {
          id: `tree-${row.id}-${tree.path}`,
          icon: 'branch',
          label: 'Worktree',
          children: [Strong(ui, { text: tree.path.split('/').at(-1) ?? '', isMono: true, isFull: true }), Quiet(ui, { text: headOf(tree), isMono: true, isFull: true })],
        }),
      ),
      Pair(ui, {
        id: `pair-git-${row.id}`,
        left: half(
          'Git',
          'git',
          where ? [Strong(ui, { text: where.dirty ? `${where.dirty} uncommitted` : 'clean', isFull: true }), Quiet(ui, { text: syncOf(where), isFull: true })] : Strong(ui, { text: facts?.git ?? '—', isFull: true }),
          'git',
        ),
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
      facts?.commits?.length ? Commits(ui, { id: row.id, commits: facts.commits }) : null,
      facts?.tests?.length ? Tests(ui, { id: row.id, tests: facts.tests }) : null,
      files.length
        ? Block(ui, {
            id: `files-${row.id}`,
            icon: 'files',
            label: 'Files owned',
            children: [
              Strong(ui, { text: `${files.length} file${files.length === 1 ? '' : 's'}`, isFull: true }),
              ...files.slice(0, 3).map(path => Quiet(ui, { text: path, isMono: true, isFull: true })),
              files.length > 3 ? Quiet(ui, { text: `+${files.length - 3} more`, isFull: true }) : null,
            ],
          })
        : null,
      now?.permissionMode || model
        ? Pair(ui, {
            id: `pair-mode-${row.id}`,
            left: half(
              'Permission',
              'permission',
              now?.permissionMode ? (
                <Box key={`permission-pill-${row.id}`} flexDirection="row" alignSelf="flex-start" alignItems="center" height={tall(24)} paddingX={across(8)} paddingY={0} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
                  <Text size="footnote" weight="semibold">
                    {now.permissionMode}
                  </Text>
                </Box>
              ) : (
                Strong(ui, { text: '—', isFull: true })
              ),
              'permission',
              8,
            ),
            right: half('Model', 'modelChip', ModelValue(ui, { id: row.id, model: now?.model, text: model || '—' }), 'model', 8),
          })
        : null,
      facts?.risk ? Block(ui, { id: `risk-${row.id}`, icon: 'blocker', label: 'Risk', children: Strong(ui, { text: facts.risk, isFull: true }) }) : null,
      ActionRow(ui, { row, name: shortNameOf(item), losses, width: props.innerWidth, isAsking: props.asking === `archive:${row.id}`, isReadOnly: props.isReadOnly, actions }),
    ],
  })
}
