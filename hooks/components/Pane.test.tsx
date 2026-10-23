import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { COLUMN, LH, across, tall } from '../lib/layout'
import { C, KINDS } from '../theme/tokens'
import { BOARD, HOME, MASTER_TITLE, PANE, SELF, SPAWN, WORKTREE, altsOf, buttonsOf, childOf, click, dump, hitsOf, started, textsOf, warmUp, world } from '../testing/world'

warmUp()

test('v2 one list: header, repos, summary blocks, chips, groups with Needs you pinned first, kind labels, and one press region per row, chip and button', async ($, on) => {
  const { answer } = await started($, on)
  expect(answer).toEqual({ result: 'Board updated: 2 sessions in the pane and the band. Post only 🔴 needs-you lines in chat.' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await dump('main-desktop', ui)
  expect(await hitsOf(ui)).toEqual([
    'hit-chip-all',
    'hit-chip-needs-you',
    'hit-chip-working',
    'hit-chip-waiting',
    'hit-chip-done',
    'hit-chip-archived',
    'hit-row-local_env',
    'hit-chat-local_env',
    'hit-row-local_setup',
    'hit-archived-show',
    'hit-ask',
    'hit-refresh',
  ])
  expect(await buttonsOf(ui)).toEqual([])
  const texts = await textsOf(ui)
  const order = ['Sessions', 'Needs you', 'Subagents', 'Workflows', 'Commits', 'Tests', 'Duration', 'Git', 'Needs you', 'Working', 'Waiting', 'Done', 'Archived', 'Master session', 'updated just now', 'Ask for updates', 'Refresh', 'Repos']
  let from = -1
  for (const word of order) {
    const at = texts.indexOf(word, from + 1)
    expect(at).toBeGreaterThan(from)
    from = at
  }
  for (const word of ['1 session', 'none', '—', 'Session', 'Approve the settings.json edit', 'Redo toolkit setup UI', 'waiting', 'waiting for the go', '50m']) expect(texts).toContain(word)
  expect(texts.some(text => /^since \d\d:\d\d$/.test(text))).toBe(true)
  expect((await ui.find({ key: 'block-needs-you' }))?.props).toEqual(expect.objectContaining({ backgroundColor: C.redTint, borderColor: C.red, borderStyle: 'round' }))
  expect((await ui.find({ key: 'row-local_env' }))?.props).toEqual(expect.objectContaining({ borderColor: C.red, minHeight: tall(56), paddingLeft: across(12), paddingRight: across(4), gap: across(12) }))
  expect((await ui.find({ key: 'row-local_setup' }))?.props).toEqual(expect.objectContaining({ borderColor: C.border, backgroundColor: C.surface, borderStyle: 'round' }))
  expect((await ui.find({ key: 'face-chat-local_env' }))?.props).toEqual(expect.objectContaining({ height: tall(32) }))
  const faces = async (alt: string) => (await ui.findAll({ type: 'Svg' })).filter(one => one.props.alt === alt).map(one => String(one.props.source))
  const [chat, chatHot] = await faces('Open chat')
  expect(chat).toMatch(/--accentBtn:#B85335.*prefers-color-scheme: dark.*--accentBtn:#D97757.*fill:var\(--accentBtn\)/)
  expect(chatHot).toContain('fill:var(--accentBtnHover)')
  expect((await ui.find({ key: 'chip-all' }))?.props).toEqual(expect.objectContaining({ height: tall(32) }))
  expect((await faces('All 2'))[0]).toMatch(/fill:var\(--accentTint\);stroke:var\(--accentBtn\).*fill:var\(--accentText\)/)
  expect((await faces('All 2'))[1]).toContain('fill:var(--accentTint2)')
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['All 2', 'Open chat']))
  const groups = (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('group-head-') ? [box.key] : []))
  expect(groups).toEqual(['group-head-needs-you', 'group-head-waiting', 'group-head-archived'])
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['live', 'needs you', 'waiting', '2 of 5', '1 uncommitted', 'worktree']))
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  await ui.unmount()
  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const other = await $.ui.mount({ ...PANE, surface })
    expect(await other.find({ key: 'row-open-local_setup' })).toBeDefined()
    expect(await hitsOf(other)).toEqual([])
    if (surface === 'terminal') {
      await dump('main-terminal', other)
      const lines = await textsOf(other)
      expect(lines).toEqual(expect.arrayContaining(['Needs you 1', 'Waiting 1', 'Archived 1', 'Approve the settings.json edit', 'waiting · waiting for the go · 50m · 2/5']))
      expect(lines.some(line => line.startsWith('Sessions 2 (0 / 1 / 0) · Needs you 1 1 session'))).toBe(true)
      expect((await other.find({ key: 'row-open-local_env' }))?.text).toBe('Session · Test and validate local agent environment')
    }
    await other.unmount()
  }
})

