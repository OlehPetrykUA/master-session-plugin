import { expect, test } from 'claude-code/testing'

import { AT, BOARD, HOME, PANE, SELF, click, started, warmUp } from '../testing/world'
import type { Child } from '../testing/world'

warmUp()

const idle = (id: string) => ({ sessionId: id, name: id, title: id, cwd: `${HOME}/dotfiles`, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF })

const finished = (id: string) => ({ id, name: id, state: 'done', progress: 'step 2 of 2 — merged' })

const DONE = { ...BOARD, sessions: [BOARD.sessions[0], finished('local_a'), finished('local_b')] }

const withSessions = (child: Child): Child => ({ ...child, sessions: [idle('local_a'), idle('local_b')] })

const archives = (calls: readonly { tool: string; args: Record<string, unknown> }[]) => calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)

test('an archive_session error answer reaches the user as a toast and archives nothing', async ($, on) => {
  const { calls, toasts } = await started($, on, DONE, withSessions({ archiveError: 'Archive is not allowed here' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_a')
  await click(ui, 'hit-archive-local_a')
  expect(archives(calls)).toEqual(['local_a'])
  expect(toasts).toEqual(['Not archived: Archive is not allowed here'])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

test('a session that stays active after archive_session says so and offers no Undo', async ($, on) => {
  const { calls, toasts } = await started($, on, DONE, withSessions({ stuck: true }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_a')
  await click(ui, 'hit-archive-local_a')
  expect(archives(calls)).toEqual(['local_a'])
  expect(toasts).toEqual(['Not archived: local_a is still active. The app may be waiting for your approval.'])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

test('Archive all stops at the first failure and leaves the others alone', async ($, on) => {
  const { calls, toasts } = await started($, on, DONE, withSessions({ archiveError: 'denied' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-archive-all')
  expect(archives(calls)).toEqual(['local_a'])
  expect(toasts).toEqual(['Not archived: denied'])
  await ui.unmount()
})

test('Archive all without a failure archives every clean session', async ($, on) => {
  const { calls, toasts } = await started($, on, DONE, withSessions({}))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-archive-all')
  expect(archives(calls)).toEqual(['local_a', 'local_b'])
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('an Undo whose unarchive fails toasts the reason and keeps the failed session in the Undo bar', async ($, on) => {
  const { calls, toasts } = await started($, on, DONE, withSessions({ unarchiveError: 'cannot restore' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_a')
  await click(ui, 'hit-archive-local_a')
  expect(await ui.find({ key: 'undo-bar-done' })).toBeDefined()
  await click(ui, 'hit-undo-done')
  expect(calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)).toEqual(['local_a'])
  expect(toasts).toEqual(['Not unarchived: cannot restore'])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeDefined()
  await ui.unmount()
})
