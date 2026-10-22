import { compactOf, modelOf } from '../../lib/format'
import { locate } from '../../lib/git'
import { across, down, faceWidth } from '../../lib/layout'
import { ageOf, clockOf, displayNameOf } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Card } from '../list/Card'
import type { RowProps } from '../list/Row'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Actions, Ui } from '../types'
import { Block } from './Block'
import { ModelValue } from './Model'
import { Pair } from './Pair'

export type ArchivedDetailProps = { item: Extract<RowItem, { kind: 'archived' }>; context: Context; rowProps: RowProps; asking: string; isReadOnly: boolean; innerWidth: number; actions: Actions }

export const UNARCHIVE_TEXT = 'It comes back in its group with its chat. Its worktree is made again on its next turn.'

export function ArchivedDetail(ui: Ui, props: ArchivedDetailProps) {
  const { Box } = ui
  const { item, context, actions } = props
  const { one, board } = item
  const id = one.id
  const at = context.at
  const name = displayNameOf(item)
  const label = one.name || one.title
  const isAsking = props.asking === `unarchive:${id}`
  const isGone = !locate(one.cwd, context.trees)
  const model = modelOf(one.model, one.effort)
  const width = props.innerWidth
  const half = (key: string, icon: Parameters<typeof Block>[1]['icon'], text: string, children: Parameters<typeof Block>[1]['children'], gap?: number) => Block(ui, { id: `${key}-${id}`, icon, label: text, isHalf: true, children, gap })
  const cancel = faceWidth('Cancel', 'b40') + 1
  const confirm = (
    <Box key={`unarchive-ask-${id}`} flexDirection="column" gap={down(8)} paddingX={across(11)} paddingY={down(11)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      {Strong(ui, { text: `Unarchive ${name.task || name.persona}?`, isFull: true })}
      {Quiet(ui, { text: UNARCHIVE_TEXT, isFull: true })}
      <Box key={`unarchive-buttons-${id}`} flexDirection="row" gap={across(8)} marginTop={down(4)}>
        {ActionButton(ui, { id: `unarchive-no-${id}`, kind: 'secondary', icon: 'fail', label: 'Cancel', size: 'b40', iconSize: 16, onPress: () => actions.confirm('') })}
        <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `unarchive-yes-${id}`, kind: 'primary', icon: 'unarchive', label: 'Unarchive', size: 'b40', iconSize: 16, wide: width - 24 - cancel - 8, onPress: () => actions.unarchive(one) })}
        </Box>
      </Box>
    </Box>
  )
  const buttons = (
    <Box key={`archived-actions-${id}`} flexDirection="row" gap={across(8)}>
      <Box flexDirection="row" width={props.isReadOnly ? '100%' : '50%'} flexShrink={1} minWidth={0}>
        {ActionButton(ui, { id: `archived-open-${id}`, kind: 'secondary', icon: 'open', label: 'Open', size: 'b40', iconSize: 16, wide: props.isReadOnly ? width : (width - 8) / 2, onPress: () => actions.open(id, label) })}
      </Box>
      {props.isReadOnly ? null : (
        <Box flexDirection="row" width="50%" flexShrink={1} minWidth={0}>
          {ActionButton(ui, { id: `unarchive-${id}`, kind: 'secondary', icon: 'unarchive', label: 'Unarchive', size: 'b40', iconSize: 16, wide: (width - 8) / 2, onPress: () => actions.confirm(`unarchive:${id}`) })}
        </Box>
      )}
    </Box>
  )
  return Card(ui, {
    ...props.rowProps,
    children: [
      Pair(ui, {
        id: `pair-last-${id}`,
        left: half('last', 'now', 'Last', [Strong(ui, { text: board?.done || board?.now || '—', isFull: true }), Quiet(ui, { text: `last turn ${ageOf(at - one.lastActivityAt)}`, isFull: true })]),
        right: half('time', 'elapsed', 'Time', [
          Strong(ui, { text: `archived ${clockOf(one.lastActivityAt)}`, isFull: true }),
          one.createdAt === undefined ? null : Quiet(ui, { text: `ran ${compactOf(one.lastActivityAt - one.createdAt)}`, isFull: true }),
        ]),
      }),
      Block(ui, {
        id: `place-${id}`,
        icon: 'branch',
        label: 'Worktree',
        children: [Strong(ui, { text: one.cwd.split('/').at(-1) ?? one.cwd, isMono: true, isFull: true }), isGone ? Quiet(ui, { text: 'removed at archive; made again on its next turn', isFull: true }) : null],
      }),
      Pair(ui, {
        id: `pair-git-${id}`,
        left: half('git', 'git', 'Git', [Strong(ui, { text: board?.git || '—', isFull: true }), board?.sha ? Quiet(ui, { text: board.sha, isFull: true }) : null]),
        right: half('model', 'modelChip', 'Model', ModelValue(ui, { id, model: one.model, text: model || '—' }), 8),
      }),
      isAsking ? confirm : buttons,
    ],
  })
}
