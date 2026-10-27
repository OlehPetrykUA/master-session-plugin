import { expect, test } from 'claude-code/testing'

import type { RowItem } from '../../lib/list'
import type { TextUi } from '../types'
import { TextSubagentDetail } from './TextDetail'

const ui = { Box: 'Box', Text: 'Text', Button: 'Button' } as unknown as TextUi

const subagent = (patch: object) =>
  ({ kind: 'subagent', id: 'a', group: 'working', status: 'working', agent: { id: 'a', type: 't', description: 'd', state: 'running', startedAt: 0, ...patch } }) as unknown as Extract<RowItem, { kind: 'subagent' }>

const timeOf = (item: Extract<RowItem, { kind: 'subagent' }>) =>
  JSON.stringify(TextSubagentDetail(ui, { item, context: { at: 90_000, trees: [], sessions: [], agents: [], rows: [] }, onCollapse: () => {} })).match(/Time: [^"]*/)?.[0]

test('the terminal card times a needs item like the GUI card, from asking.since, and a working one from its start', () => {
  expect(timeOf(subagent({}))).toMatch(/^Time: running 1m 30s · started /)
  expect(timeOf({ ...subagent({ asking: { text: 'Allow Bash: ls', since: 60_000 } }), status: 'needs' })).toMatch(/^Time: waiting 30s · started /)
})

test('the terminal open item shows the full name and task and wraps them', () => {
  const task = 'x'.repeat(120)
  const card = JSON.stringify(TextSubagentDetail(ui, { item: subagent({ name: task }), context: { at: 90_000, trees: [], sessions: [], agents: [], rows: [] }, onCollapse: () => {} }))
  expect(card).toContain(task)
  expect(card).toContain('"wrap":"wrap"')
})
