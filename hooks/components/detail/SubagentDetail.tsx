import type { AgentRecord } from '../../../types'

import { across, tall } from '../../lib/layout'
import { clockOf, kindOfType, modelFamilyOf } from '../../lib/list'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'
import { Block } from './Block'
import { DetailCard } from './DetailCard'
import { DetailHeader } from './DetailHeader'
import { SEEN, WORD, durationOf, tokensOf } from './format'
import { Pair } from './Pair'

export type SubagentDetailProps = { agent: AgentRecord; at: number; onCollapse: () => void }

const sourceOf = (agent: AgentRecord) => {
  if (!agent.requestedModel) return 'from the agent definition'
  const parent = modelFamilyOf(agent.parentModel)
  return parent ? `set by the call; parent runs ${parent}` : 'set by the call'
}

export function SubagentDetail(ui: Ui, props: SubagentDetailProps) {
  const { Box, Text } = ui
  const { agent, at } = props
  const id = agent.id
  const end = agent.endedAt ?? at
  const model = modelFamilyOf(agent.model)
  const isRunning = agent.state === 'running'
  const how = [agent.isBackground ? 'background' : 'foreground', agent.isFork ? 'a fork' : agent.name ? `named ${agent.name}` : 'not a fork']
  return DetailCard(ui, {
    id,
    children: [
      DetailHeader(ui, {
        id,
        state: SEEN[agent.state],
        title: agent.name || agent.description,
        word: WORD[agent.state],
        parts: [kindOfType(agent.type), model, durationOf(end - agent.startedAt)],
        onCollapse: props.onCollapse,
      }),
      Block(ui, {
        id: `task-${id}`,
        icon: 'now',
        label: 'Task',
        children: [Strong(ui, { text: agent.description, isFull: true }), agent.prompt ? Quiet(ui, { text: agent.prompt, isFull: true }) : null],
      }),
      Pair(ui, {
        id: `pair-type-${id}`,
        left: Block(ui, { id: `type-${id}`, icon: 'agent', label: 'Agent type', isHalf: true, children: Strong(ui, { text: agent.type, isMono: true, isFull: true }) }),
        right: Block(ui, { id: `model-${id}`, icon: 'model', label: 'Model', isHalf: true, children: [Strong(ui, { text: model || '—', isFull: true }), Quiet(ui, { text: sourceOf(agent), isFull: true })] }),
      }),
      Pair(ui, {
        id: `pair-start-${id}`,
        left: Block(ui, {
          id: `started-${id}`,
          icon: 'session',
          label: 'Started by',
          isHalf: true,
          children: [Strong(ui, { text: agent.spawnedBy ? `${agent.spawnedBy} plugin` : 'main chat', isFull: true }), Quiet(ui, { text: how.join(' · '), isFull: true })],
        }),
        right: Block(ui, {
          id: `time-${id}`,
          icon: 'clock',
          label: 'Time',
          isHalf: true,
          children: isRunning
            ? [Strong(ui, { text: `running ${durationOf(at - agent.startedAt)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(agent.startedAt)}`, isFull: true })]
            : [Strong(ui, { text: `took ${durationOf(end - agent.startedAt)}`, isFull: true }), Quiet(ui, { text: `${clockOf(agent.startedAt)} – ${clockOf(end)}`, isFull: true })],
        }),
      }),
      !isRunning && (agent.result || agent.tokens)
        ? Block(ui, {
            id: `result-${id}`,
            icon: agent.state === 'failed' ? 'blocker' : 'check',
            label: agent.state === 'failed' ? 'Error' : 'Result',
            children: [agent.result ? Strong(ui, { text: agent.result, isFull: true }) : null, agent.tokens ? Quiet(ui, { text: tokensOf(agent.tokens), isFull: true }) : null],
          })
        : null,
      <Box key={`info-${id}`} flexDirection="row" alignItems="flex-start" gap={across(8)}>
        <Box flexDirection="row" alignItems="center" height={tall(16)}>
          {Icon(ui, { id: `info-icon-${id}`, name: 'info', size: 14, tone: 'muted' })}
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="wrap">
            {isRunning ? 'Not a session, so nothing to open, stop or archive here. It moves to Done when it finishes.' : 'Subagents have no Archive. Archive all skips this row.'}
          </Text>
        </Box>
      </Box>,
    ],
  })
}
