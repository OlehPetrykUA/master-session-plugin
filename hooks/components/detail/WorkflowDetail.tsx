import type { RenderChildren } from 'claude-code'

import { across, down, tall } from '../../lib/layout'
import { clockOf, plural, runAgentsOf } from '../../lib/list'
import type { Context, ListItem, RowItem } from '../../lib/list'
import { STATUS } from '../../theme/icons'
import { phaseStrip } from '../../theme/detail'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Card } from '../list/Card'
import type { RowProps } from '../list/Row'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'
import { Block } from './Block'
import { durationOf, runningTimeOf, tokensOf } from './format'
import { Lead } from './Lead'
import { Pair } from './Pair'

export type WorkflowDetailProps = { item: Extract<ListItem, { kind: 'workflow' }>; context: Context; rowProps: RowProps; home: string; innerWidth: number; agentOf: (item: RowItem) => RenderChildren }

export function WorkflowDetail(ui: Ui, props: WorkflowDetailProps) {
  const { Box, Text, Svg } = ui
  const { item, context } = props
  const { run } = item
  const { counts } = run
  const id = run.id
  const at = context.at
  const end = run.endedAt ?? at
  const strip = (
    <Svg key={`strip-${id}`} source={phaseStrip(props.innerWidth - 24, [{ done: counts.done, running: counts.running, failed: counts.failed, asking: counts.asking, total: counts.total, isFinished: run.state !== 'running' }])} alt={`${counts.done} of ${counts.total} agents done`} width={Math.round(props.innerWidth - 24)} height={10} />
  )
  const look = STATUS[item.status]
  const half = (key: string, icon: Parameters<typeof Block>[1]['icon'], label: string, children: Parameters<typeof Block>[1]['children']) => Block(ui, { id: `${key}-${id}`, icon, label, isHalf: true, children })
  return Card(ui, {
    ...props.rowProps,
    children: [
      ...Lead(ui, { item, context, home: props.home }),
      run.phases.length ? Block(ui, { id: `phases-${id}`, icon: 'flow', label: 'Phases', children: [Strong(ui, { text: run.phases.join(' · '), isFull: true }), strip] }) : strip,
      <Box key={`agents-${id}`} flexDirection="column" gap={down(4)} paddingX={across(11)} paddingY={down(7)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
        <Box flexDirection="row" alignItems="center" gap={across(8)} height={tall(20)}>
          {Icon(ui, { id: `agents-icon-${id}`, name: look.icon, size: 14, tone: look.tone, weight: 2 })}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text weight="semibold">Agents</Text>
          </Box>
          <Text color={C.muted} tabular>
            {`${counts.done}/${counts.total}`}
          </Text>
        </Box>
        {run.agents.length ? (
          <Box key={`agents-list-${id}`} flexDirection="column" gap={down(4)}>
            {runAgentsOf(run, context.agents).map(props.agentOf)}
          </Box>
        ) : (
          <Text key={`agents-none-${id}`} size="footnote" color={C.muted}>
            No agents started yet.
          </Text>
        )}
      </Box>,
      Pair(ui, {
        id: `pair-time-${id}`,
        left: half(
          'time',
          'elapsed',
          'Time',
          run.state === 'running'
            ? [Strong(ui, { text: `running ${runningTimeOf(item, at)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(run.startedAt)}`, isFull: true })]
            : [Strong(ui, { text: `took ${durationOf(end - run.startedAt)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(run.startedAt)}`, isFull: true })],
        ),
        right: half('usage', 'usage', 'Usage', [Strong(ui, { text: plural(counts.total, 'agent'), isFull: true }), run.tokens ? Quiet(ui, { text: tokensOf(run.tokens), isFull: true }) : null]),
      }),
    ],
  })
}
