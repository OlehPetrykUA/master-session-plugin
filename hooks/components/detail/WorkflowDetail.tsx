import type { RenderChildren } from 'claude-code'

import { across, down, tall } from '../../lib/layout'
import { MASTER, clockOf, plural, runAgentsOf } from '../../lib/list'
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
import { Callout } from './Callout'
import { durationOf, runningTimeOf, tokensOf } from './format'
import { Pair } from './Pair'
import { TaskBlock } from './TaskBlock'

export type WorkflowDetailProps = { item: Extract<ListItem, { kind: 'workflow' }>; context: Context; rowProps: RowProps; innerWidth: number; agentOf: (item: RowItem) => RenderChildren }

export function WorkflowDetail(ui: Ui, props: WorkflowDetailProps) {
  const { Box, Text, Svg } = ui
  const { item, context } = props
  const { run } = item
  const { counts } = run
  const id = run.id
  const at = context.at
  const end = run.endedAt ?? at
  const failed = run.agents.filter(agent => agent.state === 'failed')
  const strip = phaseStrip(props.innerWidth, [{ done: counts.done, running: counts.running, failed: counts.failed, asking: counts.asking, total: counts.total, isFinished: run.state !== 'running' }])
  const look = STATUS[item.status]
  const half = (key: string, icon: Parameters<typeof Block>[1]['icon'], label: string, children: Parameters<typeof Block>[1]['children']) => Block(ui, { id: `${key}-${id}`, icon, label, isHalf: true, children })
  return Card(ui, {
    ...props.rowProps,
    children: [
      <Box key={`run-${id}`} flexDirection="row" alignItems="center" gap={across(8)}>
        <Box flexDirection="row" alignItems="center" height={tall(16)} flexShrink={0}>
          {Icon(ui, { id: `run-icon-${id}`, name: 'flow', size: 12, tone: 'muted', weight: 2.2 })}
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            {`run ${id} · started by the ${MASTER} · ${clockOf(run.startedAt)}`}
          </Text>
        </Box>
      </Box>,
      <Svg key={`strip-${id}`} source={strip} alt={`${counts.done} of ${counts.total} agents done`} width={Math.round(props.innerWidth)} height={10} />,
      failed.length
        ? Callout(ui, {
            id,
            status: 'failed',
            label: `${plural(failed.length, 'agent')} failed`,
            lines: failed.flatMap(agent => [{ text: agent.label, isStrong: true }, ...(agent.result ? [{ text: agent.result, isStrong: false }] : [])]),
          })
        : null,
      TaskBlock(ui, { id, name: run.name, task: run.task, room: props.innerWidth - 24 }),
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
