import { expect, test } from 'claude-code/testing'

import { shortOf } from '../lib/format'
import { CH, tall } from '../lib/layout'
import { HEADER_NARROW_PX, headerRowsOf, isHeaderNarrow } from '../lib/sections'
import { PANE, BOARD, click, hitsOf, started, textsOf, warmUp } from '../testing/world'

warmUp()

const LABELS = ['Pause', 'Ask', 'Refresh']

test('AC16 the header buttons sit on their own row below 460 px and beside the title from 460 px; chips and tiles still switch at 340 px', async ($, on) => {
  await started($, on)
  for (const [columns, isRowed, perRow] of [
    [36, true, 3],
    [49, true, 4],
    [55, true, 4],
    [56, false, 4],
    [68, false, 4],
  ] as const) {
    expect(isHeaderNarrow(columns)).toBe(isRowed)
    expect(columns * CH < HEADER_NARROW_PX).toBe(isRowed)
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: columns }, surface: 'desktop' })
    const header = await ui.find({ key: 'section-header' })
    const row = await ui.find({ key: 'header-buttons' })
    const hits = await hitsOf(ui)
    expect(hits.filter(hit => ['hit-pause', 'hit-ask', 'hit-refresh'].includes(hit))).toEqual(['hit-pause', 'hit-ask', 'hit-refresh'])
    if (isRowed) {
      expect(row?.props.justifyContent).toBe('flex-end')
      expect(row?.props.flexDirection).toBe('row')
      for (const label of LABELS) expect(row?.text).toContain(label)
      expect(row?.text).not.toContain('Master session')
      expect(header?.props.flexDirection).toBe('column')
      expect(header?.props.minHeight).toBeUndefined()
    } else {
      expect(row).toBeUndefined()
      expect(header?.props.flexDirection).toBe('row')
      expect(header?.props.minHeight).toBe(tall(56))
      for (const label of ['Master session', ...LABELS]) expect(header?.text).toContain(label)
    }
    expect((await ui.find({ key: 'blocks-0' }))?.children.length).toBe(perRow)
    const texts = await textsOf(ui)
    const repos = (BOARD.repos as readonly string[]).map(shortOf).filter(name => texts.includes(name))
    const status = String(texts.find(one => /^(updated|Paused|Pausing|Resuming)/.test(String(one))) ?? '')
    const rows = headerRowsOf({ columns, repos, notice: '', status, buttons: LABELS.map((label, index) => (index === 1 && columns * CH >= 460 ? 'Ask for updates' : label)) })
    expect([columns, repos, status, (await ui.find({ key: 'header-band' }))?.props.height]).toEqual([columns, repos, status, rows])
    expect((await ui.find({ key: 'header-space' }))?.props.height).toBe(rows)
    await ui.unmount()
  }
})

test('the terminal Pause button is dim while the pause is under way', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
  on('fs.write', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.abort', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  const run = await started($, on)
  const button = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const found = await ui.find({ key: 'pause' })
    await ui.unmount()
    return found?.props.dimColor
  }
  expect(await button()).toBeUndefined()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(pane, 'hit-pause')
  await run.clock.settle()
  await pane.unmount()
  expect(await button()).toBe(true)
})
