import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord } from '../../../types'

import { across, tall } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import { phaseStrip } from '../../theme/detail'
import { C } from '../../theme/tokens'
import { BOARD, PANE, altsOf, click, hitsOf, started, textsOf, warmUp } from '../../testing/world'

const NOW = 3_600_000

const ASK = { text: 'Allow Bash: rm -rf dist?', since: NOW - 10_000 }

function seeded(on: On, agents: AgentRecord[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const agent = (id: string, more: Partial<AgentRecord>): AgentRecord => ({ id, type: 'master-session:reviewer', description: `review ${id}`, prompt: 'Run the gate.', state: 'running', startedAt: NOW - 60_000, ...more })

warmUp()

test('a subagent waiting on a prompt in a worker chat: a red row with its parent and question, Open chat opens that worker, its card says where the prompt waits', async ($, on) => {
  seeded(on, [agent('a1', { asking: ASK, parentSessionId: 'local_setup' })])
  const { calls } = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'row-a1' }))?.props.borderColor).toBe(C.red)
  const texts = await textsOf(ui)
  for (const word of ['Reviewer', 'review a1', 'Session ›', 'Allow Bash: rm -rf dist?']) expect(texts).toContain(word)
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['Subagent', 'needs you', 'Open chat']))
  await click(ui, 'hit-chat-a1')
  expect(calls.filter(one => one.tool === 'open_session_in').map(one => one.args.session_id)).toEqual(['local_setup'])
  await click(ui, 'hit-row-a1')
  const card = await textsOf(ui)
  for (const word of ['PERMISSION', 'asked 10s ago · the prompt waits in Session · Redo toolkit setup UI’s chat', 'Task', 'Run the gate.', 'Started by', 'Redo toolkit setup UI']) expect(card.some(text => text.includes(word))).toBe(true)
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-top-a1', 'hit-chat-a1']))
  expect(await hitsOf(ui)).not.toContain('hit-parent-chat-a1')
  await ui.unmount()
})

test('a subagent of the Validator has no Open chat: the row shows its time and expands, and the card says to answer here', async ($, on) => {
  seeded(on, [agent('a2', { asking: ASK })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await hitsOf(ui)).not.toContain('hit-chat-a2')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Validator ›', 'Allow Bash: rm -rf dist?', '1m']))
  await click(ui, 'hit-row-a2')
  const card = await textsOf(ui)
  for (const word of ['The prompt is in this chat: answer it here.', 'asked 10s ago · the prompt waits in this chat', 'Validator']) expect(card).toContain(word)
  await ui.unmount()
})

test('a nested subagent names its immediate parent and folds the earlier ones; a finished subagent of a worker offers Open <persona> chat in its card', async ($, on) => {
  seeded(on, [
    agent('p1', { type: 'master-session:qa-verifier', description: 'verify a38c72e', parentSessionId: 'local_setup' }),
    agent('k1', { description: 'review a38c72e', parentAgentId: 'p1', asking: ASK }),
    agent('d1', { type: 'master-session:researcher', description: 'find usages', state: 'done', endedAt: NOW - 1_000, result: 'found 3', parentSessionId: 'local_setup' }),
  ])
  const { calls } = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui)
  for (const word of ['QA verifier', 'Session ›', 'waiting', 'on Reviewer · review a38c72e', '… › QA verifier ›', 'Researcher', 'found 3']) expect(texts).toContain(word)
  expect(await hitsOf(ui)).toContain('hit-chat-k1')
  await click(ui, 'hit-row-d1')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Result', 'found 3', 'Session', 'Redo toolkit setup UI']))
  await click(ui, 'hit-parent-chat-d1')
  expect(calls.filter(one => one.tool === 'open_session_in').map(one => one.args.session_id)).toEqual(['local_setup'])
  await ui.unmount()
})

test('a done session with a ready sha reads ready for verify on its row and leads its card with the Ready callout', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done', sha: '4e431f7', tests: ['tsc', 'plugin test'] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await altsOf(ui)).toContain('ready for verify')
  await click(ui, 'hit-row-local_setup')
  const texts = await textsOf(ui)
  for (const word of ['READY FOR VERIFY', 'gate: tsc, plugin test']) expect(texts).toContain(word)
  expect(texts.some(text => text.startsWith('ready 4e431f7'))).toBe(true)
  await ui.unmount()
})