test('a press anywhere on a row expands it: down then up inside the region; a drag out is no press', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.pointer({ type: 'down', x: 3, y: 5, button: 'left', in: 'hit-row-local_setup' })
  await ui.pointer({ type: 'up', x: 300, y: 50, button: 'left', in: 'hit-row-local_setup' })
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await click(ui, 'hit-row-local_setup', 20, 2)
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await ui.unmount()
})

test('Needs you stays pinned above any other filter with its note; a filter shows only its own group; an empty filter shows the dashed box with Show all', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-chip-waiting')
  await dump('needs-filter', ui)
  const heads = async () => (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('group-head-') ? [box.key] : []))
  expect(await heads()).toEqual(['group-head-needs-you', 'group-head-waiting'])
  expect(await textsOf(ui)).toContain('pinned on every filter')
  await click(ui, 'hit-chip-needs-you')
  expect(await heads()).toEqual(['group-head-needs-you'])
  expect(await textsOf(ui)).not.toContain('pinned on every filter')
  await click(ui, 'hit-chip-done')
  expect(await heads()).toEqual(['group-head-needs-you'])
  expect((await ui.find({ key: 'empty-group-done' }))?.props).toEqual(expect.objectContaining({ borderStyle: 'dashed', borderColor: C.borderStrong, alignItems: 'center' }))
  expect(await textsOf(ui)).toContain('Nothing done yet')
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['Show all', 'Done 0']))
  expect((await ui.findAll({ type: 'Svg' })).filter(one => one.props.alt === 'Show all').map(one => String(one.props.source))).toEqual([expect.stringContaining('fill:var(--accentText)'), expect.stringContaining('text-decoration:underline')])
  await click(ui, 'hit-show-all-group-done')
  expect(await heads()).toEqual(['group-head-needs-you', 'group-head-waiting', 'group-head-archived'])
  await ui.unmount()
})

test('subagents and workflows are rows with their kind and the same groups: running ones under Working, finished ones under Done; workflow agents never get rows', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: e.workflow ? `w${e.workflow.agentIndex}` : e.description }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Workflow' }, () => ({ result: { status: 'async_launched' as const, taskId: 'wi5', runId: 'wf_7', workflowName: 'review-changes', summary: 'Review the branch' }, text: 'launched' }))
  await started($, on)
  await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'review-changes', phases: [{ title: 'Review' }, { title: 'Verify' }] }" })
  await $.agent.spawn({ ...SPAWN, description: 'review:bugs', subagentType: 'workflow-subagent', model: 'haiku', background: false, workflow: { runId: 'wf_7', agentIndex: 1 } })
  await $.agent.spawn({ ...SPAWN, description: 'verify:band.ts', subagentType: 'workflow-subagent', model: 'haiku', background: false, workflow: { runId: 'wf_7', agentIndex: 2 } })
  await $.agent.spawn({ ...SPAWN, name: undefined, description: 'Review auth flow', subagentType: 'Explore', model: 'haiku' })
  await $.agent.spawn({ ...SPAWN, name: 'token-finder', description: 'Find token usages', subagentType: 'master-session:researcher', model: 'sonnet' })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 'u1', agentId: 'w1', reason: 'answer' })
  await $.turn.complete({ answer: 'found', durationMs: 5, isAborted: false, turnId: 'u2', agentId: 'Find token usages', reason: 'answer' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await dump('agents-desktop', ui)
  const texts = await textsOf(ui)
  for (const word of ['Workflow', 'review-changes', 'verify:band.ts', 'Explore', 'Review auth flow', 'Researcher', 'token-finder', 'Validator ›', 'running', 'done']) expect(texts).toContain(word)
  for (const word of ['review:bugs', 'workflow-subagent', 'master-session:researcher', 'haiku', 'sonnet']) expect(texts).not.toContain(word)
  const heads = (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('group-head-') ? [box.key] : []))
  expect(heads).toEqual(['group-head-needs-you', 'group-head-working', 'group-head-waiting', 'group-head-done', 'group-head-archived'])
  expect((await hitsOf(ui)).filter(hit => hit.startsWith('hit-row-'))).toEqual(['hit-row-local_env', 'hit-row-wf_7', 'hit-row-Review auth flow', 'hit-row-local_setup', 'hit-row-Find token usages'])
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['Workflow', 'Subagent', 'Session', '1 of 2', 'working', 'done']))
  expect((await ui.find({ key: 'block-subagents' }))?.text).toContain('1 running')
  expect((await ui.find({ key: 'block-workflows' }))?.text).toContain('1/2 agents')
  expect(await altsOf(ui)).toContain('All 5')
  await ui.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textsOf(terminal)).toEqual(expect.arrayContaining(['Working 2', 'verify:band.ts · 0s · 1/2', 'Validator › running · 0s', 'Done 1', 'Validator › done · found · 0s']))
  await terminal.unmount()
})

