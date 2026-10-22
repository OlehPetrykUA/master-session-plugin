import type { Repo, SessionState } from '../../../types'

import { dirtyOf } from '../../lib/git'
import { across, down, tall } from '../../lib/layout'
import { rowTextOf } from '../../lib/list'
import type { ListItem } from '../../lib/list'
import { whereOf } from '../../lib/rows'
import { badge, gitPill, ring } from '../../theme/icons'
import type { IconName } from '../../theme/icons'
import { C, LABEL } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { lossLineOf } from '../detail/losses'
import { Hit } from '../Hit'
import { Icon } from '../Icon'
import type { Ui } from '../types'

export type RowProps = { item: ListItem; trees: readonly Repo[]; home: string; at: number; isNarrow: boolean; width: number; onOpen: () => void; onChat: () => void }

export const ROW_HEIGHT = 56

const KIND_ICON: Record<ListItem['kind'], IconName> = { session: 'session', subagent: 'agent', workflow: 'flow' }

export const badgeStateOf = (item: ListItem): SessionState => {
  if (item.kind === 'session') return item.row.state
  const state = item.kind === 'workflow' ? item.run.state : item.agent.state
  return state === 'running' ? 'working' : state === 'failed' ? 'needs-you' : 'done'
}

export function Row(ui: Ui, props: RowProps) {
  const { Box, Text, Button, Svg } = ui
  const { item, isNarrow } = props
  const text = rowTextOf(item, props.at)
  const state = badgeStateOf(item)
  const isNeeds = item.group === 'needs-you'
  const where = item.kind === 'session' ? whereOf(item.row, props.trees)?.tree : undefined
  const dirty = item.kind === 'session' && where ? dirtyOf(where, item.row.board?.files ?? [], props.home) : 0
  const git = dirty ? gitPill(dirty) : undefined
  const hasRing = !isNeeds && item.kind !== 'subagent'
  const loss = item.kind === 'session' && item.group === 'done' ? lossLineOf(item.row, props.trees) : ''
  const muted = C.muted
  const line = (
    <Box flexDirection="row" alignItems={isNeeds ? 'flex-start' : 'center'} gap={across(4)} minWidth={0}>
      <Box flexDirection="row" alignItems="center" height={tall(16)} flexShrink={0}>
        {Icon(ui, { id: `row-kind-${item.id}`, name: KIND_ICON[item.kind], size: 12, tone: 'muted', alt: text.kind })}
      </Box>
      {isNarrow ? null : (
        <Text size="footnote" weight="bold" color={muted}>
          {text.kind}
        </Text>
      )}
      {isNarrow ? null : (
        <Text size="footnote" color={muted}>
          ·
        </Text>
      )}
      <Box flexShrink={1} minWidth={0}>
        <Text size="footnote" weight={text.isAlert || loss ? 'bold' : undefined} color={text.isAlert ? C.red : loss ? C.amber : muted} wrap={isNeeds ? 'wrap' : 'truncate-end'}>
          {loss || text.line}
        </Text>
      </Box>
      {isNarrow && !isNeeds ? (
        <Text size="footnote" color={muted}>
          ·
        </Text>
      ) : null}
      {isNarrow && !isNeeds ? (
        <Box flexShrink={0}>
          <Text size="footnote" color={muted} tabular>
            {text.elapsed}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
  return (
    <Box
      key={`row-${item.id}`}
      flexDirection="row"
      alignItems="center"
      gap={across(12)}
      minHeight={tall(ROW_HEIGHT)}
      paddingTop={down(8)}
      paddingBottom={down(8)}
      paddingLeft={across(12)}
      paddingRight={across(8)}
      borderStyle="round"
      borderColor={isNeeds ? C.red : C.border}
      backgroundColor={C.surface}
      hover={{ backgroundColor: C.tileHover, borderColor: isNeeds ? C.red : C.accentRing }}
    >
      <Svg key={`row-badge-${item.id}`} source={badge(state, 28, 8, 16)} alt={LABEL[state]} width={28} height={28} />
      <Box flexDirection="column" gap={down(2)} flexGrow={1} flexShrink={1} minWidth={0}>
        {ui.Client ? (
          <Text weight="bold" size="heading" wrap="truncate-end">
            {text.title}
          </Text>
        ) : (
          <Button key={`row-open-${item.id}`} plain label={text.title} onPress={props.onOpen} hover={{ backgroundColor: C.clear }} />
        )}
        {line}
      </Box>
      {isNeeds || isNarrow ? null : (
        <Box flexDirection="column" alignItems="flex-end" gap={down(4)} flexShrink={0}>
          <Box flexDirection="row" alignItems="center" gap={across(4)}>
            {Icon(ui, { id: `row-clock-${item.id}`, name: 'clock', size: 12, tone: 'muted' })}
            <Text size="footnote" color={muted} tabular>
              {text.elapsed}
            </Text>
          </Box>
          {item.kind === 'session' ? (
            <Box flexDirection="row" alignItems="center" gap={across(4)} height={tall(16)}>
              {git ? <Svg key={`row-git-${item.id}`} source={git.source} alt={`${dirty} uncommitted`} width={git.width} height={16} /> : null}
              {Icon(ui, { id: `row-place-${item.id}`, name: where?.isMain === false ? 'branch' : 'house', size: 14, tone: 'faint', weight: 1.75, alt: where?.isMain === false ? 'worktree' : 'main checkout' })}
            </Box>
          ) : null}
        </Box>
      )}
      {hasRing ? <Svg key={`row-ring-${item.id}`} source={ring(text.step?.done ?? 0, text.step?.total ?? 0, state)} alt={text.step ? `${text.step.done} of ${text.step.total}` : 'no steps yet'} width={34} height={34} /> : null}
      {ui.Client ? Hit(ui, { id: `row-${item.id}`, width: props.width, height: ROW_HEIGHT, onPress: props.onOpen }) : null}
      {isNeeds ? ActionButton(ui, { id: `chat-${item.id}`, kind: 'primary', icon: 'chat', label: 'Open chat', onPress: props.onChat, size: 'b32', iconSize: 16, isIconOnly: isNarrow }) : null}
    </Box>
  )
}