test('an archived card shows Last, Time, Worktree, Git and Model, then Open and Unarchive; the confirm takes the buttons’ place', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-row-local_old')
  const texts = await textsOf(ui)
  for (const word of ['Last', 'Time', 'Worktree', 'Git', 'Model', 'dotfiles', 'Open', 'Unarchive', 'Remove the stale mod', 'archived 10m ago', 'worktree removed', 'ran 40m', 'opus · xhigh']) expect(texts).toContain(word)
  expect(texts).not.toContain('removed at archive; made again on its next turn')
  expect(texts.some(text => /^archived \d\d:\d\d$/.test(text))).toBe(true)
  expect(texts.some(text => /^last turn /.test(text))).toBe(true)
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['archived 10m ago', 'collapse']))
  await click(ui, 'hit-unarchive-local_old')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Unarchive Remove the stale mod?', 'It comes back in its group with its chat. Its worktree is made again on its next turn.', 'Cancel']))
  expect(await hitsOf(ui)).not.toContain('hit-unarchive-local_old')
  await click(ui, 'hit-unarchive-no-local_old')
  expect(await hitsOf(ui)).toContain('hit-unarchive-local_old')
  await ui.unmount()
})

test('a finished run’s strip greys its done share and keeps failures red; a run waiting on an answer greys done and reds the asking share; a running run fills green', () => {
  const finished = phaseStrip(300, [{ done: 5, running: 0, failed: 1, asking: 0, total: 6, isFinished: true }])
  expect(finished).toContain('fill:var(--grey)')
  expect(finished).toContain('fill:var(--red)')
  expect(finished).not.toContain('fill:var(--green)')
  expect(phaseStrip(300, [{ done: 1, running: 1, failed: 0, asking: 0, total: 3, isFinished: false }])).toContain('fill:var(--green)')
  const asking = phaseStrip(300, [{ done: 1, running: 2, failed: 0, asking: 1, total: 3, isFinished: false }])
  expect(asking).toContain('fill:var(--grey)')
  expect(asking).toContain('fill:var(--red)')
  expect(asking).not.toContain('fill:var(--green)')
})

test('every row ends in a chevron: expand while closed, collapse on the card top; the summary needs block reds only its border, tint and glyph; the active chip is semibold', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const inside = async (key: string) => JSON.stringify((await ui.find({ key }))?.children ?? null)
  expect((await ui.find({ key: 'row-local_setup-chevron' }))?.props).toEqual(expect.objectContaining({ width: across(14), flexShrink: 0 }))
  expect(await inside('row-local_setup-chevron')).toContain('"alt":"expand"')
  expect(await inside('row-local_setup-chevron')).toContain('M6 9l6 6 6-6')
  expect(await inside('row-local_setup-chevron')).toContain('stroke:var(--muted);stroke-width:2;')
  expect(await inside('row-local_env-chevron')).toContain('"alt":"expand"')
  const needs = await ui.find({ key: 'block-needs-you' })
  expect(needs?.props).toEqual(expect.objectContaining({ borderColor: C.red, backgroundColor: C.redTint }))
  expect(await inside('block-needs-you')).toContain('"alt":"needs"')
  expect(await inside('block-needs-you')).toContain('stroke:var(--red);stroke-width:2.2;')
  for (const text of ['Needs you', '1 session']) expect((await ui.findAll({ type: 'Text', text })).every(one => one.props.color !== C.red)).toBe(true)
  expect(String((await ui.findAll({ type: 'Svg' })).find(one => one.props.alt === 'Needs you 1')?.props.source)).not.toContain('var(--red)')
  await click(ui, 'hit-row-local_setup')
  expect(await inside('top-local_setup-chevron')).toContain('"alt":"collapse"')
  expect(await inside('top-local_setup-chevron')).toContain('M6 15l6-6 6 6')
  expect(await inside('top-local_setup-chevron')).toContain('stroke:var(--muted);stroke-width:2;')
  await ui.unmount()
  const plain = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const all = await plain.findAll({ type: 'Text', text: 'All' })
  expect(all.length).toBeGreaterThan(0)
  expect(all.every(one => one.props.weight === 'semibold')).toBe(true)
  await plain.unmount()
})