test('Archived is the last group, closed with Show; open it lists two rows, Hide and Show N more; the Archived chip lists them all', async ($, on) => {
  const sessions = ['a', 'b', 'c', 'd'].map(id => ({ sessionId: `local_${id}`, name: `old-${id}`, title: `Old ${id}`, cwd: '/', isRunning: false, isArchived: true, lastActivityAt: '1970-01-01T00:00:00.000Z', startedBy: SELF }))
  await started($, on, BOARD, { sessions })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'archived-local_a' })).toBeUndefined()
  await click(ui, 'hit-archived-show')
  await dump('archived', ui)
  const rows = async () => (await ui.findAll({ type: 'Box' })).flatMap(box => (/^(row|detail)-local_(old|[abcd])$/.test(box.key ?? '') ? [box.key] : []))
  expect((await rows()).length).toBe(2)
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Hide', 'archived 1h ago', 'worktree removed', 'Session', 'Old a']))
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['Show 3 more', 'archived 1h ago', 'expand']))
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-archived-hide', 'hit-archived-more', 'hit-row-local_old', 'hit-row-local_a']))
  await click(ui, 'hit-archived-more')
  expect((await rows()).length).toBe(5)
  await click(ui, 'hit-archived-hide')
  expect((await rows()).length).toBe(0)
  await click(ui, 'hit-chip-archived')
  expect((await rows()).length).toBe(5)
  expect(await hitsOf(ui)).not.toContain('hit-archived-hide')
  await click(ui, 'hit-row-local_a')
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-top-local_a', 'hit-archived-open-local_a', 'hit-unarchive-local_a']))
  await click(ui, 'hit-unarchive-local_a')
  expect(await ui.find({ type: 'Text', text: /Unarchive Old a\?/ })).toBeDefined()
  await ui.unmount()
})

test('all done stays the one list: finished header line, every row under Done with Archive all…, no summary mode', async ($, on) => {
  const done = { ...BOARD, testsPassed: 526, testsNote: 'smoke 398 · hooks 128', sessions: BOARD.sessions.map(one => ({ ...one, state: 'done', needsYou: undefined, progress: 'step 5 of 5 — shipped', verified: 'tests 526 passed' })) }
  await started($, on, done)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } })
  await dump('summary', ui)
  const texts = await textsOf(ui)
  expect(texts).toContain('finished 19:46')
  expect(texts).not.toContain('Run summary')
  expect(texts).toEqual(expect.arrayContaining(['smoke 398 · hooks 128', 'Done', 'verified', 'tests 526 passed']))
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['Tests 526', 'Sessions 2', 'Needs you 0']))
  const heads = (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('group-head-') ? [box.key] : []))
  expect(heads).toEqual(['group-head-done', 'group-head-archived'])
  expect((await ui.find({ key: 'block-needs-you' }))?.props.backgroundColor).toBe(C.surface)
  await ui.unmount()
})

