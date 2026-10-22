import type { RenderChildren } from 'claude-code'

import type { AgentRecord, Repo } from '../../../types'

import type { WorkflowRun } from '../../lib/agents'
import { stepOf } from '../../lib/board'
import { compactOf, modelOf } from '../../lib/format'
import { clockOf, kindOfType, modelFamilyOf, plural } from '../../lib/list'
import { elapsedOf, headOf, syncOf, titleOf, whereOf } from '../../lib/rows'
import type { Row } from '../../lib/rows'
import { AGENT } from '../../theme/detail'
import { CARD_BORDER, LABEL, TERMINAL_COLOR } from '../../theme/tokens'
import type { Actions, TextUi } from '../types'
import { LOST } from './ArchiveBox'
import { SEEN, WORD, durationOf, tokensOf } from './format'
import { lossesOf } from './losses'

type Line = { text: string; color?: string }

type TextCardProps = { id: string; title: string; head: Line; lines: readonly (Line | string)[]; isNeeds?: boolean; onCollapse: () => void; actions?: RenderChildren }

const MARK = { running: '●', done: '✓', failed: '✗' } as const

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

export type TextSessionProps = { row: Row; trees: readonly Repo[]; at: number; asking: string; isReadOnly: boolean; actions: Actions }

export function TextSessionDetail(ui: TextUi, props: TextSessionProps) {
  const { Box, Text, Button } = ui
  const { row, at, actions } = props
  const facts = row.board
  const now = row.live
  const step = stepOf(facts?.progress)
  const where = whereOf(row, props.trees)?.tree
  const files = facts?.files ?? []
  const model = modelOf(now?.model, now?.effort)
  const losses = lossesOf(row, props.trees)
  const canArchive = !!now && !now.isRunning && row.state !== 'needs-you' && !props.isReadOnly
  const isStoppable = !!now?.isRunning && row.state !== 'needs-you'
  return TextCard(ui, {
    id: row.id,
    title: titleOf(row),
    isNeeds: row.state === 'needs-you',
    head: { text: [LABEL[row.state], step ? `step ${step.done} of ${step.total}${step.label ? `: ${step.label}` : ''}` : '', elapsedOf(row, at)].filter(Boolean).join(' · '), color: TERMINAL_COLOR[row.state] },
    lines: [
      ...(facts?.needsYou ? [{ text: `Blocker: ${facts.needsYou}`, color: 'error' }, 'waiting for your answer'] : []),
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
          <Text weight="semibold">{`Archive ${row.name}?`}</Text>
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
          {now && row.state === 'needs-you' ? <Button key={`chat-${row.id}`} variant="primary" label="Open chat" onPress={() => actions.open(row.id, row.name)} /> : null}
          <Button key={`open-${row.id}`} label="Open" onPress={() => actions.open(row.id, row.name)} />
          {isStoppable ? <Button key={`stop-${row.id}`} label="Stop" onPress={() => actions.stop(row.id, row.name)} /> : null}
          {canArchive ? <Button key={`archive-${row.id}`} label={losses.length ? 'Archive…' : 'Archive'} onPress={() => (losses.length ? actions.confirm(`archive:${row.id}`) : actions.archive([row], undefined, losses))} /> : null}
        </Box>
      ),
  })
}

export type TextWorkflowProps = { run: WorkflowRun; at: number; onCollapse: () => void }

export function TextWorkflowDetail(ui: TextUi, props: TextWorkflowProps) {
  const { run, at } = props
  const { counts } = run
  const end = run.endedAt ?? at
  const failed = run.agents.filter(agent => agent.state === 'failed')
  return TextCard(ui, {
    id: run.id,
    title: run.name,
    head: { text: [WORD[run.state], plural(counts.total, 'agent'), durationOf(end - run.startedAt)].join(' · '), color: TERMINAL_COLOR[SEEN[run.state]] },
    lines: [
      `Workflow · run ${run.id} · ${counts.done}/${counts.total} done`,
      ...failed.map(agent => ({ text: `Failed: ${agent.label}${agent.result ? ` — ${agent.result}` : ''}`, color: 'error' })),
      ...run.agents.map(agent => `${MARK[agent.state]} ${agent.label} · ${AGENT[agent.state].word} · ${durationOf((agent.endedAt ?? at) - agent.startedAt)}`),
      run.state === 'running' ? `Time: running ${durationOf(at - run.startedAt)} · started ${clockOf(run.startedAt)}` : `Time: took ${durationOf(end - run.startedAt)} · ${clockOf(run.startedAt)} – ${clockOf(end)}`,
      `Usage: ${plural(counts.total, 'agent')}${run.tokens ? ` · ${tokensOf(run.tokens)}` : ''}`,
    ],
    onCollapse: props.onCollapse,
  })
}

export type TextSubagentProps = { agent: AgentRecord; at: number; onCollapse: () => void }

export function TextSubagentDetail(ui: TextUi, props: TextSubagentProps) {
  const { agent, at } = props
  const end = agent.endedAt ?? at
  const model = modelFamilyOf(agent.model)
  const isRunning = agent.state === 'running'
  return TextCard(ui, {
    id: agent.id,
    title: agent.name || agent.description,
    head: { text: [WORD[agent.state], kindOfType(agent.type), model, durationOf(end - agent.startedAt)].filter(Boolean).join(' · '), color: TERMINAL_COLOR[SEEN[agent.state]] },
    lines: [
      `Task: ${agent.description}`,
      agent.prompt ?? '',
      `Agent type: ${agent.type} · Model: ${model || '—'}`,
      `Started by: ${agent.spawnedBy ? `${agent.spawnedBy} plugin` : 'main chat'} · ${agent.isBackground ? 'background' : 'foreground'}`,
      isRunning ? `Time: running ${durationOf(at - agent.startedAt)} · started ${clockOf(agent.startedAt)}` : `Time: took ${durationOf(end - agent.startedAt)} · ${clockOf(agent.startedAt)} – ${clockOf(end)}`,
      !isRunning && agent.result ? `${agent.state === 'failed' ? 'Error' : 'Result'}: ${agent.result}` : '',
      !isRunning && agent.tokens ? tokensOf(agent.tokens) : '',
    ].filter(Boolean),
    onCollapse: props.onCollapse,
  })
}
