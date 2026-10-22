import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Agent } from '../../lib/list'
import { C } from '../../theme/tokens'
import { BOARD, PANE, altsOf, click, hitsOf, started, textsOf } from '../../testing/world'

const NOW = 3_600_000

const ASK = { text: 'Allow Bash: rm -rf dist?', since: NOW - 10_000 }

function seeded(on: On, agents: Agent[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const agent = (id: string, more: Partial<Agent>): Agent => ({ id, type: 'master-session:reviewer', description: `review ${id}`, prompt: 'Run the gate.', state: 'running', startedAt: NOW - 60_000, ...more })

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
  expect(await altsOf(ui)).toContain('archived')
  await click(ui, 'hit-unarchive-local_old')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Unarchive Remove the stale mod?', 'It comes back in its group with its chat. Its worktree is made again on its next turn.', 'Cancel']))
  expect(await hitsOf(ui)).not.toContain('hit-unarchive-local_old')
  await click(ui, 'hit-unarchive-no-local_old')
  expect(await hitsOf(ui)).toContain('hit-unarchive-local_old')
  await ui.unmount()
})
