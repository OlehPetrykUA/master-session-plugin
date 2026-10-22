import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { LH, across, down, tall } from '../lib/layout'
import { C, KINDS } from '../theme/tokens'
import { BOARD, HOME, MASTER_TITLE, PANE, SELF, WORKTREE, altsOf, buttonsOf, childOf, click, dump, hitsOf, started, textsOf, world } from '../testing/world'

test('Main: header, repos, chips with counts, 50% tiles; every card, chip and face has one press region', async ($, on) => {
  const { answer } = await started($, on)
  expect(answer).toEqual({ result: 'Board updated: 2 sessions in the pane and the band. Post only 🔴 needs-you lines in chat.' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await dump('main-desktop', ui)
  expect(await hitsOf(ui)).toEqual([
    'hit-chip-all',
    'hit-chip-needs-you',
    'hit-chip-waiting',
    'hit-chip-working',
    'hit-chip-done',
    'hit-chip-archived',
    'hit-tile-local_env',
    'hit-tile-local_setup',
    'hit-ask',
    'hit-refresh',
  ])
  expect(await buttonsOf(ui)).toEqual([])
  const region = await ui.find({ key: 'hit-tile-local_env' })
  expect(region?.props).toEqual(expect.objectContaining({ module: 'hooks/components/press.tsx', height: 7 }))
  expect(Number(region?.props.width)).toBeGreaterThan(20)
  expect((await ui.find({ key: 'hit-chip-needs-you' }))?.props).toEqual(expect.objectContaining({ height: 2 }))
  const texts = await textsOf(ui)
  for (const word of ['Master session', 'updated just now', 'Needs you', 'Test and validate local agent environment', 'needs you']) expect(texts).toContain(word)
  expect((await ui.find({ key: 'tile-local_env' }))?.props).toEqual(expect.objectContaining({ width: '50%', borderStyle: 'round' }))
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['live', 'clock', 'refresh', 'chat', 'folder', 'all', 'Needs you', 'archive', 'needs you', 'step 4 of 6', 'step 2 of 5', 'house', 'branch']))
  expect(await ui.find({ type: 'Text', text: /Someone else|parent/ })).toBeUndefined()
  await ui.unmount()
  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const other = await $.ui.mount({ ...PANE, surface })
    expect(await other.find({ key: 'tile-open-local_setup' })).toBeDefined()
    expect(await hitsOf(other)).toEqual([])
    if (surface === 'terminal') {
      await dump('main-terminal', other)
      expect(await other.find({ type: 'Text', text: /needs you ●1 50m 4\/6/ })).toBeDefined()
      expect((await other.find({ key: 'tile-open-local_env' }))?.text).toBe('Test and validate local agent environment')
    }
    await other.unmount()
  }
})

test('a press anywhere on a card expands it: down then up inside the region; a drag out is no press', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.pointer({ type: 'down', x: 3, y: 5, button: 'left', in: 'hit-tile-local_setup' })
  await ui.pointer({ type: 'up', x: 300, y: 50, button: 'left', in: 'hit-tile-local_setup' })
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await click(ui, 'hit-tile-local_setup', 20, 6)
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await ui.unmount()
})

test('Expanded: blocker first, sub-tiles in the design order, Open and Archive as equal halves', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-tile-local_env')
  await dump('expanded-needs', ui)
  const texts = await textsOf(ui)
  const at = ['Test and validate local agent environment', 'BLOCKER', 'Now', 'Next', 'Main checkout', 'Git', 'Time', 'Permission', 'Model'].map(word => texts.indexOf(word))
  expect(at.every(index => index >= 0)).toBe(true)
  expect([...at].sort((left, right) => left - right)).toEqual(at)
  for (const word of ['Approve the settings.json edit', 'branch master', 'running 50 min', 'active now', 'auto', 'opus · xhigh', 'Open chat', 'Open', 'Collapse']) expect(texts).toContain(word)
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-collapse-local_env', 'hit-chat-local_env', 'hit-open-local_env']))
  expect(await hitsOf(ui)).not.toContain('hit-archive-local_env')
  expect((await ui.find({ key: 'face-open-local_env' }))?.props).toEqual(expect.objectContaining({ width: '100%', justifyContent: 'center', height: expect.any(Number) }))
  await click(ui, 'hit-collapse-local_env')
  await click(ui, 'hit-tile-local_setup')
  await dump('expanded-worktree', ui)
  const other = await textsOf(ui)
  for (const word of ['Worktree', 'wt-toolkit-setup-ui', 'detached ＠0a4621c']) expect(other).toContain(word)
  expect(other).not.toContain('Archive…')
  expect(other).not.toContain('BLOCKER')
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-collapse-local_setup', 'hit-open-local_setup']))
  expect(await hitsOf(ui)).not.toContain('hit-archive-local_setup')
  await click(ui, 'hit-collapse-local_setup')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await ui.unmount()
})

