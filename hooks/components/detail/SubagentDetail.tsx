import { across, tall } from '../../lib/layout'
import { askOf, clockOf, displayNameOf, modelFamilyOf, nameText, parentsOf, rowsOf, sessionOfAgent, spanOf, tildeOf } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { C } from '../../theme/tokens'
import { ActionButton } from '../ActionButton'
import { Icon } from '../Icon'
import { Lines } from '../Lines'
import { Card } from '../list/Card'
import type { RowProps } from '../list/Row'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Actions, Ui } from '../types'
import { Block } from './Block'
import { Callout } from './Callout'
import { durationOf, tokensOf } from './format'
import { ModelValue } from './Model'
import { Pair } from './Pair'

export type SubagentDetailProps = { item: Extract<RowItem, { kind: 'subagent' | 'agent' }>; context: Context; rowProps: RowProps; innerWidth: number; actions: Actions }

export function SubagentDetail(ui: Ui, props: SubagentDetailProps) {
  const { Box, Text } = ui
  const { item, context, actions } = props
  const agent = item.agent
  const id = item.id
  const at = context.at
  const end = agent.endedAt ?? at
  const parents = parentsOf(item, context)
  const parent = item.kind === 'subagent' ? sessionOfAgent(item.agent, context) : undefined
  const parentName = parent ? nameText(displayNameOf({ kind: 'session', id: parent.id, group: parent.state, status: 'working', row: parent })) : ''
  const mode = parent?.live?.permissionMode
  const type = 'type' in agent ? agent.type : ''
  const model = modelFamilyOf(item.kind === 'subagent' ? item.agent.requestedModel || item.agent.model : agent.model)
  const isNeeds = item.status === 'needs'
  const isRunning = agent.state === 'running'
  const description = item.kind === 'subagent' ? item.agent.description : item.agent.label
  const prompt = item.kind === 'subagent' ? item.agent.prompt : undefined
  const how =
    item.kind === 'agent'
      ? `workflow agent ${item.agent.index} of ${item.run.counts.total}`
      : [item.agent.isBackground ? 'background' : 'foreground', parents.length > 1 ? `${parents.length} deep` : ''].filter(Boolean).join(' · ')
  const chain = parents.map(nameText)
  const asked = agent.asking ? `asked ${spanOf(agent.asking.since, undefined, at)} ago` : ''
  const waitsIn = parent ? `the prompt waits in ${parentName}’s chat` : 'the prompt waits in this chat'
  const ask = askOf(agent.asking?.text)
  const room = props.innerWidth - 24
  const promptRows = prompt ? rowsOf(prompt, room, 12, 4) : []
  const promptLines = prompt ? prompt.split('\n').filter(one => one.trim()).length : 0
  const holder = parent ? `${displayNameOf({ kind: 'session', id: parent.id, group: parent.state, status: 'working', row: parent }).persona}’s chat` : 'this chat'
  const isPromptCut = promptLines > 4 || promptRows.at(-1)?.endsWith('…')
  const half = (key: string, icon: Parameters<typeof Block>[1]['icon'], label: string, children: Parameters<typeof Block>[1]['children'], gap?: number) => Block(ui, { id: `${key}-${id}`, icon, label, isHalf: true, children, gap })
  const started = (
    <Text key={`started-text-${id}`} wrap="wrap">
      {chain.map((name, index) => (index === chain.length - 1 ? <Text weight="semibold">{name}</Text> : `${name} › `))}
    </Text>
  )
  const time = isNeeds && agent.asking
    ? [Strong(ui, { text: `waiting ${durationOf(at - agent.asking.since)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(agent.startedAt)}`, isFull: true })]
    : isRunning
      ? [Strong(ui, { text: `running ${durationOf(at - agent.startedAt)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(agent.startedAt)}`, isFull: true })]
      : [Strong(ui, { text: `took ${durationOf(end - agent.startedAt)}`, isFull: true }), Quiet(ui, { text: `${clockOf(agent.startedAt)} – ${clockOf(end)}`, isFull: true })]
  const modelBlock = half('model', 'modelChip', 'Model', [ModelValue(ui, { id, model: item.kind === 'subagent' ? item.agent.model : agent.model, text: model || '—' }), type ? Quiet(ui, { text: type, isMono: true, isFull: true }) : null], 8)
  return Card(ui, {
    ...props.rowProps,
    children: [
      isNeeds && agent.asking
        ? Callout(ui, {
            id,
            status: 'needs',
            icon: 'permission',
            label: 'Permission',
            width: props.innerWidth,
            lines: [
              ...(ask ? [{ text: `Allow ${ask.tool}`, isStrong: true }, { text: tildeOf(ask.rest, props.rowProps.home), isStrong: false, isMono: true, rows: 6 }] : [{ text: agent.asking.text, isStrong: true, rows: 3 }]),
              { text: [asked, waitsIn].filter(Boolean).join(' · '), isStrong: false },
            ],
          })
        : null,
      item.status === 'failed' ? Callout(ui, { id, status: 'failed', label: 'Failed', lines: [{ text: agent.result || 'stopped', isStrong: true }, { text: `took ${durationOf(end - agent.startedAt)}`, isStrong: false }] }) : null,
      Block(ui, {
        id: `task-${id}`,
        icon: 'now',
        label: 'Task',
        children: [
          Lines(ui, { id: `task-title-${id}`, rows: rowsOf(description, room, 13, 2, { isBold: true }), weight: 'semibold', color: C.text }),
          promptRows.length ? Lines(ui, { id: `task-prompt-${id}`, rows: promptRows, size: 'footnote', color: C.muted }) : null,
          isPromptCut ? Quiet(ui, { text: `${promptLines}-line prompt · the whole prompt is in ${holder}`, isFull: true }) : null,
        ],
      }),
      isNeeds && agent.asking
        ? Block(ui, { id: `now-${id}`, icon: 'working', label: 'Now', children: [Strong(ui, { text: 'Waiting for your answer', isFull: true }), Quiet(ui, { text: [ask?.tool, asked].filter(Boolean).join(' · '), isFull: true })] })
        : null,
      item.status === 'done' && (agent.result || agent.tokens)
        ? Block(ui, {
            id: `result-${id}`,
            icon: 'done',
            label: 'Result',
            children: [agent.result ? Strong(ui, { text: agent.result, isFull: true }) : null, agent.tokens ? Quiet(ui, { text: tokensOf(agent.tokens), isFull: true }) : null],
          })
        : null,
      mode
        ? Pair(ui, {
            id: `pair-mode-${id}`,
            left: half(
              'permission',
              'permission',
              'Permission',
              <Box key={`permission-pill-${id}`} flexDirection="row" alignSelf="flex-start" alignItems="center" height={tall(24)} paddingX={across(8)} paddingY={0} borderStyle="round" borderColor={C.border} backgroundColor={C.surface}>
                <Text size="footnote" weight="semibold">
                  {mode}
                </Text>
              </Box>,
              8,
            ),
            right: modelBlock,
          })
        : Block(ui, { id: `model-${id}`, icon: 'modelChip', label: 'Model', gap: 8, children: [ModelValue(ui, { id, model: item.kind === 'subagent' ? item.agent.model : agent.model, text: model || '—' }), type ? Quiet(ui, { text: type, isMono: true, isFull: true }) : null] }),
      Pair(ui, {
        id: `pair-start-${id}`,
        left: half('started', item.kind === 'agent' ? 'flow' : 'agent', 'Started by', [started, how ? Quiet(ui, { text: how, isFull: true }) : null]),
        right: half('time', 'elapsed', 'Time', time),
      }),
      parent && !isNeeds
        ? ActionButton(ui, { id: `parent-chat-${id}`, kind: 'secondary', icon: 'chat', label: `Open ${displayNameOf({ kind: 'session', id: parent.id, group: parent.state, status: 'working', row: parent }).persona} chat`, size: 'b40', iconSize: 16, wide: props.innerWidth, onPress: () => actions.open(parent.id, parent.name) })
        : null,
      !parent && isNeeds ? (
        <Box key={`info-${id}`} flexDirection="row" alignItems="flex-start" gap={across(8)}>
          <Box flexDirection="row" alignItems="center" height={tall(16)}>
            {Icon(ui, { id: `info-icon-${id}`, name: 'info', size: 14, tone: 'muted' })}
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text size="footnote" color={C.muted} wrap="wrap">
              The prompt is in this chat: answer it here.
            </Text>
          </Box>
        </Box>
      ) : null,
    ],
  })
}