test('the header: 56 tall, title and live dot over the status line, Ask and Refresh ghost 32; Ask reads Ask for updates from 460 px; narrow panes move the buttons to a second row', async ($, on) => {
  await started($, on)
  for (const [columns, ask, isNarrow] of [
    [40, 'Ask', true],
    [48, 'Ask', false],
    [56, 'Ask for updates', false],
    [80, 'Ask for updates', false],
  ] as const) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: columns }, surface: 'desktop' })
    expect(columns * COLUMN >= 460).toBe(ask === 'Ask for updates')
    const header = await ui.find({ key: 'section-header' })
    for (const word of ['Master session', 'updated just now', ask, 'Refresh']) expect(header?.text).toContain(word)
    expect(await ui.find({ key: 'header-buttons' }) !== undefined).toBe(isNarrow)
    expect(header?.props.minHeight).toBe(isNarrow ? undefined : tall(56))
    expect((await ui.find({ key: 'face-refresh' }))?.props).toEqual(expect.objectContaining({ height: tall(32), borderColor: KINDS.ghost.border }))
    expect((await ui.find({ key: 'face-refresh' }))?.props.backgroundColor).toBeUndefined()
    expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-ask', 'hit-refresh']))
    expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute' && box.props.display === 'none' && box.text !== '')).toEqual([])
    if (isNarrow) {
      expect(await ui.find({ key: 'row-local_setup-meta' })).toBeUndefined()
      expect(await textsOf(ui)).toEqual(expect.arrayContaining(['waiting for the go', '50m']))
      expect((await ui.find({ key: 'row-local_setup-elapsed-narrow' }))?.props.flexShrink).toBe(0)
      expect(await altsOf(ui)).toContain('2 of 5')
      expect((await ui.find({ key: 'face-chat-local_env' }))?.props.width).toBe(across(32))
      expect((await ui.find({ key: 'blocks-0' }))?.children.length).toBe(3)
    }
    await ui.unmount()
  }
})

test('header states: offline turns the dot and line amber with a notice under the repos; Asked replaces Ask until a worker answers', async ($, on) => {
  let failure: string | undefined
  const { clock } = await started($, on, BOARD, { listError: () => failure })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-ask')
  await dump('header-asked', ui)
  expect((await ui.find({ key: 'section-header' }))?.text).toContain('Asked')
  expect(await textsOf(ui)).toContain('asked 1 worker · just now')
  await ui.unmount()
  failure = 'board.json not found'
  await clock.advance(15_000)
  const offline = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await dump('header-offline', offline)
  expect(await textsOf(offline)).toEqual(expect.arrayContaining(['live data unavailable', 'Can’t read sessions: board.json not found']))
  expect((await offline.find({ key: 'notice' }))?.props).toEqual(expect.objectContaining({ backgroundColor: C.amberTint }))
  expect(await altsOf(offline)).toContain('live data unavailable')
  await offline.unmount()
})

test('Archived: the card offers Open and Unarchive; unarchive asks inside the card in place of its buttons', async ($, on) => {
  const { calls, toasts } = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-row-local_old')
  await dump('archived', ui)
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-unarchive-local_old', 'hit-archived-open-local_old']))
  await click(ui, 'hit-unarchive-local_old')
  expect(await ui.find({ type: 'Text', text: /Unarchive Remove the stale mod\?/ })).toBeDefined()
  expect(await hitsOf(ui)).not.toContain('hit-archived-open-local_old')
  await click(ui, 'hit-unarchive-yes-local_old')
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_old'])
  expect(toasts.at(-1)).toBe('Unarchived stale-removal.')
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
  await click(ui, 'hit-row-local_setup')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-top-local_setup', 'hit-open-local_setup']))
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
  await click(ui, 'hit-row-local_env')
  expect(writes).toEqual(['expanded'])
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

test('a working row whose session is idle says so on its line instead of the step', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'working' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).toContain('idle')
  await ui.unmount()
})

test('one card is expanded at a time: opening a second closes the first, collapsing the open one closes it', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  await click(ui, 'hit-row-local_setup')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  await click(ui, 'hit-chip-waiting')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await click(ui, 'hit-chip-all')
  await click(ui, 'hit-row-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await click(ui, 'hit-top-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeUndefined()
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await ui.unmount()
})

test('the expanded card shows Now in full, and the row clamps a long question to two lines with an ellipsis', async ($, on) => {
  const now = `re-running the hooks suite after the settings change ${'and checking every hook line by line '.repeat(7)}`.trim()
  const needsYou = `Approve the settings.json edit ${'so the worker can carry on with the next step '.repeat(6)}`.trim()
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], now, needsYou }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  expect(now.length).toBeGreaterThanOrEqual(300)
  expect(needsYou.length).toBeGreaterThanOrEqual(300)
  const full = await ui.findAll({ type: 'Text', text: now })
  expect(full.length).toBeGreaterThan(0)
  expect(full.every(one => one.props.wrap === 'wrap')).toBe(true)
  expect(await ui.findAll({ type: 'Text', text: needsYou })).toEqual([])
  const asked = (await ui.find({ key: 'top-local_env-ask-rows' }))?.children ?? []
  expect(asked.length).toBe(2)
  expect(JSON.stringify(asked)).toContain('Approve the settings.json edit')
  expect((await textsOf(ui)).some(text => text.startsWith('so the worker') || text.endsWith('…'))).toBe(true)
  await ui.unmount()
})

