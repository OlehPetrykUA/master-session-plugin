import type { RenderChildren } from 'claude-code'

import { compactOf, modelFamilyOf, modelOf } from '../../lib/format'
import { clockOf, displayNameOf, elapsedOfItem, lineOf, lineTextOf, nameText, parentsOf, plural, runAgentsOf, runningOfItem, runningTextOf, shortNameOf } from '../../lib/list'
import type { Context, ListItem, RowItem } from '../../lib/list'
import { headOf, syncOf, whereOf } from '../../lib/rows'
import { CARD_BORDER, TERMINAL_COLOR } from '../../theme/tokens'
import type { Actions, TextUi } from '../types'
import { LOST } from './ArchiveBox'
import { durationOf, runningTimeOf, tokensOf } from './format'
import { lossesOf } from './losses'
import { taskLinesOf } from './TaskBlock'
import { pillsOf } from './Tests'

type Line = { text: string; color?: string; key?: string }

type TextCardProps = { id: string; title: string; head: Line; lines: readonly (Line | string)[]; body?: RenderChildren; tail?: readonly (Line | string)[]; isNeeds?: boolean; onCollapse: () => void; actions?: RenderChildren }

const textLines = ({ Box, Text }: TextUi, lines: readonly (Line | string)[]) =>
  lines.map(line => (typeof line === 'string' ? { text: line } : line)).map(line => (line.color ? <Text color={line.color}>{line.text}</Text> : line.key ? <Box key={line.key}><Text dimColor>{line.text}</Text></Box> : <Text dimColor>{line.text}</Text>))