test('Needs-you filter shows only the needs-you tile; other filters filter too', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-chip-needs-you')
  await dump('needs-filter', ui)
  expect(await ui.find({ key: 'tile-local_env' })).toBeDefined()
  expect(await ui.find({ key: 'tile-local_setup' })).toBeUndefined()
  await click(ui, 'hit-chip-done')
  expect(await ui.find({ type: 'Text', text: 'No sessions in this filter.' })).toBeDefined()
  await ui.unmount()
})

test('Archived: rows with Unarchive and Open; unarchive asks first; archive asks first', async ($, on) => {
  const { calls, toasts } = await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working' }, { ...BOARD.sessions[1], state: 'done', verified: 'tests 13/13 and a screenshot' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-tile-local_setup')
  await click(ui, 'hit-archive-local_setup')
  expect(await ui.find({ type: 'Text', text: 'Archive setup-ui-redo?' })).toBeDefined()
  await click(ui, 'hit-archive-no-local_setup')
  expect(calls.some(one => one.tool === 'archive_session')).toBe(false)
  await click(ui, 'hit-archive-local_setup')
  await click(ui, 'hit-archive-yes-local_setup')
  expect(calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)).toEqual(['local_setup'])
  expect(toasts).toEqual(['Archived setup-ui-redo.'])
  await click(ui, 'hit-chip-archived')
  await dump('archived', ui)
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-unarchive-local_old', 'hit-archived-open-local_old', 'hit-unarchive-local_setup']))
  await click(ui, 'hit-unarchive-local_old')
  expect(await ui.find({ type: 'Text', text: /Unarchive stale-removal\?/ })).toBeDefined()
  await click(ui, 'hit-unarchive-yes-local_old')
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_old'])
  expect(toasts.at(-1)).toBe('Unarchived stale-removal.')
  await ui.unmount()
})

test('archive and unarchive confirms are cards like the tiles, with design faces, 10 apart from the card above and the tiles below', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working' }, { ...BOARD.sessions[1], state: 'done', verified: 'tests 13/13 and a screenshot' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const card = { flexDirection: 'column', gap: down(8), paddingX: across(12), paddingY: down(12), borderStyle: 'round', borderColor: C.border, backgroundColor: C.surface }
  await click(ui, 'hit-tile-local_setup')
  await click(ui, 'hit-archive-local_setup')
  expect((await ui.find({ key: 'confirm-local_setup' }))?.props).toEqual(expect.objectContaining(card))
  expect((await ui.find({ key: 'detail-local_setup' }))?.props.gap).toBe(down(10))
  expect((await ui.find({ key: 'section-expanded' }))?.props.gap).toBe(down(10))
  expect((await ui.find({ key: 'section-tiles' }))?.props.gap).toBe(down(10))
  expect((await ui.find({ key: 'face-archive-yes-local_setup' }))?.props).toEqual(expect.objectContaining({ backgroundColor: KINDS.primary.bg, height: tall(36) }))
  expect((await ui.find({ key: 'face-archive-no-local_setup' }))?.props).toEqual(expect.objectContaining({ backgroundColor: KINDS.secondary.bg, borderColor: KINDS.secondary.border }))
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-archive-yes-local_setup', 'hit-archive-no-local_setup']))
  expect(await buttonsOf(ui)).toEqual([])
  await click(ui, 'hit-archive-no-local_setup')
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-unarchive-local_old')
  expect((await ui.find({ key: 'unarchive-ask-local_old' }))?.props).toEqual(expect.objectContaining(card))
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-unarchive-yes-local_old', 'hit-unarchive-no-local_old']))
  expect(await buttonsOf(ui)).toEqual([])
  await ui.unmount()
})

