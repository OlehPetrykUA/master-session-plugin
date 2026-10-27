import { expect, test } from 'claude-code/testing'

import type { AgentRecord, LiveSession } from '../../../types'

import type { WorkflowAgent, WorkflowRun } from '../../lib/agents'
import { GROUP_OF } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { stateWordOf } from '../../lib/status'
import { tall } from '../../lib/layout'
import { STATUS } from '../../theme/icons'
import type { Status } from '../../theme/icons'
import type { Ui } from '../types'
import { Row } from './Row'

type Node = { type?: string; props?: { [name: string]: unknown }; children?: unknown }

const ui = { Box: 'Box', Text: 'Text', Button: 'Button', Svg: 'Svg' } as unknown as Ui

const nodesOf = (node: unknown): Node[] => (Array.isArray(node) ? node.flatMap(nodesOf) : node && typeof node === 'object' ? [node as Node, ...nodesOf((node as Node).children)] : [])

const stringsOf = (node: unknown): string[] => (typeof node === 'string' ? [node] : Array.isArray(node) ? node.flatMap(stringsOf) : node && typeof node === 'object' ? stringsOf((node as Node).children) : [])

const find = (tree: unknown, key: string) => nodesOf(tree).find(node => node.props?.key === key)

const STATUSES = Object.keys(STATUS) as Status[]

const NOW = 3_600_000

const live: LiveSession = { id: 's', name: 's', title: 'Implementer · Row', cwd: '/r', isRunning: true, isArchived: false, lastActivityAt: NOW, createdAt: NOW - 60_000, startedBy: 'me' }

const row = { id: 's', name: 's', title: 'Implementer · Row', state: 'working' as const, live }

const agent: AgentRecord = { id: 'a', type: 'master-session:reviewer', description: 'Review the gate', state: 'running', startedAt: NOW - 60_000 }

const flow: WorkflowAgent = { id: 'w1', index: 1, label: 'scan one', type: 'workflow-subagent', state: 'running', startedAt: NOW - 30_000 }

const run = (patch: Partial<WorkflowRun> = {}): WorkflowRun => ({ id: 'wf', name: 'audit', description: '', phases: [], state: 'running', startedAt: NOW - 90_000, agents: [flow], counts: { total: 1, running: 1, done: 0, failed: 0, asking: 0 }, tokens: 0, ...patch })

const context = (more: Partial<Context> = {}): Context => ({ at: NOW, trees: [], sessions: [], agents: [], rows: [row], self: 'me', ...more })

const items = (status: Status): { label: string; item: RowItem; starter: string }[] => {
  const group = GROUP_OF[status]
  return [
    { label: 'own session', item: { kind: 'session', id: 's', group, status, row, isOwn: true }, starter: 'Validator ›' },
    { label: 'user session', item: { kind: 'session', id: 's', group, status, row, isOwn: false }, starter: '' },
    { label: 'subagent', item: { kind: 'subagent', id: 'a', group, status, agent }, starter: 'Validator ›' },
    { label: 'workflow', item: { kind: 'workflow', id: 'wf', group, status, run: run() }, starter: 'Validator ›' },
    { label: 'workflow agent', item: { kind: 'agent', id: 'w1', group, status, run: run(), agent: flow }, starter: 'Workflow ›' },
    { label: 'archived', item: { kind: 'archived', id: 's', group, status, one: { ...live, isArchived: true } }, starter: 'Validator ›' },
  ]
}

test('AC1, AC3, AC4, AC6: for every kind and every status, line 2 holds only the starter, › and the state word, or the word alone', () => {
  for (const status of STATUSES)
    for (const { label, item, starter } of items(status)) {
      const tree = Row(ui, { item, context: context(), width: 400, isNarrow: false, onOpen: () => undefined })
      const line = find(tree, `row-${item.id}-line`)
      expect([label, status, stringsOf(line)]).toEqual([label, status, [...(starter ? [starter] : []), stateWordOf(status).text]])
    }
})

test('AC1: no row of any kind or status has a text, command, question, chain or meta element', () => {
  for (const status of STATUSES)
    for (const { item } of items(status)) {
      const keys = nodesOf(Row(ui, { item, context: context(), width: 400, isNarrow: false, onOpen: () => undefined })).flatMap(node => (typeof node.props?.key === 'string' ? [node.props.key] : []))
      expect(keys.filter(key => /-(text|cmd-[a-z]+|cmd|ask|ask-rows|ask-icon|chain|meta|kind)$/.test(key))).toEqual([])
    }
})

test('AC5: a subagent of a subagent of an Architect reads only its immediate parent’s type, never a chain', () => {
  const architect: AgentRecord = { id: 'arch', type: 'master-session:architect', description: 'Plan', state: 'running', startedAt: NOW - 90_000 }
  const mid: AgentRecord = { id: 'mid', type: 'master-session:qa-verifier', description: 'Verify', state: 'running', startedAt: NOW - 80_000, parentAgentId: 'arch' }
  const leaf: AgentRecord = { id: 'leaf', type: 'Explore', description: 'Look', state: 'running', startedAt: NOW - 70_000, parentAgentId: 'mid' }
  const item: RowItem = { kind: 'subagent', id: 'leaf', group: 'working', status: 'working', agent: leaf }
  const tree = Row(ui, { item, context: context({ agents: [architect, mid, leaf] }), width: 400, isNarrow: false, onOpen: () => undefined })
  expect(stringsOf(find(tree, 'row-leaf-line'))).toEqual(['QA verifier ›', 'running'])
  const top = find(Row(ui, { item: { ...item, id: 'mid', agent: mid }, context: context({ agents: [architect, mid, leaf] }), width: 400, isNarrow: false, onOpen: () => undefined }), 'row-mid-line')
  expect(stringsOf(top)).toEqual(['Architect ›', 'running'])
})

test('AC6: a workflow run reads its parent session’s type when it has one, and a user session reads the word alone', () => {
  const tree = Row(ui, { item: { kind: 'workflow', id: 'wf', group: 'working', status: 'working', run: run({ parentSessionId: 's' }) }, context: context(), width: 400, isNarrow: false, onOpen: () => undefined })
  expect(stringsOf(find(tree, 'row-wf-line'))).toEqual(['Implementer ›', 'running'])
})

test('AC7: a list row is 56 and a card top 50 in every status, needs you included, in both widths', () => {
  for (const status of STATUSES)
    for (const { item } of items(status))
      for (const width of [300, 600]) {
        const isNarrow = width < 340
        const list = find(Row(ui, { item, context: context(), width, isNarrow, onOpen: () => undefined }), `row-${item.id}`)
        const top = find(Row(ui, { item, context: context(), width, isNarrow, isInCard: true, onOpen: () => undefined }), `top-${item.id}`)
        expect([list?.props?.minHeight, top?.props?.minHeight]).toEqual([tall(56), tall(50)])
      }
})
