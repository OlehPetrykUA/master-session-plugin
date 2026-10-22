import type { RenderChildren } from 'claude-code'

import { compactOf, modelOf } from '../../lib/format'
import { clockOf, displayNameOf, elapsedOfItem, lineOf, lineTextOf, modelFamilyOf, nameText, parentsOf, plural, runAgentsOf, shortNameOf } from '../../lib/list'
import type { Context, ListItem, RowItem } from '../../lib/list'
import { headOf, syncOf, whereOf } from '../../lib/rows'
import { STATUS } from '../../theme/icons'
import { CARD_BORDER, TERMINAL_COLOR } from '../../theme/tokens'
import type { Actions, TextUi } from '../types'
import { LOST } from './ArchiveBox'
import { durationOf, tokensOf } from './format'
import { lossesOf } from './losses'

type Line = { text: string; color?: string }

type TextCardProps = { id: string; title: string; head: Line; lines: readonly (Line | string)[]; isNeeds?: boolean; onCollapse: () => void; actions?: RenderChildren }

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
      {props.lines.map(line => (typeof line === 'string' ? { text: line } : line)).map(line => (line.color ? <Text color={line.color}>{line.text}</Text> : <Text dimColor>{line.text}</Text>))}
      {props.actions}
    </Box>
  )
}

export const colorOf = (item: RowItem) => (item.status === 'archived' ? 'subtle' : TERMINAL_COLOR[item.group])

const headOfItem = (item: RowItem, context: Context): Line => ({ text: [lineTextOf(lineOf(item, context)), elapsedOfItem(item, context.at)].filter(Boolean).join(' · '), color: colorOf(item) })

export type TextSessionProps = { item: Extract<ListItem, { kind: 'session' }>; context: Context; asking: string; isReadOnly: boolean; actions: Actions }

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
  const canArchive = !!now && !now.isRunning && row.state !== 'needs-you' && !props.isReadOnly
  const isStoppable = !!now?.isRunning && row.state !== 'needs-you'
  return TextCard(ui, {
    id: row.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [
      facts?.now ? `Now: ${facts.now}` : '',
      facts?.next ? `Next: ${facts.next}` : '',
      ...(facts?.activity ?? []).slice(0, 3).map(line => `• ${line}`),
      where ? `${where.isMain ? 'Main checkout' : 'Worktree'}: ${where.path} · ${headOf(where)}` : facts?.location ? `Location: ${facts.location}` : '',
      where ? `Git: ${where.dirty ? `${where.dirty} uncommitted` : 'clean'} · ${syncOf(where)}` : facts?.git ? `Git: ${facts.git}` : '',
      now ? `Time: ${now.createdAt !== undefined ? `started ${clockOf(now.createdAt)}` : (facts?.time ?? '')} · ${now.isRunning ? 'active now' : `idle ${compactOf(at - now.lastActivityAt)}`}` : facts?.time ? `Time: ${facts.time}` : '',
      ...(facts?.commits ?? []).slice(0, 3).map(line => `Commit ${line}`),
      facts?.tests?.length ? `Tests: ${facts.tests.map(test => `✓ ${test}`).join(' · ')}` : '',
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

export type TextWorkflowProps = { item: Extract<ListItem, { kind: 'workflow' }>; context: Context; onCollapse: () => void }

export function TextWorkflowDetail(ui: TextUi, props: TextWorkflowProps) {
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
    lines: [
      `run ${run.id} · ${counts.done}/${counts.total} done`,
      ...failed.map(agent => ({ text: `Failed: ${agent.label}${agent.result ? ` — ${agent.result}` : ''}`, color: 'error' })),
      ...runAgentsOf(run, context.agents).map(agent => ({ text: `${nameText(displayNameOf(agent))} · ${lineTextOf(lineOf(agent, context))} · ${elapsedOfItem(agent, at)}`, color: agent.status === 'needs' ? 'error' : undefined })),
      run.state === 'running' ? `Time: running ${durationOf(at - run.startedAt)} · started ${clockOf(run.startedAt)}` : `Time: took ${durationOf(end - run.startedAt)} · ${clockOf(run.startedAt)} – ${clockOf(end)}`,
      `Usage: ${plural(counts.total, 'agent')}${run.tokens ? ` · ${tokensOf(run.tokens)}` : ''}`,
    ],
    onCollapse: props.onCollapse,
  })
}

export type TextSubagentProps = { item: Extract<ListItem, { kind: 'subagent' }>; context: Context; onCollapse: () => void }

export function TextSubagentDetail(ui: TextUi, props: TextSubagentProps) {
  const { item, context } = props
  const { agent } = item
  const at = context.at
  const end = agent.endedAt ?? at
  const model = modelFamilyOf(agent.requestedModel || agent.model)
  const isRunning = agent.state === 'running'
  return TextCard(ui, {
    id: agent.id,
    title: nameText(displayNameOf(item)),
    isNeeds: item.status === 'needs',
    head: headOfItem(item, context),
    lines: [
      ...(item.status === 'needs' && agent.asking ? [{ text: `Permission: ${agent.asking.text}`, color: 'error' }] : []),
      `Task: ${agent.description}`,
      agent.prompt ?? '',
      `Model: ${model || '—'} · ${agent.type}`,
      `Started by: ${parentsOf(item, context).map(nameText).join(' › ')} · ${agent.isBackground ? 'background' : 'foreground'}`,
      isRunning ? `Time: running ${durationOf(at - agent.startedAt)} · started ${clockOf(agent.startedAt)}` : `Time: took ${durationOf(end - agent.startedAt)} · ${clockOf(agent.startedAt)} – ${clockOf(end)}`,
      !isRunning && agent.result ? `${agent.state === 'failed' ? 'Error' : 'Result'}: ${agent.result}` : '',
      !isRunning && agent.tokens ? tokensOf(agent.tokens) : '',
    ].filter(Boolean),
    onCollapse: props.onCollapse,
  })
}