test('Run summary: totals, needs-you list, finished list, switch to the board', async ($, on) => {
  const done = {
    ...BOARD,
    testsPassed: 526,
    testsNote: 'smoke 398 · hooks 128',
    sessions: [
      { ...BOARD.sessions[0], state: 'needs-you' },
      { ...BOARD.sessions[1], state: 'done', progress: 'step 5 of 5 — shipped', commits: ['db8ea4d setup screen', '9f95022 token wizard'], verified: 'tests 526 passed' },
    ],
  }
  await started($, on, done)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await dump('summary', ui)
  const texts = await textsOf(ui)
  expect(texts).toContain('Run summary')
  expect(texts).not.toContain('Master session')
  expect(texts).toContain('finished 19:46')
  const at = ['Sessions', 'Commits', 'Tests passed', 'Duration', 'Needs you', 'Finished'].map(word => texts.indexOf(word))
  expect(at.every(index => index >= 0)).toBe(true)
  expect([...at].sort((left, right) => left - right)).toEqual(at)
  for (const word of ['526', '2', 'smoke 398 · hooks 128', 'Test and validate local agent environment', 'Redo toolkit setup UI']) expect(texts).toContain(word)
  expect(await hitsOf(ui)).toEqual(['hit-summary-chat-local_env', 'hit-archive-local_setup', 'hit-view-toggle', 'hit-refresh'])
  await click(ui, 'hit-archive-local_setup')
  expect(await ui.find({ type: 'Text', text: 'Archive setup-ui-redo?' })).toBeDefined()
  await click(ui, 'hit-archive-no-local_setup')
  expect(await ui.find({ key: 'chip-all' })).toBeUndefined()
  await click(ui, 'hit-view-toggle')
  expect(await ui.find({ key: 'chip-all' })).toBeDefined()
  await ui.unmount()
})

test('a worker chat shows its master board read-only, from the master’s board file', async ($, on) => {
  const run = world(on, childOf(3_000_000))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await dump('shared', ui)
  expect(await textsOf(ui)).toContain(`from ${MASTER_TITLE}`)
  expect(await hitsOf(ui)).not.toContain('hit-ask')
  await click(ui, 'hit-tile-local_setup')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-collapse-local_setup', 'hit-open-local_setup']))
  expect(await hitsOf(ui)).not.toContain('hit-archive-local_setup')
  await ui.unmount()
})

test('polls that find nothing new write no state, so a press is never cut by a redraw', async ($, on) => {
  const writes: string[] = []
  on('state.set', ($, e, next) => {
    writes.push(String(e.key))
    return next(e)
  })
  const { clock } = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(60_000)
  writes.length = 0
  await clock.advance(60_000)
  expect(writes).toEqual([])
  await click(ui, 'hit-tile-local_env')
  expect(writes).toEqual(['expanded'])
  await ui.unmount()
})

test('expanding keeps the other tile rows keyed by their first tile, not by position', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'row-local_env' })).toBeDefined()
  await click(ui, 'hit-tile-local_env')
  expect(await ui.find({ key: 'row-local_setup' })).toBeDefined()
  await ui.unmount()
})

test('Refresh always shows that it ran: a forced refresh stamps the time even when nothing changed', async ($, on) => {
  const { clock } = await started($, on)
  const before = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(5 * 60_000)
  expect(await textsOf(before)).toContain('updated just now')
  await before.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('updated 5m ago')
  await click(ui, 'hit-refresh')
  await clock.settle()
  expect(await textsOf(ui)).toContain('updated just now')
  await ui.unmount()
})

test('Ask for updates sends one envelope to each running worker and says how many it reached', async ($, on) => {
  const { calls, toasts } = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-ask')
  const sent = calls.filter(one => one.tool === 'send_message')
  expect(sent.map(one => one.args.session_id)).toEqual(['local_env'])
  expect(String(sent[0]?.args.message)).toContain('[master-session:ask]')
  expect(toasts.at(-1)).toBe('Asked 1 running worker · 1 idle skipped')
  await ui.unmount()
})

test('a working tile whose session is idle says so on its line instead of the step', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'working' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('idle')
  await ui.unmount()
})

test('one card is expanded at a time: opening a second closes the first, collapsing the open one closes it', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-tile-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  await click(ui, 'hit-tile-local_setup')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  await click(ui, 'hit-chip-waiting')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await click(ui, 'hit-chip-all')
  await click(ui, 'hit-tile-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await click(ui, 'hit-collapse-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await ui.unmount()
})

