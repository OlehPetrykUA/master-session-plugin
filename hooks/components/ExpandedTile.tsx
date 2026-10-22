import type { Repo } from '../../types'

import { isArchivable } from '../data/contract'
import { stepOf } from '../lib/board'
import { agoOf, modelOf, spanOf } from '../lib/format'
import { dirtyOf } from '../lib/git'
import { across, down, tall } from '../lib/layout'
import { activityOf, elapsedOf, headOf, othersOf, syncOf, whereOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { C } from '../theme/tokens'
import { ArchiveConfirm } from './ArchiveConfirm'
import { Activity } from './detail/Activity'
import { Block } from './detail/Block'
import { Blocker } from './detail/Blocker'
import { Commits } from './detail/Commits'
import { DetailActions } from './detail/DetailActions'
import { DetailHeader } from './detail/DetailHeader'
import { Pair } from './detail/Pair'
import { Tests } from './detail/Tests'
import { Verified } from './detail/Verified'
import { Quiet } from './Quiet'
import { Strong } from './Strong'
import type { Actions, Ui } from './types'

export type ExpandedTileProps = { row: Row; trees: readonly Repo[]; home: string; at: number; asking: string; isReadOnly: boolean; innerWidth: number; actions: Actions }

export function ExpandedTile(ui: Ui, props: ExpandedTileProps) {
  const { Box, Text } = ui
  const { row, trees, home, at, asking, actions } = props
  const facts = row.board
  const now = row.live
  const step = stepOf(facts?.progress)
  const found = whereOf(row, trees)
  const where = found?.tree
  const isNeeds = row.state === 'needs-you'
  const isIdle = !!now && !now.isRunning
  const dirty = where ? dirtyOf(where, facts?.files ?? [], home) : 0
  const others = othersOf(row, where, trees, home)
  const model = modelOf(now?.model, now?.effort)
  const meta = [step?.label ?? '', elapsedOf(row, at), facts?.note ?? ''].filter(Boolean)
  const activity = activityOf(row)
  const files = facts?.files ?? []
  const canArchive = isIdle && isArchivable(facts ?? { state: row.state }, now) && !props.isReadOnly && asking !== `archive:${row.id}`
  const half = (props.innerWidth - 8) / 2

  return (
    <Box key={`detail-${row.id}`} flexDirection="column" gap={down(10)}>
      <Box flexDirection="column" gap={down(10)} paddingX={across(12)} paddingY={down(12)} borderStyle="round" borderColor={isNeeds ? C.red : C.border} backgroundColor={C.surface}>
        {DetailHeader(ui, { row, step, meta, dirty, onCollapse: () => actions.collapse(row.id) })}
        {facts?.needsYou ? Blocker(ui, { id: row.id, needsYou: facts.needsYou, canChat: !!now, onChat: () => actions.open(row.id, row.name) }) : null}
        {Pair(ui, {
          id: `pair-now-${row.id}`,
          left: Block(ui, { id: `now-${row.id}`, icon: 'now', label: 'Now', children: Strong(ui, { text: facts?.now || '—', isFull: true }), isHalf: true }),
          right: Block(ui, { id: `next-${row.id}`, icon: 'next', label: 'Next', children: Strong(ui, { text: facts?.next || '—', isFull: true }), isHalf: true }),
        })}
        {activity.length ? Activity(ui, { id: row.id, activity }) : null}
        {where
          ? Block(ui, {
              id: `place-${row.id}`,
              icon: where.isMain ? 'house' : 'branch',
              label: where.isMain ? 'Main checkout' : 'Worktree',
              children: [
                Strong(ui, { text: where.isMain ? (found?.repo.name ?? 'main checkout') : (where.path.split('/').at(-1) ?? ''), isMono: !where.isMain, isFull: true }),
                Quiet(ui, { text: headOf(where), isMono: true, isFull: true }),
              ],
            })
          : Block(ui, { id: `place-${row.id}`, icon: 'house', label: 'Location', children: Strong(ui, { text: facts?.location ?? '—', isFull: true }) })}
        {others.map(tree =>
          Block(ui, {
            id: `tree-${row.id}-${tree.path}`,
            icon: 'branch',
            label: 'Worktree',
            children: [Strong(ui, { text: tree.path.split('/').at(-1) ?? '', isMono: true, isFull: true }), Quiet(ui, { text: headOf(tree), isMono: true, isFull: true })],
          }),
        )}
        {Pair(ui, {
          id: `pair-git-${row.id}`,
          left: Block(ui, {
            id: `git-${row.id}`,
            icon: 'git',
            label: 'Git',
            children: where
              ? [Strong(ui, { text: where.dirty ? `${where.dirty} uncommitted` : 'clean', isFull: true }), Quiet(ui, { text: syncOf(where), isFull: true }), Quiet(ui, { text: `last ${where.sha}`, isFull: true })]
              : Strong(ui, { text: facts?.git ?? '—', isFull: true }),
            isHalf: true,
          }),
          right: Block(ui, {
            id: `time-${row.id}`,
            icon: 'clock',
            label: 'Time',
            children: now
              ? [
                  Strong(ui, { text: now.createdAt !== undefined ? `running ${spanOf(at - now.createdAt)}` : (facts?.time ?? '—'), isFull: true }),
                  Quiet(ui, { text: now.isRunning ? 'active now' : `active ${agoOf(at - now.lastActivityAt)}`, isFull: true }),
                ]
              : Strong(ui, { text: facts?.time ?? '—', isFull: true }),
            isHalf: true,
          }),
        })}
        {facts?.commits?.length ? Commits(ui, { id: row.id, commits: facts.commits }) : null}
        {facts?.tests?.length ? Tests(ui, { id: row.id, tests: facts.tests }) : null}
        {files.length
          ? Block(ui, {
              id: `files-${row.id}`,
              icon: 'files',
              label: 'Files owned',
              children: [Strong(ui, { text: `${files.length} file${files.length === 1 ? '' : 's'}`, isFull: true }), ...files.slice(0, 2).map(path => Quiet(ui, { text: path, isMono: true, isFull: true }))],
            })
          : null}
        {now?.permissionMode || model
          ? Pair(ui, {
              id: `pair-mode-${row.id}`,
              left: Block(ui, {
                id: `permission-${row.id}`,
                icon: 'permission',
                label: 'Permission',
                children: now?.permissionMode ? (
                  <Box key={`permission-pill-${row.id}`} flexDirection="row" alignSelf="flex-start" alignItems="center" minHeight={tall(26)} paddingX={across(10)} paddingY={0} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
                    <Text weight="semibold">{now.permissionMode}</Text>
                  </Box>
                ) : (
                  Strong(ui, { text: '—', isFull: true })
                ),
                isHalf: true,
                gap: 6,
              }),
              right: Block(ui, { id: `model-${row.id}`, icon: 'model', label: 'Model', children: Strong(ui, { text: model || '—', isFull: true }), isHalf: true, gap: 6 }),
            })
          : null}
        {facts?.verified ? Verified(ui, { id: row.id, text: facts.verified }) : null}
        {facts?.risk ? Block(ui, { id: `risk-${row.id}`, icon: 'blocker', label: 'Risk', children: Strong(ui, { text: facts.risk, isFull: true }) }) : null}
        {now || canArchive
          ? DetailActions(ui, { id: row.id, canOpen: !!now, canArchive, half, innerWidth: props.innerWidth, onOpen: () => actions.open(row.id, row.name), onArchive: () => actions.confirm(`archive:${row.id}`) })
          : null}
      </Box>
      {asking === `archive:${row.id}` ? ArchiveConfirm(ui, { id: row.id, title: `Archive ${row.name}?`, targets: [row], actions }) : null}
    </Box>
  )
}
