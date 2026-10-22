import { across, down } from '../lib/layout'
import type { Row } from '../lib/rows'
import { C } from '../theme/tokens'
import { ActionButton } from './ActionButton'
import { Quiet } from './Quiet'
import { Strong } from './Strong'
import type { Actions, TextUi, Ui } from './types'

export type ArchiveConfirmProps = { id: string; title: string; targets: readonly Row[]; actions: Actions }

const NOTE = 'Its process stops and its worktree is cleaned up. You can unarchive it from the Archived filter.'

export function ArchiveConfirm(ui: TextUi | Ui, props: ArchiveConfirmProps) {
  const { Box, Text, Button } = ui
  const archive = () => props.actions.archive(props.targets)
  const keep = () => props.actions.confirm('')
  if ('Svg' in ui)
    return (
      <Box key={`confirm-${props.id}`} flexDirection="column" gap={down(8)} paddingX={across(12)} paddingY={down(12)} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
        {Strong(ui, { text: props.title, isFull: true })}
        {Quiet(ui, { text: NOTE, isFull: true })}
        <Box flexDirection="row" gap={across(8)}>
          {ActionButton(ui, { id: `archive-yes-${props.id}`, kind: 'primary', icon: 'archive', label: 'Archive', onPress: archive, size: 'm' })}
          {ActionButton(ui, { id: `archive-no-${props.id}`, kind: 'secondary', icon: 'check', label: 'Keep it', onPress: keep, size: 'm' })}
        </Box>
      </Box>
    )
  return (
    <Box key={`confirm-${props.id}`} flexDirection="column" gap="xs">
      <Text weight="semibold" size="footnote">
        {props.title}
      </Text>
      <Text dimColor size="caption">
        {NOTE}
      </Text>
      <Box flexDirection="row" gap="sm">
        <Button key={`archive-yes-${props.id}`} label="Archive" variant="primary" onPress={archive} />
        <Button key={`archive-no-${props.id}`} label="Keep it" onPress={keep} />
      </Box>
    </Box>
  )
}
