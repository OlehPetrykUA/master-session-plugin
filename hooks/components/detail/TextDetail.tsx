import type { RenderChildren } from 'claude-code'

import { compactOf, modelOf } from '../../lib/format'
import { modelWordOf } from '../../lib/rowfit'
import { ageOf, clockOf, displayNameOf, elapsedOfItem, isStartedBy, nameText, parentsOf, plural, runAgentsOf, shortNameOf, spanOf } from '../../lib/list'
import type { Context, ListItem, RowItem } from '../../lib/list'
import { headOf, syncOf, whereOf } from '../../lib/rows'
import { activityWordsOf, clean, nameIdentOf, partOfOf, starterOf, stateWordOf, statusSentenceOf, taskOf } from '../../lib/status'
import { CARD_BORDER, TERMINAL_COLOR } from '../../theme/tokens'
import type { Actions, TextUi } from '../types'
import { LOST } from './ArchiveBox'
import { runningTimeOf, tokensOf } from './format'
import { lossLineOf, lossesOf } from './losses'
import { DESCRIBING } from './TaskBlock'
import { pillsOf } from './Tests'

type Line = { label: string; value: string; color?: string }

type TextCardProps = { id: string; title: string; head: { text: string; color?: string }; lines: readonly (Line | false | undefined | '')[]; body?: RenderChildren; tail?: readonly (Line | false | undefined | '')[]; isNeeds?: boolean; onCollapse: () => void; actions?: RenderChildren }

const textLines = ({ Text }: TextUi, lines: readonly (Line | false | undefined | '')[]) =>
  lines.flatMap(line =>
    line && line.value ? [
      <Text key={`line-${line.label}`} wrap="wrap">
        <Text weight="semibold">{`${line.label}: `}</Text>
        <Text color={line.color} dimColor={!line.color || undefined}>{line.value}</Text>
      </Text>,
    ] : [],
  )

function TextCard(ui: TextUi, props: TextCardProps) {
  const { Box, Text, Button } = ui
  return (
    <Box key={`detail-${props.id}`} flexDirection="column" padding="sm" borderStyle="round" borderColor={props.isNeeds ? 'error' : CARD_BORDER}>
      <Box flexDirection="row" gap="sm">
        <Text weight="semibold" wrap="truncate-end">{props.title}</Text>
        <Box flexGrow={1} />
        <Button key={`collapse-${props.id}`} plain label="Collapse" onPress={props.onCollapse} />
      </Box>
      <Text color={props.head.color}>{props.head.text}</Text>
      {textLines(ui, props.lines)}
      {props.body}
      {textLines(ui, props.tail ?? [])}
      {props.actions}
    </Box>
  )
}

export const colorOf = (item: RowItem) => (item.status === 'archived' ? 'subtle' : TERMINAL_COLOR[item.group])

export const wordColorOf = (item: RowItem) => (item.status === 'needs' || item.status === 'failed' ? 'error' : undefined)

const headOfItem = (item: RowItem, context: Context): { text: string; color?: string } => {
  const starter = starterOf(item, context)
  const model = modelWordOf(item)
  return { text: [`${starter ? `${starter} › ` : ''}${stateWordOf(item.status).text}`, model, elapsedOfItem(item, context.at)].filter(Boolean).join(' · '), color: colorOf(item) }
}

const leadOf = (item: RowItem, context: Context, home: string): Line[] => {
  const ident = nameIdentOf(item, context)
  const task = taskOf(item, context)
  const status = statusSentenceOf(item, context, home)
  return [
    { label: 'Name', value: `${ident.full} · ${ident.ident}` },
    { label: 'Task', value: task === 'pending' ? DESCRIBING : (task?.text ?? '') },
    { label: 'Status', value: status.text, color: status.isAlert ? 'error' : undefined },
  ]
}

const timeOfAgent = (item: Extract<RowItem, { kind: 'subagent' | 'agent' }>, at: number): Line => {
  const { agent } = item
  const end = agent.endedAt ?? at
  return {
    label: 'Time',
    value:
      agent.state === 'running'
        ? `${item.status === 'needs' && agent.asking ? 'waiting' : 'running'} ${runningTimeOf(item, at)} · started ${clockOf(agent.startedAt)}`
        : `took ${spanOf(agent.startedAt, end, at)} · ${clockOf(agent.startedAt)} – ${clockOf(end)}`,
  }
}

