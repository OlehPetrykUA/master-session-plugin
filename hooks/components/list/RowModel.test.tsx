import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord } from '../../../types'

import { across, bodyWidthOf } from '../../lib/layout'
import { modelFamilyOf } from '../../lib/format'
import { glyph } from '../../theme/icons'
import { PANE, click, started, textsOf, warmUp } from '../../testing/world'

const NOW = 3_600_000

type Node = { type?: string; props?: { key?: string }; key?: string; children?: Node[] }

function seeded(on: On, agents: AgentRecord[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const agent = (id: string, more: Partial<AgentRecord> = {}): AgentRecord => ({ id, type: 'master-session:implementer', description: 'Row model', prompt: 'Build it.', state: 'running', startedAt: NOW - 180_000, ...more })

const H = agent('h1', { requestedModel: 'claude-haiku-4-5', model: 'claude-opus-5-5' })

const keyOf = (node: Node) => node.props?.key ?? node.key ?? ''

const modelKeys = async (ui: { findAll: (query: { type: string }) => Promise<{ key: string | undefined }[]> }) => (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.includes('-model') ? [box.key] : []))

warmUp()

test('AC1: a subagent row reads the requested model, haiku, with the haiku glyph at 12 px muted', async ($, on) => {
  seeded(on, [H])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const box = await ui.find({ key: 'row-h1-model' })
  expect(box?.text).toBe('haiku')
  expect(box?.props.marginLeft).toBe(across(4))
  const [mark] = ((await ui.find({ key: 'row-h1-model-glyph' }))?.children ?? []) as { props: { source: string; alt: string; width: number } }[]
  expect([mark?.props.alt, mark?.props.width, mark?.props.source]).toEqual(['haiku', 12, glyph('haiku', 12, 'muted', 2.2)])
  const word = (box?.children as { type: string; props: { size: string; color: string } }[]).find(one => one.type === 'Text')
  expect([word?.props.size, word?.props.color]).toEqual(['footnote', 'inactive'])
  await ui.unmount()
})

test('AC2 and AC8: a session row reads the family alone, no effort in any row Text; the card keeps "opus · xhigh" and starts with the row word', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'row-local_env-model' }))?.text).toBe('opus')
  expect((await textsOf(ui)).some(text => text.includes('xhigh'))).toBe(false)
  await click(ui, 'hit-row-local_env')
  const card = (await ui.find({ key: 'model-value-local_env' }))?.text
  expect(card).toBe('opus · xhigh')
  expect(modelFamilyOf(card?.split(' · ')[0])).toBe((await ui.find({ key: 'top-local_env-model' }))?.text)
  await ui.unmount()
})