test('the expanded card shows long values in full: wrapped, never cut', async ($, on) => {
  const now = `re-running the hooks suite after the settings change ${'and checking every hook line by line '.repeat(7)}`.trim()
  const needsYou = `Approve the settings.json edit ${'so the worker can carry on with the next step '.repeat(6)}`.trim()
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], now, needsYou }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-tile-local_env')
  expect(now.length).toBeGreaterThanOrEqual(300)
  expect(needsYou.length).toBeGreaterThanOrEqual(300)
  for (const value of [now, needsYou]) {
    const found = await ui.findAll({ type: 'Text', text: value })
    expect(found.length).toBeGreaterThan(0)
    expect(found.every(one => one.props.wrap === 'wrap')).toBe(true)
  }
  expect((await textsOf(ui)).some(text => text.includes('…'))).toBe(false)
  await ui.unmount()
})

test('the header shows every button with its label at 48, 57 and 80 columns, the update time sits in the repos row, and no button draws a tooltip', async ($, on) => {
  await started($, on)
  for (const [columns, ask] of [
    [48, 'Ask'],
    [57, 'Ask for updates'],
    [80, 'Ask for updates'],
  ] as const) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: columns }, surface: 'desktop' })
    const header = await ui.find({ key: 'section-header' })
    const repos = await ui.find({ key: 'section-repos' })
    const labels = (await ui.findAll({ type: 'Text' })).map(one => one.text)
    for (const word of ['Master session', ask, 'Refresh']) expect(labels).toContain(word)
    expect(header?.text).toContain('Master session')
    expect(header?.text).toContain(ask)
    expect(header?.text).toContain('Refresh')
    expect(header?.text).not.toContain('updated')
    expect(repos?.text).toContain('updated just now')
    expect(await ui.find({ key: 'header-buttons' })).toBeUndefined()
    expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-ask', 'hit-refresh']))
    const pin = await ui.find({ key: 'header-pin' })
    expect(JSON.stringify(pin?.children)).not.toMatch(/Ask every running worker|Re-read sessions|Show the run summary|Show every session/)
    expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute' && box.props.display === 'none' && box.text !== '')).toEqual([])
    await ui.unmount()
  }
})

test('an all-done board too narrow for one row stacks its labelled buttons under the title, and shortens Ask before it stacks', async ($, on) => {
  const done = { ...BOARD, sessions: BOARD.sessions.map(one => ({ ...one, state: 'done', progress: 'step 5 of 5 — shipped' })) }
  await started($, on, done)
  const top = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 57 }, surface: 'desktop' })
  await click(top, 'hit-view-toggle')
  await top.unmount()
  for (const [columns, isStacked, ask] of [
    [48, true, 'Ask for updates'],
    [57, false, 'Ask'],
    [80, false, 'Ask for updates'],
  ] as const) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: columns }, surface: 'desktop' })
    const row = await ui.find({ key: 'header-buttons' })
    expect(row !== undefined).toBe(isStacked)
    const labels = (await ui.findAll({ type: 'Text' })).map(one => one.text)
    for (const word of ['Master session', 'Summary', ask, 'Refresh']) expect(labels).toContain(word)
    expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-view-toggle', 'hit-ask', 'hit-refresh']))
    await ui.unmount()
  }
})

