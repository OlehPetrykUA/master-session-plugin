import { expect, test } from 'claude-code/testing'

import type { AgentRecord, Board } from '../../types'

import { liveOf } from '../testing/world'
import { bodyWidthOf, textWidth } from './layout'
import { elapsedOfItem, itemsOf } from './list'
import type { Context, RowItem } from './list'
import { rowsOf } from './rows'
import { modelWordOf, rowFitOf } from './rowfit'

const NOW = 3_600_000

const agent = (more: Partial<AgentRecord> = {}): AgentRecord => ({ id: 'x', type: 'master-session:implementer', description: '', state: 'running', startedAt: NOW - 180_000, ...more })

const subagent = (more: Partial<AgentRecord> = {}) => itemsOf([], [agent(more)], [], { at: NOW }).find(one => one.kind === 'subagent') as RowItem

const context: Context = { at: NOW, trees: [], sessions: [], agents: [], rows: [] }

const BOARD: Board = { sessions: [{ id: 'q', name: 'q', state: 'needs-you', needsYou: 'Allow Bash: ls' }], needsYou: [], repos: [], source: 'tool' }

const asker = (model: string | undefined) => {
  const live = liveOf()
  const rows = rowsOf(BOARD, { ...live, sessions: [{ id: 'q', name: 'q', title: 'Implementer · Prompt status data and more', cwd: '/', isRunning: true, isArchived: false, lastActivityAt: 0, model }] })
  return itemsOf(rows, [], [], { at: NOW })[0] as RowItem
}

const input = (width: number) => ({ width, isNarrow: width < 340, home: '/h', chat: 'Open chat' })

test('AC14: a persona exactly as wide as the column minus the model is not cut; one px wider is, and the model is still drawn whole', () => {
  const item = subagent({ model: 'claude-haiku-4-5' })
  const bare = subagent()
  const persona = textWidth('Implementer', 14, { isBold: true })
  const model = 4 + 4 + 12 + 4 + textWidth('haiku', 12)
  const rest = 2 + 12 + 4 + 28 + 12 + 24 + 12 + 16 + textWidth(elapsedOfItem(item, NOW), 12) + 12
  const width = persona + model + rest
  const fit = (one: RowItem, w: number) => rowFitOf(one, context, { width: w, isNarrow: false, home: '/h' })
  expect([fit(item, width + 1e-6).isPersonaCut, fit(item, width - 1).isPersonaCut]).toEqual([false, true])
  expect([fit(bare, width - 1).isPersonaCut, fit(item, width - 1).model]).toEqual([false, 'haiku'])
  expect(bodyWidthOf(47)).toBeGreaterThan(width)
})

test('AC15: at the width where the task shows 12 characters with no model, Open chat keeps its label with no model and turns icon-only with haiku', () => {
  const [bare, haiku] = [asker(undefined), asker('claude-haiku-4-5')]
  let width = 300
  while (rowFitOf(bare, context, input(width)).isChatIcon) width += 0.25
  expect([rowFitOf(bare, context, input(width)).isChatIcon, rowFitOf(haiku, context, input(width)).isChatIcon]).toEqual([false, true])
  expect(rowFitOf(haiku, context, input(width + 4 + 4 + 12 + 4 + textWidth('haiku', 12))).isChatIcon).toBe(false)
})

test('AC16: the row height is the same with and without a model at 38, 47 and 60 columns, for a session and a needs-you row', () => {
  const working = (model: string | undefined) => {
    const rows = rowsOf({ ...BOARD, sessions: [{ id: 'q', name: 'q', state: 'working', progress: 'step 1 of 2 — fix' }] }, { ...liveOf(), sessions: [{ id: 'q', name: 'q', title: 'Implementer · Prompt', cwd: '/', isRunning: true, isArchived: false, lastActivityAt: 0, model }] })
    return itemsOf(rows, [], [], { at: NOW })[0] as RowItem
  }
  for (const columns of [38, 47, 60])
    for (const make of [working, asker, (model: string | undefined) => subagent({ requestedModel: model })]) {
      const heights = [undefined, 'claude-haiku-4-5'].map(model => rowFitOf(make(model), context, input(bodyWidthOf(columns))).height)
      expect([columns, heights[1]]).toEqual([columns, heights[0]])
    }
})

test('the model word is the requested one for a subagent, the family of the id, and empty for a run or an unknown model', () => {
  expect([modelWordOf(subagent({ requestedModel: 'claude-haiku-4-5', model: 'claude-opus-5-5' })), modelWordOf(subagent({ model: 'claude-opus-5-5' })), modelWordOf(subagent())]).toEqual(['haiku', 'opus', ''])
  const run = itemsOf([], [agent({ id: 'w', run: { id: 'wf', index: 1 }, model: 'claude-opus-5-5' })], [], { at: NOW }).find(one => one.kind === 'workflow')
  expect([run?.kind, modelWordOf(run as RowItem)]).toEqual(['workflow', ''])
})