export type TextSessionProps = { item: Extract<ListItem, { kind: 'session' }>; context: Context; home: string; asking: string; actions: Actions }

export function TextSessionDetail(ui: TextUi, props: TextSessionProps) {
  const { Box, Text, Button } = ui
  const { item, context, actions } = props
  const { row } = item
  const at = context.at
  const facts = row.board
  const now = row.live
  const where = whereOf(row, context.trees)?.tree
  const files = facts?.files ?? []
  const model = modelOf(now?.model, now?.effort)
  const losses = lossesOf(row, context.trees, context.sessions)
  const loss = item.status === 'done' ? lossLineOf(row, context.trees, context.sessions) : ''
  const canArchive = !!now && !now.isRunning && row.state !== 'needs-you'
  const isStoppable = !!now?.isRunning && row.state !== 'needs-you'
  return TextCard(ui, {
    id: row.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [
      ...leadOf(item, context, props.home),
      { label: 'Now', value: clean(facts?.now) },
      { label: 'Next', value: clean(facts?.next) },
      { label: 'Activity', value: activityWordsOf(row).map(one => [one.text, one.ago].filter(Boolean).join(' ')).join(' · ') },
      { label: 'Tests', value: (facts?.tests ?? []).length ? pillsOf(facts?.tests ?? []).map(pill => `${pill.isFailed ? '✗' : '✓'} ${pill.full}`).join(' · ') : '' },
      { label: 'Commits', value: (facts?.commits ?? []).slice(0, 3).join(' · ') },
      { label: 'Files', value: files.length ? [...files.slice(0, 3), ...(files.length > 3 ? [`+${files.length - 3} more`] : [])].join(' · ') : '' },
      { label: 'Git', value: where ? [where.dirty ? `${where.dirty} uncommitted` : 'clean', loss || syncOf(where), where.isMain ? [where.branch, where.sha].filter(Boolean).join(' ') : `${where.path.split('/').at(-1) ?? ''} ${headOf(where)}`].filter(Boolean).join(' · ') : (facts?.git ?? '') },
      { label: 'Model', value: model },
      { label: 'Time', value: now ? `${now.createdAt !== undefined ? `started ${clockOf(now.createdAt)}` : (facts?.time ?? '')} · ${now.isRunning ? 'active now' : `idle ${compactOf(at - now.lastActivityAt)}`}` : (facts?.time ?? '') },
    ],
    onCollapse: () => actions.collapse(row.id),
    actions:
      props.asking === `archive:${row.id}` && canArchive ? (
        <Box key={`confirm-${row.id}`} flexDirection="column">
          <Text weight="semibold">{`Archive ${shortNameOf(item)}?`}</Text>
          <Text dimColor>{LOST}</Text>
          {losses.map(one => (
            <Text color="error">{`• ${one}`}</Text>
          ))}
          <Box flexDirection="row" gap="sm">
            <Button key={`archive-no-${row.id}`} label="Cancel" onPress={() => actions.confirm('')} />
            <Button key={`archive-yes-${row.id}`} variant="primary" label="Archive and remove" onPress={() => actions.archive([row], undefined, losses)} />
          </Box>
        </Box>
      ) : (
        <Box key={`actions-${row.id}`} flexDirection="row" gap="sm">
          {item.isOwn ? <Button key={`open-${row.id}`} label="Open" onPress={() => actions.open(row.id, row.name)} /> : null}
          {isStoppable ? <Button key={`stop-${row.id}`} label="Stop" onPress={() => actions.stop(row.id, row.name)} /> : null}
          {canArchive ? <Button key={`archive-${row.id}`} label={losses.length ? 'Archive…' : 'Archive'} onPress={() => (losses.length ? actions.confirm(`archive:${row.id}`) : actions.archive([row], undefined, losses))} /> : null}
        </Box>
      ),
  })
}

export type TextWorkflowProps = { item: Extract<ListItem, { kind: 'workflow' }>; context: Context; home: string; open: readonly string[]; onToggle: (id: string) => void; onCollapse: () => void }

