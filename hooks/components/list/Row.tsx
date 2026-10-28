import { across, down, tall } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { hitPxOf, rowFitOf } from '../../lib/rowfit'
import { ROW } from '../../lib/sections'
import { STATUS, statusBadge, toneRing } from '../../theme/icons'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { familyGlyph } from '../detail/Model'
import { Hit } from '../Hit'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type RowChat = { label: string; onPress: () => void }

export type RowProps = { item: RowItem; context: Context; width: number; isNarrow: boolean; isInCard?: boolean; onOpen: () => void; chat?: RowChat }

export const KIND_ICON: Record<RowItem['kind'], IconName> = { session: 'session', archived: 'session', subagent: 'agent', agent: 'agent', workflow: 'flow' }

export function Row(ui: Ui, props: RowProps) {
  const { Box, Text, Button, Svg } = ui
  const { item, context, isNarrow } = props
  const fit = rowFitOf(item, context, { width: props.width, isNarrow, chat: props.chat?.label, isInCard: props.isInCard })
  const { name, starter, word, model, elapsed, steps, isChatIcon, isPersonaCut } = fit
  const isNeeds = item.status === 'needs'
  const status = STATUS[item.status]
  const look = STATUS[word.glyph]
  const id = `${props.isInCard ? 'top' : 'row'}-${item.id}`
  const scope = `toggle-${id}`.slice(0, 64)
  const glyph = (key: string, icon: IconName, tone: typeof status.tone, alt?: string) => (
    <Box key={key} flexDirection="row" alignItems="center" height={tall(16)} flexShrink={0}>
      {Icon(ui, { id: key, name: icon, size: 12, tone, weight: 2.2, alt })}
    </Box>
  )
  const chevron = props.isInCard ? 'collapse' : 'expand'
  const isAlert = word.text === 'needs you' || word.text === 'failed'
  const second = (
    <Box key={`${id}-line`} flexDirection="row" alignItems="center" gap={across(4)} minWidth={0} overflow="hidden">
      {starter ? (
        <Box key={`${id}-starter`} flexShrink={1} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            {`${starter} ›`}
          </Text>
        </Box>
      ) : null}
      {glyph(`${id}-word-icon`, look.icon, look.tone)}
      <Box key={`${id}-word`} flexShrink={0}>
        <Text size="footnote" weight="semibold" color={isAlert ? C.red : C.text}>
          {word.text}
        </Text>
      </Box>
    </Box>
  )
  return (
    <Box
      key={id}
      flexDirection="row"
      alignItems="center"
      gap={across(12)}
      minHeight={tall(props.isInCard ? ROW - 6 : ROW)}
      marginTop={props.isInCard ? down(3) : undefined}
      marginBottom={props.isInCard ? down(3) : undefined}
      marginLeft={props.isInCard ? across(3) : undefined}
      marginRight={props.isInCard ? across(3) : undefined}
      paddingTop={down(props.isInCard ? 4 : 8)}
      paddingBottom={down(props.isInCard ? 4 : 8)}
      paddingLeft={across(props.isInCard ? 8 : 12)}
      paddingRight={across(props.isInCard ? 0 : 4)}
      borderStyle="round"
      borderColor={props.isInCard ? C.clear : isNeeds ? C.red : C.border}
      backgroundColor={props.isInCard ? undefined : C.surface}
      hover={props.isInCard ? { scope, backgroundColor: C.tileHover } : { scope, backgroundColor: C.tileHover, borderColor: isNeeds ? C.red : C.accentRing }}
    >
      <Svg key={`${id}-badge`} source={statusBadge(item.status, 28)} alt={status.word} width={28} height={28} />
      <Box flexDirection="column" gap={down(2)} flexGrow={1} flexShrink={1} minWidth={0}>
        <Box flexDirection="row" alignItems="center" gap={across(4)} minWidth={0}>
          <Box key={`${id}-persona`} flexShrink={isPersonaCut ? 1 : 0} minWidth={0}>
            {ui.Client ? (
              <Text weight="semibold" size="heading" wrap="truncate-end">
                {name.persona}
              </Text>
            ) : (
              <Button key={`${props.isInCard ? 'top' : 'row'}-open-${item.id}`} plain label={name.persona} onPress={props.onOpen} hover={{ backgroundColor: C.clear }} />
            )}
          </Box>
          {name.task && !isPersonaCut ? (
            <Box flexShrink={0}>
              <Text size="heading" color={C.muted}>
                ·
              </Text>
            </Box>
          ) : null}
          {name.task && !isPersonaCut ? (
            <Box flexShrink={1} minWidth={0}>
              <Text size="heading" color={C.muted} wrap="truncate-end">
                {oneLine(name.task)}
              </Text>
            </Box>
          ) : null}
          {model ? (
            <Box key={`${id}-model`} flexDirection="row" alignItems="center" gap={across(4)} marginLeft={across(4)} flexShrink={0}>
              {glyph(`${id}-model-glyph`, familyGlyph(model), 'muted')}
              {isNarrow ? null : (
                <Text size="footnote" color={C.muted}>
                  {model}
                </Text>
              )}
            </Box>
          ) : null}
          {elapsed ? (
            <Box key={`${id}-elapsed`} flexDirection="row" alignItems="center" gap={across(4)} flexShrink={0}>
              {Icon(ui, { id: `${id}-elapsed-icon`, name: 'elapsed', size: 12, tone: 'muted', weight: 2.2 })}
              <Text size="footnote" color={C.muted} tabular>
                {elapsed}
              </Text>
            </Box>
          ) : null}
        </Box>
        {second}
      </Box>
      {steps && !(isNeeds && props.chat) ? <Svg key={`${id}-ring`} source={toneRing(steps.done, steps.total, status.tone)} alt={`${steps.done} of ${steps.total}`} width={34} height={34} /> : null}
      {ui.Client ? Hit(ui, { id, width: props.isInCard ? props.width - 6 : props.width, height: hitPxOf(fit.height, !!props.isInCard), onPress: props.onOpen }) : null}
      {isNeeds && props.chat ? ActionButton(ui, { id: `chat-${item.id}`, kind: 'primary', icon: 'chat', label: props.chat.label, onPress: props.chat.onPress, size: 'b32', iconSize: 16, isIconOnly: isChatIcon }) : null}
      <Box
        key={`${id}-chevron`}
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        width={across(24)}
        height={tall(24)}
        flexShrink={0}
        paddingX={0}
        paddingY={0}
        borderStyle="round"
        borderColor={C.clear}
        hover={{ scope, backgroundColor: C.hoverBg, borderColor: C.borderStrong }}
      >
        {Icon(ui, { id: `${id}-chevron-icon`, name: chevron, size: 14, tone: 'muted', weight: 2, alt: chevron })}
        <Box key={`${id}-chevron-hot`} position="absolute" top={0} right={0} bottom={0} left={0} flexDirection="row" alignItems="center" justifyContent="center" display="none" hover={{ scope, display: 'flex' }}>
          {Icon(ui, { id: `${id}-chevron-icon-hot`, name: chevron, size: 14, tone: 'text', weight: 2, alt: chevron })}
        </Box>
        {ui.Client ? Hit(ui, { id: `${id}-chevron`, width: 24, height: 24, onPress: props.onOpen }) : null}
      </Box>
    </Box>
  )
}