test('a worker that works in a worktree shows that worktree in its place and Git cells, from its report', async ($, on) => {
  const report = { v: 1, kind: 'status', session: 'local_env', engineId: 'engine-env', parent: SELF, seq: 2, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [], commits: [], tests: [], files: [], git: { branch: '', dirty: 1, ahead: 0, at: 3_590_000, path: WORKTREE } }
  const { clock } = await started($, on, BOARD, { files: { [`${HOME}/.claude/state/master-session/sessions/local_env.json`]: JSON.stringify(report) } })
  await clock.advance(3_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  const texts = await textsOf(ui)
  for (const word of ['Worktree', 'wt-toolkit-setup-ui', 'detached ＠0a4621c', '1 uncommitted']) expect(texts).toContain(word)
  expect(texts).not.toContain('Main checkout')
  await ui.unmount()
})

test('the expanded card keeps the row on top and shows Now and Next in full at 57 columns, never ending with …', async ($, on) => {
  const now = 'rebasing on 61ed9cf, band Clients'
  const next = 'segments fill width, animations, Board hidden when pane open'
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], state: 'working', needsYou: undefined, progress: 'step 3 of 5 — implement band plan', now, next }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 57 }, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  expect(await ui.find({ key: 'detail-local_env' })).toBeDefined()
  expect((await ui.find({ key: 'top-local_env' }))?.text).toContain('Test and validate local agent environment')
  for (const value of [now, next]) {
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
  await click(ui, 'hit-top-local_env')
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
  await click(ui, 'hit-row-local_env')
  expect(written.at(-1)).toEqual(['local_env'])
  await ui.unmount()
})

test('a legacy single-id expanded value gives way when another card is pressed', async ($, on) => {
  const written = legacyExpanded(on)
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
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
  expect((await top.find({ key: 'header-pin' }))?.props).toEqual(expect.objectContaining({ position: 'absolute', top: 0, paddingTop: 0, height: space }))
  expect((await top.find({ key: 'header-pin' }))?.props.backgroundColor).toBeUndefined()
  expect((await top.find({ key: 'header-band' }))?.props).toEqual(expect.objectContaining({ height: space, backgroundColor: 'composerSidebarBackground' }))
  await top.unmount()
  const down = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 9, bodyRows: 60 } } })
  const pin = await down.find({ key: 'header-pin' })
  const inside = JSON.stringify(pin?.children)
  for (const key of ['section-header', 'hit-refresh', 'hit-ask', 'header-rule']) expect(inside).toContain(`"${key}"`)
  expect(inside).not.toContain('hit-chip-all')
  expect(inside).not.toContain('hit-row-local_env')
  expect((await down.find({ key: 'header-space' }))?.props.height).toBe(space)
  await click(down, 'hit-refresh')
  await click(down, 'hit-row-local_setup')
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
  await click(start, 'hit-row-local_env')
  expect(await liftOn(start)).toBe(0)
  const row = await aimAt($, 'section-list')
  expect(row).toBeGreaterThan(0)
  await start.unmount()
  const mid = await $.ui.mount(scrolled(row))
  expect(Math.abs((await liftOn(mid)) - row * LH)).toBeLessThan(0.1)
  await click(mid, 'hit-top-local_env')
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
      await click(top, 'hit-row-local_env')
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
  await click(top, 'hit-row-local_env')
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
  await click(top, 'hit-row-local_env')
  await top.unmount()
  const ui = await $.ui.mount(scrolled(40))
  expect(Math.abs((await liftOn(ui)) - 39.5 * LH)).toBeLessThan(0.1)
  await click(ui, 'hit-top-local_env')
  const end = await liftOn(ui)
  expect(end).toBeLessThan(39.5 * LH)
  await pluginScroll($)
  expect(landed).toContain(Math.round(end / LH))
  await ui.unmount()
})

test('a filter change while scrolled clamps the pin to the new end and moves the window there', async ($, on) => {
  const landed = aimed(on)
  await started($, on)
  const top = await $.ui.mount(scrolled(0))
  await click(top, 'hit-row-local_setup')
  await top.unmount()
  const ui = await $.ui.mount(scrolled(40))
  expect(Math.abs((await liftOn(ui)) - 39.5 * LH)).toBeLessThan(0.1)
  await click(ui, 'hit-chip-needs-you')
  const end = await liftOn(ui)
  expect(end).toBeLessThan(39.5 * LH)
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
