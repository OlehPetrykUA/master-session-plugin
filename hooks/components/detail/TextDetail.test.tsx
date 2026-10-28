import { expect, test } from 'claude-code/testing'

import type { LiveSession } from '../../../types'

import { archivedItemOf } from '../../lib/list'
import type { Context, ListItem, RowItem } from '../../lib/list'
import { statusSentenceOf } from '../../lib/status'
import type { Actions, TextUi } from '../types'
import { TextArchivedDetail, TextSessionDetail, TextSubagentDetail, TextWorkflowDetail } from './TextDetail'

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
  expect(timeOf(subagent({}))).toMatch(/^running 1m · started /)
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

test('the archived terminal line reads clock, age and run time', () => {
  const one: LiveSession = { id: 'z', name: 'z', title: 'Old', cwd: '/r', isRunning: false, isArchived: true, lastActivityAt: 6_000_000, createdAt: 0 }
  const actions = { open: () => {}, confirm: () => {} } as unknown as Actions
  const card = TextArchivedDetail(ui, { item: archivedItemOf(one), context: { ...context, at: 6_000_000 + 7_200_000 }, home: '/h', actions, onCollapse: () => {} })
  expect(valueOf(card, 'Archived')).toMatch(/^\d{2}:\d{2} · 2h ago · ran 1h 40m$/)
})

test('AC26: the archived terminal card offers Open only for a session this master started, and Unarchive always', () => {
  const one = (startedBy: string): LiveSession => ({ id: 'z', name: 'z', title: 'Implementer · Old', cwd: '/r', isRunning: false, isArchived: true, lastActivityAt: 0, createdAt: 0, startedBy })
  const actions = { open: () => {}, confirm: () => {} } as unknown as Actions
  const keys = (startedBy: string) => nodesOf(TextArchivedDetail(ui, { item: archivedItemOf(one(startedBy)), context: { ...context, self: 'me' }, home: '/h', actions, onCollapse: () => {} })).flatMap(node => (typeof node.props?.key === 'string' ? [node.props.key] : []))
  expect(keys('me')).toEqual(expect.arrayContaining(['archived-open-z', 'unarchive-z']))
  expect(keys('you')).toContain('unarchive-z')
  expect(keys('you')).not.toContain('archived-open-z')
})

const PROBES = ['running bun test --watch', 'npm run build && npm test', 'FOO=1 make']

const sessionCard = (facts: object) => {
  const row = { id: 's', name: 's', title: 'S', state: 'working', board: { id: 's', name: 's', state: 'working', ...facts } }
  const item = { kind: 'session', id: 's', group: 'working', status: 'working', row } as unknown as Extract<ListItem, { kind: 'session' }>
  return collect(TextSessionDetail(ui, { item, context, home: '/h', asking: '', actions: { collapse: () => {} } as unknown as Actions }))
}

for (const probe of PROBES) {
  for (const field of ['now', 'next'] as const) {
    test(`AC30: the terminal card drops a command-text ${field} line: ${probe}`, () => {
      const other = field === 'now' ? 'next' : 'now'
      const strings = sessionCard({ [field]: probe, [other]: 'plain step' })
      expect(strings.some(text => text.includes(probe))).toBe(false)
      expect(strings).toContain('plain step')
    })
  }
}

const TOOK = [
  [125_000, 'took 2m · '],
  [3_720_000, 'took 1h 2m · '],
  [42_000, 'took 42s · '],
] as const

for (const [ms, word] of TOOK) {
  test(`R9: the terminal subagent card reads ${word.trim()} for a run of ${ms} ms`, () => {
    const done = subagent({ state: 'done', startedAt: 1_000_000, endedAt: 1_000_000 + ms })
    expect(timeOf({ ...done, status: 'done' } as Extract<RowItem, { kind: 'subagent' }>)).toMatch(new RegExp(`^${word}\\d`))
  })

  test(`R9: the terminal workflow card reads ${word.trim()} for a run of ${ms} ms`, () => {
    const run = { id: 'wf', name: 'wf', description: '', phases: [], state: 'done', startedAt: 1_000_000, endedAt: 1_000_000 + ms, agents: [], counts: { total: 0, running: 0, done: 0, failed: 0, asking: 0 }, tokens: 0 }
    const item = { kind: 'workflow', id: 'wf', group: 'done', status: 'done', run } as unknown as Extract<ListItem, { kind: 'workflow' }>
    const card = TextWorkflowDetail(ui, { item, context, home: '/h', open: [], onToggle: () => {}, onCollapse: () => {} })
    expect(valueOf(card, 'Time')).toMatch(new RegExp(`^${word}\\d`))
  })
}
