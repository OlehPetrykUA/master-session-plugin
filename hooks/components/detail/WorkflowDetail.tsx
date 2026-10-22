import type { WorkflowRun } from '../../lib/agents'
import { across, down } from '../../lib/layout'
import { clockOf, plural } from '../../lib/list'
import { phaseStrip } from '../../theme/detail'
import { C } from '../../theme/tokens'
import { Icon } from '../Icon'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'
import { AgentLine } from './AgentLine'
import { Block } from './Block'
import { Blocker } from './Blocker'
import { DetailCard } from './DetailCard'
import { DetailHeader } from './DetailHeader'
import { SEEN, WORD, durationOf, tokensOf } from './format'
import { Pair } from './Pair'

export type WorkflowDetailProps = { run: WorkflowRun; at: number; innerWidth: number; onCollapse: () => void }

export function WorkflowDetail(ui: Ui, props: WorkflowDetailProps) {
  const { Box, Text, Svg } = ui
  const { run, at } = props
  const { counts } = run
  const id = run.id
  const end = run.endedAt ?? at
  const failed = run.agents.filter(agent => agent.state === 'failed')
  const state = SEEN[run.state]
  const groupIcon = counts.failed ? 'blocker' : !counts.total ? 'clock' : counts.running ? 'working' : 'done'
  const strip = phaseStrip(props.innerWidth, [{ done: counts.done, running: counts.running, failed: counts.failed, total: counts.total, isFinished: run.state !== 'running' }])

  return DetailCard(ui, {
    id,
    children: [
      DetailHeader(ui, {
        id,
        state,
        title: run.name,
        word: WORD[run.state],
        parts: [plural(counts.total, 'agent'), durationOf(end - run.startedAt)],
        steps: { done: counts.done, total: counts.total },
        onCollapse: props.onCollapse,
      }),
      <Box key={`kind-${id}`} flexDirection="row" alignItems="center" gap={across(8)}>
        {Icon(ui, { id: `kind-icon-${id}`, name: 'flow', size: 12, tone: 'muted' })}
        <Text size="footnote" weight="semibold" color={C.muted}>
          Workflow
        </Text>
        <Text size="footnote" color={C.muted}>
          ·
        </Text>
        <Box flexShrink={1} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            {`run ${id}`}
          </Text>
        </Box>
      </Box>,
      <Svg key={`strip-${id}`} source={strip} alt={`${counts.done} of ${counts.total} agents done`} width={Math.round(props.innerWidth)} height={10} isInteractive />,
      failed.length
        ? Blocker(ui, {
            id,
            label: `${plural(failed.length, 'agent')} failed`,
            lines: failed.flatMap(agent => [{ text: agent.label, isStrong: true }, ...(agent.result ? [{ text: agent.result, isStrong: false }] : [])]),
          })
        : null,
      <Box key={`agents-${id}`} flexDirection="column" gap={down(4)} paddingX={across(11)} paddingY={down(7)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
        <Box flexDirection="row" alignItems="center" gap={across(8)}>
          {Icon(ui, { id: `agents-icon-${id}`, name: groupIcon, size: 14, tone: 'muted' })}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text weight="semibold">Agents</Text>
          </Box>
          <Text color={C.muted} tabular>
            {`${counts.done}/${counts.total}`}
          </Text>
        </Box>
        {run.agents.length ? (
          run.agents.map(agent => AgentLine(ui, { agent, at }))
        ) : (
          <Text key={`agents-none-${id}`} size="footnote" color={C.muted}>
            No agents started yet.
          </Text>
        )}
      </Box>,
      Pair(ui, {
        id: `pair-time-${id}`,
        left: Block(ui, {
          id: `time-${id}`,
          icon: 'clock',
          label: 'Time',
          isHalf: true,
          children:
            run.state === 'running'
              ? [Strong(ui, { text: `running ${durationOf(at - run.startedAt)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(run.startedAt)}`, isFull: true })]
              : [Strong(ui, { text: `took ${durationOf(end - run.startedAt)}`, isFull: true }), Quiet(ui, { text: `${clockOf(run.startedAt)} – ${clockOf(end)}`, isFull: true })],
        }),
        right: Block(ui, {
          id: `usage-${id}`,
          icon: 'pulse',
          label: 'Usage',
          isHalf: true,
          children: [Strong(ui, { text: plural(counts.total, 'agent'), isFull: true }), run.tokens ? Quiet(ui, { text: tokensOf(run.tokens), isFull: true }) : null],
        }),
      }),
    ],
  })
}
