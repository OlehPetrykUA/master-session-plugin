import type { LiveSession, Repo } from '../../../types'

import { stepOf } from '../../lib/board'
import { compactOf, modelOf } from '../../lib/format'
import { across, tall } from '../../lib/layout'
import { clockOf } from '../../lib/list'
import { activityOf, elapsedOf, headOf, othersOf, syncOf, titleOf, whereOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
import { C, LABEL } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Actions, Ui } from '../types'
import { Activity } from './Activity'
import { ArchiveBox } from './ArchiveBox'
import { Block } from './Block'
import { Blocker } from './Blocker'
import { Commits } from './Commits'
import { DetailCard } from './DetailCard'
import { DetailHeader } from './DetailHeader'
import { lossesOf } from './losses'
import { Pair } from './Pair'
import { Tests } from './Tests'

export type SessionDetailProps = { row: Row; trees: readonly Repo[]; sessions: readonly LiveSession[]; home: string; at: number; asking: string; isReadOnly: boolean; innerWidth: number; actions: Actions }

type ActionRowProps = { row: Row; losses: readonly string[]; width: number; isAsking: boolean; isReadOnly: boolean; actions: Actions }

function ActionRow(ui: Ui, props: ActionRowProps) {
  const { Box } = ui
  const { row, losses, width, actions } = props
  const id = row.id
  const isRunning = !!row.live?.isRunning
  const isNeeds = row.state === 'needs-you'
  const canArchive = !!row.live && !isRunning && !isNeeds && !props.isReadOnly
  const archive = () => (losses.length ? actions.confirm(`archive:${id}`) : actions.archive([row], undefined, losses))
  if (props.isAsking && canArchive) return ArchiveBox(ui, { id, name: row.name, losses, width, onCancel: () => actions.confirm(''), onArchive: () => actions.archive([row], undefined, losses) })
  if (isNeeds && !row.board?.needsYou && row.live)
    return (
      <Box key={`actions-${id}`} flexDirection="row" gap={across(8)}>
        <Box flexDirection="row" width="50%" flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `chat-${id}`, kind: 'primary', icon: 'chat', label: 'Open chat', size: 'b40', iconSize: 16, wide: (width - 8) / 2, onPress: () => actions.open(id, row.name) })}
        </Box>
        <Box flexDirection="row" width="50%" flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `open-${id}`, kind: 'secondary', icon: 'open', label: 'Open', size: 'b40', iconSize: 16, wide: (width - 8) / 2, onPress: () => actions.open(id, row.name) })}
        </Box>
      </Box>
    )
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
  const { row, trees, home, at, actions } = props
  const facts = row.board
  const now = row.live
  const step = stepOf(facts?.progress)
  const found = whereOf(row, trees)
  const where = found?.tree
  const others = othersOf(row, where, trees, home)
  const model = modelOf(now?.model, now?.effort)
  const activity = activityOf(row)
  const files = facts?.files ?? []
  const losses = lossesOf(row, trees, props.sessions)
  const idle = now ? at - now.lastActivityAt : 0
  const open = () => actions.open(row.id, row.name)
  const half = (label: string, icon: Parameters<typeof Block>[1]['icon'], children: Parameters<typeof Block>[1]['children'], id: string) => Block(ui, { id: `${id}-${row.id}`, icon, label, children, isHalf: true })

  return DetailCard(ui, {
    id: row.id,
    isNeeds: row.state === 'needs-you',
    children: [
      DetailHeader(ui, {
        id: row.id,
        state: row.state,
        title: titleOf(row),
        word: LABEL[row.state],
        parts: [step ? `step ${step.done} of ${step.total}${step.label ? `: ${step.label}` : ''}` : '', elapsedOf(row, at)],
        steps: step ? { done: step.done, total: step.total } : { done: 0, total: 0 },
        onCollapse: () => actions.collapse(row.id),
      }),
      facts?.needsYou
        ? Blocker(ui, {
            id: row.id,
            label: 'Blocker',
            lines: [
              { text: facts.needsYou, isStrong: true },
              { text: 'waiting for your answer', isStrong: false },
            ],
            chat: now ? { width: props.innerWidth - 24, onPress: open } : undefined,
          })
        : null,
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
          'clock',
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
            ),
            right: half('Model', 'model', Strong(ui, { text: model || '—', isFull: true }), 'model'),
          })
        : null,
      facts?.verified ? Block(ui, { id: `verified-${row.id}`, icon: 'check', label: 'Verified', children: Strong(ui, { text: facts.verified, isFull: true }) }) : null,
      facts?.risk ? Block(ui, { id: `risk-${row.id}`, icon: 'blocker', label: 'Risk', children: Strong(ui, { text: facts.risk, isFull: true }) }) : null,
      ActionRow(ui, { row, losses, width: props.innerWidth, isAsking: props.asking === `archive:${row.id}`, isReadOnly: props.isReadOnly, actions }),
    ],
  })
}
