import { dirtyOf } from '../../lib/git'
import { across, down, tall } from '../../lib/layout'
import { displayNameOf, elapsedOfItem, lineOf, stepsOfItem } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { whereOf } from '../../lib/rows'
import { STATUS, gitPill, statusBadge, toneRing } from '../../theme/icons'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Hit } from '../Hit'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type RowChat = { label: string; onPress: () => void }

export type RowProps = { item: RowItem; context: Context; home: string; width: number; isNarrow: boolean; isInCard?: boolean; onOpen: () => void; chat?: RowChat }

export const ROW_HEIGHT = 56

const KIND_ICON: Record<RowItem['kind'], IconName> = { session: 'session', archived: 'session', subagent: 'agent', agent: 'agent', workflow: 'flow' }

export const KIND_WORD: Record<RowItem['kind'], string> = { session: 'Session', archived: 'Archived session', subagent: 'Subagent', agent: 'Workflow agent', workflow: 'Workflow' }

export function Row(ui: Ui, props: RowProps) {
  const { Box, Text, Button, Svg } = ui
  const { item, context, isNarrow } = props
  const name = displayNameOf(item)
  const line = lineOf(item, context)
  const status = STATUS[item.status]
  const isNeeds = item.status === 'needs'
  const elapsed = elapsedOfItem(item, context.at)
  const steps = stepsOfItem(item)
  const where = item.kind === 'session' ? whereOf(item.row, context.trees)?.tree : undefined
  const dirty = item.kind === 'session' && where ? dirtyOf(where, item.row.board?.files ?? [], props.home) : 0
  const git = dirty ? gitPill(dirty) : undefined
  const id = `${props.isInCard ? 'top' : 'row'}-${item.id}`
  const muted = (text: string, key: string) => (
    <Box key={key} flexShrink={0}>
      <Text size="footnote" color={C.muted}>
        {text}
      </Text>
    </Box>
  )
  const glyph = (key: string, icon: IconName, tone: typeof status.tone, alt?: string) => (
    <Box key={key} flexDirection="row" alignItems="center" height={tall(16)} flexShrink={0}>
      {Icon(ui, { id: key, name: icon, size: 12, tone, weight: 2.2, alt })}
    </Box>
  )
  const question = (
    <Box key={`${id}-ask`} flexDirection="row" alignItems="flex-start" gap={across(4)} minWidth={0} flexShrink={1}>
      {glyph(`${id}-ask-icon`, 'needs', 'red')}
      <Box flexShrink={1} minWidth={0}>
        <Text size="footnote" weight="semibold" color={C.red} wrap="wrap">
          {line.text}
        </Text>
      </Box>
    </Box>
  )
  const tail = isNarrow && elapsed && !(isNeeds && props.chat) ? ` · ${elapsed}` : ''
  const second = (
    <Box key={`${id}-line`} flexDirection="row" alignItems={isNeeds ? 'flex-start' : 'center'} gap={across(4)} minWidth={0}>
      {glyph(`${id}-kind`, KIND_ICON[item.kind], 'muted', KIND_WORD[item.kind])}
      {line.chain ? muted(line.chain, `${id}-chain`) : null}
      {isNeeds && !line.chain ? question : null}
      {line.word ? glyph(`${id}-word-icon`, STATUS[line.word.status].icon, STATUS[line.word.status].tone) : null}
      {line.word ? (
        <Box key={`${id}-word`} flexShrink={0}>
          <Text size="footnote" weight="semibold" color={C.text}>
            {line.word.text}
          </Text>
        </Box>
      ) : null}
      {line.word && line.text ? muted('·', `${id}-dot`) : null}
      {!isNeeds && (line.text || tail) ? (
        <Box key={`${id}-text`} flexShrink={1} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            {`${line.text}${tail}`}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
  const meta =
    isNeeds && props.chat ? null : isNarrow ? null : (
      <Box key={`${id}-meta`} flexDirection="column" alignItems="flex-end" gap={down(4)} flexShrink={0}>
        {elapsed ? (
          <Box flexDirection="row" alignItems="center" gap={across(4)}>
            {Icon(ui, { id: `${id}-elapsed`, name: 'elapsed', size: 12, tone: 'muted', weight: 2.2 })}
            <Text size="footnote" color={C.muted} tabular>
              {elapsed}
            </Text>
          </Box>
        ) : null}
        {item.kind === 'session' && !isNeeds ? (
          <Box flexDirection="row" alignItems="center" gap={across(4)} height={tall(16)}>
            {git ? <Svg key={`${id}-git`} source={git.source} alt={`${dirty} uncommitted`} width={git.width} height={16} /> : null}
            {Icon(ui, { id: `${id}-place`, name: where?.isMain === false ? 'branch' : 'house', size: 14, tone: 'faint', weight: 2, alt: where?.isMain === false ? 'worktree' : 'main checkout' })}
          </Box>
        ) : null}
      </Box>
    )
  return (
    <Box
      key={id}
      flexDirection="row"
      alignItems="center"
      gap={across(12)}
      minHeight={tall(ROW_HEIGHT)}
      paddingTop={down(8)}
      paddingBottom={down(8)}
      paddingLeft={across(12)}
      paddingRight={across(8)}
      borderStyle={props.isInCard ? undefined : 'round'}
      borderColor={props.isInCard ? undefined : isNeeds ? C.red : C.border}
      backgroundColor={props.isInCard ? undefined : C.surface}
      hover={props.isInCard ? undefined : { backgroundColor: C.tileHover, borderColor: isNeeds ? C.red : C.accentRing }}
    >
      <Svg key={`${id}-badge`} source={statusBadge(item.status, 28)} alt={status.word} width={28} height={28} />
      <Box flexDirection="column" gap={down(2)} flexGrow={1} flexShrink={1} minWidth={0}>
        <Box flexDirection="row" alignItems="center" gap={across(4)} minWidth={0}>
          <Box flexShrink={0}>
            {ui.Client ? (
              <Text weight="semibold" size="heading">
                {name.persona}
              </Text>
            ) : (
              <Button key={`${props.isInCard ? 'top' : 'row'}-open-${item.id}`} plain label={name.persona} onPress={props.onOpen} hover={{ backgroundColor: C.clear }} />
            )}
          </Box>
          {name.task ? (
            <Box flexShrink={0}>
              <Text size="heading" color={C.muted}>
                ·
              </Text>
            </Box>
          ) : null}
          {name.task ? (
            <Box flexShrink={1} minWidth={0}>
              <Text size="heading" color={C.muted} wrap="truncate-end">
                {name.task}
              </Text>
            </Box>
          ) : null}
        </Box>
        {second}
        {isNeeds && line.chain ? question : null}
      </Box>
      {meta}
      {steps && !(isNeeds && props.chat) && !isNarrow ? <Svg key={`${id}-ring`} source={toneRing(steps.done, steps.total, status.tone)} alt={`${steps.done} of ${steps.total}`} width={34} height={34} /> : null}
      {ui.Client ? Hit(ui, { id, width: props.width, height: ROW_HEIGHT, onPress: props.onOpen }) : null}
      {isNeeds && props.chat ? ActionButton(ui, { id: `chat-${item.id}`, kind: 'primary', icon: 'chat', label: props.chat.label, onPress: props.chat.onPress, size: 'b32', iconSize: 16, isIconOnly: isNarrow }) : null}
    </Box>
  )
}
