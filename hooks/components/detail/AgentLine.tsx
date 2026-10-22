import type { WorkflowAgent } from '../../lib/agents'
import { across, tall } from '../../lib/layout'
import { AGENT, agentMark } from '../../theme/detail'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { durationOf } from './format'

export type AgentLineProps = { agent: WorkflowAgent; at: number }

export function AgentLine(ui: Ui, props: AgentLineProps) {
  const { Box, Text, Svg } = ui
  const { agent } = props
  const look = AGENT[agent.state]
  return (
    <Box key={`agent-${agent.id}`} flexDirection="row" alignItems="center" gap={across(8)} minHeight={tall(20)}>
      <Box flexDirection="row" alignItems="center" justifyContent="center" width={across(12)} height={tall(20)}>
        <Svg key={`agent-mark-${agent.id}`} source={agentMark(agent.state)} alt={look.word} width={12} height={12} />
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="wrap">{agent.label}</Text>
      </Box>
      <Text size="footnote" weight="semibold" color={look.color}>
        {look.word}
      </Text>
      <Box flexDirection="row" justifyContent="flex-end" width={across(44)}>
        <Text size="footnote" color={C.muted} tabular>
          {durationOf((agent.endedAt ?? props.at) - agent.startedAt)}
        </Text>
      </Box>
    </Box>
  )
}