test('AC3: a workflow agent row reads sonnet from its model', async ($, on) => {
  seeded(on, [agent('w1', { type: 'workflow-subagent', description: 'review:bugs', model: 'claude-sonnet-4-6', run: { id: 'wf_1', index: 1 } })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-wf_1')
  expect((await ui.find({ key: 'row-w1-model' }))?.text).toBe('sonnet')
  await ui.unmount()
})

test('AC4: an archived session row reads opus', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-chip-archived')
  expect((await ui.find({ key: 'row-local_old-model' }))?.text).toBe('opus')
  await ui.unmount()
})

test('AC6 and AC7: no model draws no element and no gap; a workflow run row never shows one', async ($, on) => {
  seeded(on, [agent('h2'), agent('w1', { type: 'workflow-subagent', description: 'review:bugs', run: { id: 'wf_1', index: 1 } }), agent('w2', { type: 'workflow-subagent', description: 'verify', model: 'claude-haiku-4-5', run: { id: 'wf_1', index: 2 } })])
  await started($, on, undefined, { isLookupDown: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-wf_1')
  expect((await modelKeys(ui)).filter(key => !key.startsWith('row-w2'))).toEqual([])
  expect((await ui.find({ key: 'row-wf_1-model' }))).toBeUndefined()
  expect((await ui.find({ key: 'row-w2-model' }))?.text).toBe('haiku')
  for (const id of ['h2', 'local_env', 'w1']) {
    const line = (await ui.find({ key: `row-${id}` }))?.text ?? ''
    expect(['opus', 'sonnet', 'haiku', 'fable'].some(word => line.includes(word))).toBe(false)
  }
  expect((await ui.find({ key: 'row-h2' }))?.text).toBe('Implementer·Row modelValidator ›running3m')
  await ui.unmount()
})

test('AC9, AC10 and AC11: the model ends line 1 before the time, ring and chevron; the card top reads it; at 38 columns it stays on line 1 while the time moves to line 2', async ($, on) => {
  seeded(on, [H])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = (await ui.find({ key: 'row-h1' })) as unknown as Node
  const [, column] = row.children ?? []
  const [one] = column?.children ?? []
  const keys = (one?.children ?? []).map(keyOf)
  expect(keys.at(-1)).toBe('row-h1-model')
  expect(keys.indexOf('row-h1-persona')).toBeLessThan(keys.indexOf('row-h1-model'))
  const top = (row.children ?? []).map(keyOf)
  expect(top).not.toContain('row-h1-model')
  expect([top.indexOf('row-h1-meta') > -1, top.at(-1)]).toEqual([true, 'row-h1-chevron'])
  await click(ui, 'hit-row-h1')
  expect((await ui.find({ key: 'top-h1-model' }))?.text).toBe('haiku')
  expect((await ui.find({ key: 'model-value-h1' }))?.text).toBe('haiku')
  await click(ui, 'hit-top-h1')
  await ui.unmount()
  const narrow = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 38 } })
  expect((await narrow.find({ key: 'row-h1-model' }))?.text).toBe('haiku')
  expect((await narrow.find({ key: 'row-h1-line' }))?.text).toContain('3m')
  expect((await narrow.find({ key: 'row-h1-meta' }))).toBeUndefined()
  await narrow.unmount()
})

test('AC12: the terminal row tail reads the status line, the model word, then the time', async ($, on) => {
  seeded(on, [H])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textsOf(ui)).toContain('Validator › running · haiku · 3m')
  await ui.unmount()
})

test('AC13: at 47 columns the task truncates with the end cut, the persona and the model stay whole', async ($, on) => {
  seeded(on, [agent('h1', { description: 'Add the model label to every row of the pane list', requestedModel: 'claude-haiku-4-5' })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 47 } })
  expect(Math.round(bodyWidthOf(47))).toBe(358)
  expect((await ui.find({ key: 'row-h1-model' }))?.text).toBe('haiku')
  expect((await ui.find({ key: 'row-h1-model' }))?.props.flexShrink).toBe(0)
  expect((await ui.find({ key: 'row-h1-persona' }))?.props.flexShrink).toBe(0)
  const texts = await ui.findAll({ type: 'Text' })
  const task = texts.find(one => one.text === 'Add the model label to every row of the pane list')
  expect(task?.props.wrap).toBe('truncate-end')
  expect(texts.find(one => one.text === 'Implementer')).toBeDefined()
  await ui.unmount()
})

test('edge: a persona with no task and a model reads "Persona" then the model, with no dot; a non-Claude id keeps its whole word with the modelChip glyph', async ($, on) => {
  seeded(on, [agent('h1', { description: '', model: 'supercalifragilistic-9' }), agent('h3', { description: 'Other', model: 'gpt-5' })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const line = ((await ui.find({ key: 'row-h1' })) as unknown as Node).children?.[1]?.children?.[0]?.children ?? []
  expect(line.map(keyOf)).toEqual(['row-h1-persona', 'row-h1-model'])
  expect((await ui.find({ key: 'row-h1-model' }))?.text).toBe('supercalifragilistic')
  const [mark] = ((await ui.find({ key: 'row-h3-model-glyph' }))?.children ?? []) as { props: { alt: string } }[]
  expect([(await ui.find({ key: 'row-h3-model' }))?.text, mark?.props.alt]).toEqual(['gpt', 'modelChip'])
  await ui.unmount()
})