function TextCard(ui: TextUi, props: TextCardProps) {
  const { Box, Text, Button } = ui
  return (
    <Box key={`detail-${props.id}`} flexDirection="column" padding="sm" borderStyle="round" borderColor={props.isNeeds ? 'error' : CARD_BORDER}>
      <Box flexDirection="row" gap="sm">
        <Text weight="semibold">{props.title}</Text>
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

const headOfItem = (item: RowItem, context: Context): Line => ({ text: [lineTextOf(lineOf(item, context)), elapsedOfItem(item, context.at)].filter(Boolean).join(' · '), color: colorOf(item) })

const runningLineOf = (item: RowItem, context: Context): Line | string => {
  const run = runningOfItem(item, context)
  return run ? { key: `running-${item.id}`, text: `Running · ${runningTextOf(run)} · since ${clockOf(run.since)}` } : ''
}

export type TextSessionProps = { item: Extract<ListItem, { kind: 'session' }>; context: Context; asking: string; actions: Actions }

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
  const canArchive = !!now && !now.isRunning && row.state !== 'needs-you'
  const isStoppable = !!now?.isRunning && row.state !== 'needs-you'
  return TextCard(ui, {
    id: row.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [
      runningLineOf(item, context),
      ...taskLinesOf(shortNameOf(item), context.tasks?.[row.id]),
      facts?.now ? `Now: ${facts.now}` : '',
      facts?.next ? `Next: ${facts.next}` : '',
      ...(facts?.activity ?? []).slice(0, 3).map(line => `• ${line}`),
      where ? `${where.isMain ? 'Main checkout' : 'Worktree'}: ${where.path} · ${headOf(where)}` : facts?.location ? `Location: ${facts.location}` : '',
      where ? `Git: ${where.dirty ? `${where.dirty} uncommitted` : 'clean'} · ${syncOf(where)}` : facts?.git ? `Git: ${facts.git}` : '',
      now ? `Time: ${now.createdAt !== undefined ? `started ${clockOf(now.createdAt)}` : (facts?.time ?? '')} · ${now.isRunning ? 'active now' : `idle ${compactOf(at - now.lastActivityAt)}`}` : facts?.time ? `Time: ${facts.time}` : '',
      ...(facts?.commits ?? []).slice(0, 3).map(line => `Commit ${line}`),
      facts?.tests?.length ? `Tests: ${pillsOf(facts.tests).map(pill => `${pill.isFailed ? '✗' : '✓'} ${pill.full}`).join(' · ')}` : '',
      files.length ? `Files owned: ${[...files.slice(0, 3), ...(files.length > 3 ? [`+${files.length - 3} more`] : [])].join(' · ')}` : '',
      now?.permissionMode || model ? `Permission: ${now?.permissionMode ?? '—'} · Model: ${model || '—'}` : '',
      facts?.verified ? `Verified: ${facts.verified}` : '',
      facts?.risk ? `Risk: ${facts.risk}` : '',
    ].filter(Boolean),
    onCollapse: () => actions.collapse(row.id),
    actions:
      props.asking === `archive:${row.id}` && canArchive ? (
        <Box key={`confirm-${row.id}`} flexDirection="column">
          <Text weight="semibold">{`Archive ${shortNameOf(item)}?`}</Text>
          <Text dimColor>{LOST}</Text>
          {losses.map(loss => (
            <Text color="error">{`• ${loss}`}</Text>
          ))}
          <Box flexDirection="row" gap="sm">
            <Button key={`archive-no-${row.id}`} label="Cancel" onPress={() => actions.confirm('')} />
            <Button key={`archive-yes-${row.id}`} variant="primary" label="Archive and remove" onPress={() => actions.archive([row], undefined, losses)} />
          </Box>
        </Box>
      ) : (
        <Box key={`actions-${row.id}`} flexDirection="row" gap="sm">
          <Button key={`open-${row.id}`} label="Open" onPress={() => actions.open(row.id, row.name)} />
          {isStoppable ? <Button key={`stop-${row.id}`} label="Stop" onPress={() => actions.stop(row.id, row.name)} /> : null}
          {canArchive ? <Button key={`archive-${row.id}`} label={losses.length ? 'Archive…' : 'Archive'} onPress={() => (losses.length ? actions.confirm(`archive:${row.id}`) : actions.archive([row], undefined, losses))} /> : null}
        </Box>
      ),
  })
}

export type TextWorkflowProps = { item: Extract<ListItem, { kind: 'workflow' }>; context: Context; open: readonly string[]; onToggle: (id: string) => void; onCollapse: () => void }

export function TextWorkflowDetail(ui: TextUi, props: TextWorkflowProps) {
  const { Box, Text, Button } = ui
  const { item, context } = props
  const { run } = item
  const { counts } = run
  const at = context.at
  const end = run.endedAt ?? at
  const failed = run.agents.filter(agent => agent.state === 'failed')
  return TextCard(ui, {
    id: run.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [`run ${run.id} · ${counts.done}/${counts.total} done`, ...taskLinesOf(shortNameOf(item), run.task), ...failed.map(agent => ({ text: `Failed: ${agent.label}${agent.result ? ` — ${agent.result}` : ''}`, color: 'error' }))],
    body: runAgentsOf(run, context.agents).map(agent =>
      agent.kind === 'agent' && props.open.includes(agent.id) ? (
        TextSubagentDetail(ui, { item: agent, context, onCollapse: () => props.onToggle(run.id) })
      ) : (
        <Box key={`agent-${agent.id}`} flexDirection="row" gap="sm">
          <Button key={`agent-open-${agent.id}`} plain label={nameText(displayNameOf(agent))} onPress={() => props.onToggle(agent.id)} />
          <Text color={agent.status === 'needs' ? 'error' : undefined} dimColor={agent.status !== 'needs' || undefined} wrap="truncate-end">
            {[lineTextOf(lineOf(agent, context)), elapsedOfItem(agent, at)].filter(Boolean).join(' · ')}
          </Text>
        </Box>
      ),
    ),
    tail: [
      run.state === 'running' ? `Time: running ${runningTimeOf(item, at)} · started ${clockOf(run.startedAt)}` : `Time: took ${durationOf(end - run.startedAt)} · ${clockOf(run.startedAt)} – ${clockOf(end)}`,
      `Usage: ${plural(counts.total, 'agent')}${run.tokens ? ` · ${tokensOf(run.tokens)}` : ''}`,
    ],
    onCollapse: props.onCollapse,
  })
}

export type TextSubagentProps = { item: Extract<RowItem, { kind: 'subagent' | 'agent' }>; context: Context; onCollapse: () => void }

export function TextSubagentDetail(ui: TextUi, props: TextSubagentProps) {
  const { item, context } = props
  const { agent } = item
  const at = context.at
  const end = agent.endedAt ?? at
  const model = modelFamilyOf(item.kind === 'subagent' ? item.agent.requestedModel || item.agent.model : agent.model)
  const isRunning = agent.state === 'running'
  const how = item.kind === 'agent' ? `workflow agent ${item.agent.index} of ${item.run.counts.total}` : item.agent.isBackground ? 'background' : 'foreground'
  return TextCard(ui, {
    id: agent.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [
      runningLineOf(item, context),
      ...(item.status === 'needs' && agent.asking ? [{ text: `Permission: ${agent.asking.text}`, color: 'error' }] : []),
      ...taskLinesOf(item.kind === 'subagent' ? item.agent.description : item.agent.label, agent.task),
      `Model: ${model || '—'} · ${agent.type}`,
      `Started by: ${parentsOf(item, context).map(nameText).join(' › ')} · ${how}`,
      isRunning ? `Time: ${item.status === 'needs' && agent.asking ? 'waiting' : 'running'} ${runningTimeOf(item, at)} · started ${clockOf(agent.startedAt)}` : `Time: took ${durationOf(end - agent.startedAt)} · ${clockOf(agent.startedAt)} – ${clockOf(end)}`,
      !isRunning && agent.result ? `${agent.state === 'failed' ? 'Error' : 'Result'}: ${agent.result}` : '',
      !isRunning && agent.tokens ? tokensOf(agent.tokens) : '',
    ].filter(Boolean),
    onCollapse: props.onCollapse,
  })
}