export function TextWorkflowDetail(ui: TextUi, props: TextWorkflowProps) {
  const { Box, Text, Button } = ui
  const { item, context } = props
  const { run } = item
  const { counts } = run
  const at = context.at
  const end = run.endedAt ?? at
  const runAgents = runAgentsOf(run, context.agents)
  return TextCard(ui, {
    id: run.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [...leadOf(item, context, props.home), { label: 'Phases', value: run.phases.join(' · ') }],
    body: [
      <Text key={`agents-label-${run.id}`} weight="semibold">{runAgents.length ? 'Agents:' : 'Agents: No agents started yet.'}</Text>,
      ...runAgents.map(agent =>
      agent.kind === 'agent' && props.open.includes(agent.id) ? (
        TextSubagentDetail(ui, { item: agent, context, home: props.home, onCollapse: () => props.onToggle(run.id) })
      ) : (
        <Box key={`agent-${agent.id}`} flexDirection="row" gap="sm">
          <Text color={colorOf(agent)}>●</Text>
          <Button key={`agent-open-${agent.id}`} plain label={nameText(displayNameOf(agent))} onPress={() => props.onToggle(agent.id)} />
          <Text color={wordColorOf(agent)} dimColor={!wordColorOf(agent) || undefined} wrap="truncate-end">
            {`› ${stateWordOf(agent.status).text}`}
          </Text>
        </Box>
      ),
      ),
    ],
    tail: [
      { label: 'Time', value: run.state === 'running' ? `running ${runningTimeOf(item, at)} · started ${clockOf(run.startedAt)}` : `took ${spanOf(run.startedAt, end, at)} · ${clockOf(run.startedAt)} – ${clockOf(end)}` },
      { label: 'Usage', value: `${plural(counts.total, 'agent')}${run.tokens ? ` · ${tokensOf(run.tokens)}` : ''}` },
    ],
    onCollapse: props.onCollapse,
  })
}

export type TextSubagentProps = { item: Extract<RowItem, { kind: 'subagent' | 'agent' }>; context: Context; home: string; onCollapse: () => void }

export function TextSubagentDetail(ui: TextUi, props: TextSubagentProps) {
  const { item, context } = props
  const { agent } = item
  const model = modelWordOf(item)
  const [part, nth] = item.kind === 'agent' ? partOfOf(item) : ['', '']
  return TextCard(ui, {
    id: agent.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [
      ...leadOf(item, context, props.home),
      ...(item.kind === 'agent' ? [{ label: 'Part of', value: `${part} · ${nth}` }] : []),
      { label: 'Model', value: [model, agent.type].filter(Boolean).join(' · ') },
      ...(item.kind === 'agent' ? [] : [{ label: 'Started by', value: `${parentsOf(item, context).map(nameText).join(' › ')} · ${item.agent.isBackground ? 'background' : 'foreground'}` }]),
      timeOfAgent(item, context.at),
    ],
    onCollapse: props.onCollapse,
  })
}

export type TextArchivedProps = { item: Extract<RowItem, { kind: 'archived' }>; context: Context; home: string; actions: Actions; onCollapse: () => void }

export function TextArchivedDetail(ui: TextUi, props: TextArchivedProps) {
  const { Box, Button } = ui
  const { item, context, actions } = props
  const { one, board } = item
  return TextCard(ui, {
    id: one.id,
    title: nameText(displayNameOf(item)),
    head: headOfItem(item, context),
    lines: [
      ...leadOf(item, context, props.home),
      { label: 'Archived', value: [clockOf(one.lastActivityAt), ageOf(context.at - one.lastActivityAt), one.createdAt === undefined ? '' : `ran ${compactOf(one.lastActivityAt - one.createdAt)}`].filter(Boolean).join(' · ') },
      { label: 'Git', value: [board?.git, board?.sha].filter(Boolean).join(' · ') },
    ],
    onCollapse: props.onCollapse,
    actions: (
      <Box key={`archived-actions-${one.id}`} flexDirection="row" gap="sm">
        {isStartedBy(one, context.self) ? <Button key={`archived-open-${one.id}`} label="Open" onPress={() => actions.open(one.id, one.name || one.title)} /> : null}
        <Button key={`unarchive-${one.id}`} label="Unarchive" onPress={() => actions.confirm(`unarchive:${one.id}`)} />
      </Box>
    ),
  })
}
