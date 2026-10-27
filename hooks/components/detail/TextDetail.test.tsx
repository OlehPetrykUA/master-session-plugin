import { expect, test } from 'claude-code/testing'

import type { LiveSession } from '../../../types'

import { archivedItemOf } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { statusSentenceOf } from '../../lib/status'
import type { Actions, TextUi } from '../types'
import { TextArchivedDetail, TextSubagentDetail } from './TextDetail'

const ui = { Box: 'Box', Text: 'Text', Button: 'Button' } as unknown as TextUi

const subagent = (patch: object) =>
  ({ kind: 'subagent', id: 'a', group: 'working', status: 'working', agent: { id: 'a', type: 't', description: 'd', state: 'running', startedAt: 0, ...patch } }) as unknown as Extract<RowItem, { kind: 'subagent' }>

const context: Context = { at: 90_000, trees: [], sessions: [], agents: [], rows: [] }

type Node = { type?: string; props?: { [name: string]: unknown }; children?: unknown }

const nodesOf = (node: unknown): Node[] => (Array.isArray(node) ? node.flatMap(nodesOf) : node && typeof node === 'object' ? [node as Node, ...nodesOf((node as Node).children)] : [])

const collect = (node: unknown): string[] => (typeof node === 'string' ? [node] : Array.isArray(node) ? node.flatMap(collect) : node && typeof node === 'object' ? collect((node as Node).children) : [])

const valueOf = (tree: unknown, label: string) => {
  const all = collect(tree)
  return all[all.indexOf(`${label}: `) + 1]
}

const timeOf = (item: Extract<RowItem, { kind: 'subagent' }>) => valueOf(TextSubagentDetail(ui, { item, context, home: '/h', onCollapse: () => {} }), 'Time')

test('the terminal card times a needs item like the GUI card, from asking.since, and a working one from its start', () => {
  expect(timeOf(subagent({}))).toMatch(/^running 1m 30s · started /)
  expect(timeOf({ ...subagent({ asking: { text: 'Allow Bash: ls', since: 60_000 } }), status: 'needs' })).toMatch(/^waiting 30s · started /)
})

test('the terminal open item shows the full name and task and wraps them', () => {
  const task = 'x'.repeat(120)
  const card = TextSubagentDetail(ui, { item: subagent({ name: task }), context, home: '/h', onCollapse: () => {} })
  expect(JSON.stringify(card)).toContain(task)
  expect(nodesOf(card).some(node => node.type === 'Text' && node.props?.wrap === 'wrap' && collect(node).some(text => text.includes(task)))).toBe(true)
})

test('AC29: the head line reads starter › word · model · elapsed, and the Status line is the desktop sentence character for character', () => {
  const item = { ...subagent({ requestedModel: 'claude-haiku-4-5', asking: { text: 'Allow Bash: rm -rf dist', since: 60_000 } }), status: 'needs' } as Extract<RowItem, { kind: 'subagent' }>
  const card = TextSubagentDetail(ui, { item, context, home: '/h', onCollapse: () => {} })
  const strings = collect(card)
  expect(strings).toContain('Validator › needs you · haiku · 1m')
  expect(valueOf(card, 'Status')).toBe(statusSentenceOf(item, context, '/h').text)
  expect(valueOf(card, 'Status')).toBe('Needs you: it asks to use Bash. Answer in this chat.')
  expect(strings.some(text => text.includes('rm -rf'))).toBe(false)
  const status = nodesOf(card).find(node => node.type === 'Text' && collect(node).includes('Status: '))
  expect(nodesOf(status).some(node => node.props?.color === 'error')).toBe(true)
})

test('AC26: the archived terminal card offers Open only for a session this master started, and Unarchive always', () => {
  const one = (startedBy: string): LiveSession => ({ id: 'z', name: 'z', title: 'Implementer · Old', cwd: '/r', isRunning: false, isArchived: true, lastActivityAt: 0, createdAt: 0, startedBy })
  const actions = { open: () => {}, confirm: () => {} } as unknown as Actions
  const keys = (startedBy: string) => nodesOf(TextArchivedDetail(ui, { item: archivedItemOf(one(startedBy)), context: { ...context, self: 'me' }, home: '/h', actions, onCollapse: () => {} })).flatMap(node => (typeof node.props?.key === 'string' ? [node.props.key] : []))
  expect(keys('me')).toEqual(expect.arrayContaining(['archived-open-z', 'unarchive-z']))
  expect(keys('you')).toContain('unarchive-z')
  expect(keys('you')).not.toContain('archived-open-z')
})