test('an open archived card or workflow agent card counts as expanded, so the pane can scroll to its end', async ($, on) => {
  seeded(on, [{ id: 'w1', type: 'workflow-subagent', description: 'review:bugs', state: 'running', startedAt: NOW - 30_000, run: { id: 'wf_1', index: 1 } }])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const drawn = async () => String(((await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-expanded' })) as { deny?: string }).deny ?? '')
  expect(await drawn()).toContain('section-expanded is not drawn')
  await click(ui, 'hit-row-wf_1')
  await click(ui, 'hit-row-w1')
  expect(await ui.find({ key: 'detail-w1' })).toBeDefined()
  expect(await drawn()).not.toContain('is not drawn')
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-row-local_old')
  expect(await ui.find({ key: 'detail-local_old' })).toBeDefined()
  expect(await drawn()).not.toContain('is not drawn')
  await ui.unmount()
})

test('long multi-line tests and activity draw as one truncated line each: tests dedupe into one row of chips with +N more, nothing spills into the next item', async ($, on) => {
  const script = 'cd "$HOME/.claude/worktrees/wt-x"\nL=$(mktemp)\ntsc -p . --noEmit > "$L" 2>&1\necho "tsc exit $?"\ncat "$L"\nrm "$L"'
  const tests = ['tsc · passed', 'persona.test · exit 0', 'persona.test · exit 0', 'plugin test · passed · 212 pass', 'one', 'two', script]
  const activity = [`Bash ${script} · 2m`, 'Read hooks/lib/band.ts · 1m']
  const path = 'hooks/lib/\nband.ts'
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], tests, activity, commits: [`abc1234 ${script}`], files: [path] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  const flat = script.replace(/\s+/g, ' ')
  const keys = (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('test-local_setup-') ? [box.key] : []))
  const texts = await textsOf(ui)
  const more = texts.find(text => /^\+\d+ more$/.test(text))
  expect(keys.length + Number(more?.slice(1).split(' ')[0] ?? 0)).toBe(6)
  expect(texts.filter(text => text === 'persona.test · exit 0').length).toBeLessThanOrEqual(1)
  expect((await ui.find({ key: 'tests-pills-local_setup' }))?.props).toEqual(expect.objectContaining({ height: tall(24) }))
  expect((await ui.find({ key: 'tests-pills-local_setup' }))?.props.flexWrap).toBeUndefined()
  expect(texts.some(text => text.includes('\n'))).toBe(false)
  const lines = (await ui.findAll({ type: 'Text' })).filter(one => String(one.text ?? '').includes('mktemp') && one.props.wrap !== undefined)
  expect(lines.length).toBe(2)
  expect(lines.every(one => one.props.wrap === 'truncate-end')).toBe(true)
  expect((await ui.find({ key: 'commit-local_setup-0' }))?.props.minWidth).toBe(0)
  const file = (await ui.findAll({ type: 'Text' })).find(one => one.text === oneLine(path))
  expect(file?.props.wrap).toBe('truncate-middle')
  expect(lines.map(one => String(one.text))).toEqual(expect.arrayContaining([flat, expect.stringContaining(flat.slice(3))]))
  expect((await ui.find({ key: 'test-local_setup-0' }))?.props).toEqual(expect.objectContaining({ height: tall(24), minWidth: 0, flexShrink: 1 }))
  await ui.unmount()
})

test('a task, a needs question and a status line with newlines each draw on one line', async ($, on) => {
  seeded(on, [agent('a9', { description: 'band\ndiff', asking: { text: 'Allow\nBash: rm -rf dist?', since: NOW - 10_000 } })])
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], now: 'waiting\nfor the go' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui)
  expect(texts).toEqual(expect.arrayContaining(['band diff', 'Allow Bash: rm -rf dist?', 'waiting for the go']))
  expect(texts.some(text => text.includes('\n'))).toBe(false)
  await ui.unmount()
})

test('the Ready callout draws its gate line as one truncated line, whatever the tests hold', async ($, on) => {
  const script = 'cd "$HOME/x"\nL=$(mktemp)\ntsc -p .'
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done', sha: '4e431f7', tests: [script, 'plugin test'] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  const gate = (await ui.findAll({ type: 'Text' })).find(one => String(one.text ?? '').startsWith('gate: '))
  expect(gate?.text).toBe(`gate: ${oneLine(script)}, plugin test`)
  expect(gate?.props.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('a status line with newlines stays one line on a narrow row and in the terminal pane', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], now: 'waiting\nfor the go' }] })
  const narrow = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  expect(await textsOf(narrow)).toEqual(expect.arrayContaining(['waiting for the go', '50m']))
  expect((await textsOf(narrow)).some(text => text.includes('\n'))).toBe(false)
  await narrow.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textsOf(terminal)).toContain('waiting · waiting for the go · 50m · 2/5')
  expect((await textsOf(terminal)).some(text => text.includes('\n'))).toBe(false)
  await terminal.unmount()
})
