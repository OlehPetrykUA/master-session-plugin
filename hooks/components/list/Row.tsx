import { across, down, tall } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { hitPxOf, rowFitOf } from '../../lib/rowfit'
import { ROW } from '../../lib/sections'
import { STATUS, statusBadge, toneRing } from '../../theme/icons'
import type { IconName } from '../../theme/icons'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Hit } from '../Hit'
import { Icon } from '../Icon'
import { Lines } from '../Lines'
import type { Ui } from '../types'

export type RowChat = { label: string; onPress: () => void }

export type RowProps = { item: RowItem; context: Context; home: string; width: number; isNarrow: boolean; isInCard?: boolean; onOpen: () => void; chat?: RowChat }

const KIND_ICON: Record<RowItem['kind'], IconName> = { session: 'session', archived: 'session', subagent: 'agent', agent: 'agent', workflow: 'flow' }

export const KIND_WORD: Record<RowItem['kind'], string> = { session: 'Session', archived: 'Archived session', subagent: 'Subagent', agent: 'Workflow agent', workflow: 'Workflow' }

export function Row(ui: Ui, props: RowProps) {
  const { Box, Text, Button, Svg } = ui
  const { item, context, isNarrow } = props
  const fit = rowFitOf(item, context, { width: props.width, isNarrow, home: props.home, chat: props.chat?.label })
  const { name, line, isNeeds, elapsed, steps, where, dirty, git, isChatIcon, isPersonaCut } = fit
  const status = STATUS[item.status]
  const id = `${props.isInCard ? 'top' : 'row'}-${item.id}`
  const scope = `toggle-${id}`.slice(0, 64)
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
        {Lines(ui, { id: `${id}-ask-rows`, rows: fit.ask, size: 'footnote', weight: 'semibold', color: C.red })}
      </Box>
    </Box>
  )
  const chevron = props.isInCard ? 'collapse' : 'expand'
  const narrowElapsed = isNarrow && elapsed && !(isNeeds && props.chat) && !line.cmdElapsed
  const second = (
    <Box key={`${id}-line`} flexDirection="row" alignItems={isNeeds ? 'flex-start' : 'center'} gap={across(4)} minWidth={0} overflow="hidden">
      {glyph(`${id}-kind`, KIND_ICON[item.kind], 'muted', KIND_WORD[item.kind])}
      {line.chain ? muted(oneLine(line.chain), `${id}-chain`) : null}
      {isNeeds && !line.chain ? question : null}
      {line.word ? glyph(`${id}-word-icon`, STATUS[line.word.status].icon, STATUS[line.word.status].tone) : null}
      {line.word ? (
        <Box key={`${id}-word`} flexShrink={0}>
          <Text size="footnote" weight="semibold" color={C.text}>
            {oneLine(line.word.text)}
          </Text>
        </Box>
      ) : null}
      {line.word && line.text ? muted('·', `${id}-dot`) : null}
      {!isNeeds && line.text ? (
        <Box key={`${id}-text`} flexShrink={1} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            {oneLine(line.text)}
          </Text>
        </Box>
      ) : null}
      {line.cmdElapsed ? muted('·', `${id}-cmd-dot`) : null}
      {line.cmdElapsed ? (
        <Box key={`${id}-cmd-elapsed`} flexShrink={0}>
          <Text size="footnote" color={C.muted} tabular>
            {line.cmdElapsed}
          </Text>
        </Box>
      ) : null}
      {narrowElapsed && !isNeeds && (line.text || line.word) ? muted('·', `${id}-elapsed-dot`) : null}
      {narrowElapsed && !isNeeds ? (
        <Box key={`${id}-elapsed-narrow`} flexShrink={0}>
          <Text size="footnote" color={C.muted} tabular>
            {elapsed}
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
      <Svg key={`${id}-badge`} source={statusBadge(item.status, 28)} alt={line.word?.text ?? status.word} width={28} height={28} />
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
        </Box>
        {second}
        {isNeeds && line.chain ? question : null}
      </Box>
      {meta}
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