test('a worker that works in a worktree shows that worktree in its place and Git cells, from its report', async ($, on) => {
  const report = { v: 1, kind: 'status', session: 'local_env', engineId: 'engine-env', parent: SELF, seq: 2, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [], git: { branch: '', dirty: 1, ahead: 0, at: 3_590_000, path: WORKTREE } }
  const { clock } = await started($, on, BOARD, { files: { [`${HOME}/.claude/state/master-session/sessions/local_env.json`]: JSON.stringify(report) } })
  await clock.advance(3_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-tile-local_env')
  const texts = await textsOf(ui)
  for (const word of ['Worktree', 'wt-toolkit-setup-ui', 'detached ＠0a4621c', '1 uncommitted']) expect(texts).toContain(word)
  expect(texts).not.toContain('Main checkout')
  await ui.unmount()
})

test('the expanded card shows the mod-band row in full at 57 columns: title, subtitle, Now and Next never end with …', async ($, on) => {
  const now = 'rebasing on 61ed9cf, band Clients'
  const next = 'segments fill width, animations, Board hidden when pane open'
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working', needsYou: undefined, progress: 'step 3 of 5 — implement band plan', now, next }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 57 }, surface: 'desktop' })
  await click(ui, 'hit-tile-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  for (const value of [now, next, 'Test and validate local agent environment', /implement band plan/]) {
    expect((await ui.findAll({ type: 'Text', text: value })).some(one => one.props.wrap === 'wrap')).toBe(true)
  }
  expect((await textsOf(ui)).some(text => text.trim().endsWith('…'))).toBe(false)
  await ui.unmount()
})

function legacyExpanded(on: Parameters<typeof started>[1], saved: unknown = 'local_env') {
  const written: unknown[] = []
  let isLegacy = true
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (isLegacy && e.key === 'expanded' ? { value: { ...real.value, value: saved } } : real) as never
  })
  on('state.set', async (_, e, next) => {
    const done = await next(e)
    if (e.key === 'expanded') {
      isLegacy = false
      written.push(e.value)
    }
    return done
  })
  return written
}

test('a legacy single-id expanded value still shows that card and collapses to an empty list', async ($, on) => {
  const written = legacyExpanded(on)
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await click(ui, 'hit-collapse-local_env')
  expect(written.at(-1)).toEqual([])
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  await ui.unmount()
})

test('a saved list from multi-expand loads as one card: only the last id stays open', async ($, on) => {
  const written = legacyExpanded(on, ['local_env', 'local_setup'])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  await click(ui, 'hit-tile-local_env')
  expect(written.at(-1)).toEqual(['local_env'])
  await ui.unmount()
})

test('a legacy single-id expanded value gives way when another card is pressed', async ($, on) => {
  const written = legacyExpanded(on)
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-tile-local_setup')
  expect(written.at(-1)).toEqual(['local_setup'])
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await ui.unmount()
})

test('the header block stays pinned at the scroll offset over the content, with its press regions inside it', async ($, on) => {
  await started($, on)
  const top = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const space = Number((await top.find({ key: 'header-space' }))?.props.height)
  expect(space).toBeGreaterThan(2)
  expect((await top.find({ key: 'header-pin' }))?.props).toEqual(expect.objectContaining({ position: 'absolute', top: 0, paddingTop: 0, height: space, backgroundColor: 'composerSidebarBackground' }))
  await top.unmount()
  const down = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 9, bodyRows: 60 } } })
  const pin = await down.find({ key: 'header-pin' })
  const inside = JSON.stringify(pin?.children)
  for (const key of ['section-header', 'hit-refresh', 'hit-ask', 'header-rule']) expect(inside).toContain(`"${key}"`)
  expect(inside).not.toContain('hit-chip-all')
  expect(inside).not.toContain('hit-tile-local_env')
  expect((await down.find({ key: 'header-space' }))?.props.height).toBe(space)
  await click(down, 'hit-refresh')
  await click(down, 'hit-tile-local_setup')
  expect(await down.find({ key: 'detail-local_setup' })).toBeDefined()
  await down.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 9, bodyRows: 60 } } })
  expect(await terminal.find({ key: 'header-pin' })).toBeUndefined()
  await terminal.unmount()
})

type Raise = { scroll: (input: unknown) => Promise<unknown> }

function aimed(on: Parameters<typeof started>[1]) {
  const landed: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    landed.push(e.offset)
    return { value: {} }
  }) as never)
  return landed
}

const scrolled = (offset: number) => ({ ...PANE, surface: 'desktop' as const, props: { ...PANE.props, scroll: { offset, bodyRows: 2 } } })

async function pluginScroll($: Engine) {
  await ($.ui as unknown as Raise).scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 2, contentRows: 400, origin: { kind: 'plugin', name: 'master-session' } })
}

async function aimAt($: Engine, to: string) {
  const answer = (await $.tool.call({ tool: 'mcp__master-session__scroll', to })) as { result?: string; deny?: string }
  await pluginScroll($)
  return Number(/\(row (\d+)\)/.exec(String(answer.result ?? answer.deny))?.[1] ?? -1)
}

const liftOn = async (ui: { find: (query: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }) => Number((await ui.find({ key: 'header-pin' }))?.props.paddingTop) * (LH / 2)

test('the pinned header lands on the same pixel row at start, at an aimed row in long content, and at a measurable end', async ($, on) => {
  aimed(on)
  await started($, on)
  const start = await $.ui.mount(scrolled(0))
  await click(start, 'hit-tile-local_env')
  expect(await liftOn(start)).toBe(0)
  const row = await aimAt($, 'section-tiles')
  expect(row).toBeGreaterThan(0)
  await start.unmount()
  const mid = await $.ui.mount(scrolled(row))
  expect(Math.abs((await liftOn(mid)) - row * LH)).toBeLessThan(0.1)
  await click(mid, 'hit-collapse-local_env')
  await mid.unmount()
  const ends: number[] = []
  for (const offset of [40, 60]) {
    const end = await $.ui.mount(scrolled(offset))
    ends.push(await liftOn(end))
    await end.unmount()
  }
  expect(ends[0]).toBe(ends[1])
  expect(Number(ends[0])).toBeLessThan(39.5 * LH)
})

test('a hand-scrolled offset never pushes the header down: the pin sits on or above the window top for any scroll that rounds to it', async ($, on) => {
  await started($, on)
  for (const isExpanded of [false, true]) {
    if (isExpanded) {
      const top = await $.ui.mount(scrolled(0))
      await click(top, 'hit-tile-local_env')
      await top.unmount()
    }
    for (const offset of [1, 9, ...(isExpanded ? [30] : [])]) {
      const ui = await $.ui.mount(scrolled(offset))
      const lift = await liftOn(ui)
      const lowest = (offset - 0.5) * LH
      expect(lift).toBeLessThanOrEqual(lowest + 0.1)
      expect(lowest + LH - lift).toBeLessThanOrEqual(LH + 0.1)
      await ui.unmount()
    }
  }
})

test('the live end repro: offset 85, bodyRows 50, contentRows 135 with a card open keeps the lift at or under the real max scroll', async ($, on) => {
  aimed(on)
  await started($, on)
  const top = await $.ui.mount(scrolled(0))
  await click(top, 'hit-tile-local_env')
  await top.unmount()
  await ($.ui as unknown as Raise).scroll({ component: 'Pane', requestId: 'master-session', offset: 85, by: 85, bodyRows: 50, contentRows: 135, origin: { kind: 'plugin', name: 'master-session' } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 85, bodyRows: 50 } } })
  const lift = await liftOn(ui)
  expect(lift).toBeLessThanOrEqual((85 - 0.5) * LH + 0.1)
  expect(lift).toBeLessThanOrEqual((135 - 50) * LH)
  await ui.unmount()
})

test('collapsing a card at a large offset clamps the pin to the new end and moves the window there', async ($, on) => {
  const landed = aimed(on)
  await started($, on)
  const top = await $.ui.mount(scrolled(0))
  await click(top, 'hit-tile-local_env')
  await top.unmount()
  const ui = await $.ui.mount(scrolled(30))
  expect(Math.abs((await liftOn(ui)) - 29.5 * LH)).toBeLessThan(0.1)
  await click(ui, 'hit-collapse-local_env')
  const end = await liftOn(ui)
  expect(end).toBeLessThan(29.5 * LH)
  await pluginScroll($)
  expect(landed).toContain(Math.round(end / LH))
  await ui.unmount()
})

test('a filter change while scrolled clamps the pin to the new end and moves the window there', async ($, on) => {
  const landed = aimed(on)
  await started($, on)
  const top = await $.ui.mount(scrolled(0))
  await click(top, 'hit-tile-local_setup')
  await top.unmount()
  const ui = await $.ui.mount(scrolled(30))
  expect(Math.abs((await liftOn(ui)) - 29.5 * LH)).toBeLessThan(0.1)
  await click(ui, 'hit-chip-needs-you')
  const end = await liftOn(ui)
  expect(end).toBeLessThan(29.5 * LH)
  await pluginScroll($)
  expect(landed).toContain(Math.round(end / LH))
  await ui.unmount()
})

test('the pane clips its pinned header, so the pin can never stretch the scroll range', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount(scrolled(40))
  const root = (await ui.findAll({ type: 'Box' }))[0]
  expect(root?.props).toEqual(expect.objectContaining({ flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }))
  await ui.unmount()
})
