import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { UNDO_MS } from '../lib/constants'
import { C } from '../theme/tokens'
import { AT, BAND, BOARD, HOME, PANE, SELF, SPAWN, TOOLKIT, WORKTREE, buttonsOf, childOf, click, hitsOf, started, textsOf, warmUp, world } from '../testing/world'
import type { Child, Ui } from '../testing/world'

warmUp()

const live = (id: string, patch: Record<string, unknown> = {}) => ({ sessionId: id, name: id, title: id, cwd: `${HOME}/dotfiles`, isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF, ...patch })

const fin = (id: string) => ({ id, name: id, state: 'done', progress: 'step 2 of 2 — merged' })

const seeded = (id: string) => ({ ...fin(id), worktrees: [WORKTREE] })

const boardOf = (...sessions: Record<string, unknown>[]) => ({ ...BOARD, needsYou: [], sessions })

const DONE = boardOf(fin('local_a'), fin('local_b'))

const PAIR: Child = { sessions: [live('local_a'), live('local_b')] }

const CLEAN = `${HOME}/.claude/worktrees/wt-toolkit-clean`

const TREES = `worktree ${TOOLKIT}\nHEAD d575596be1713c300bf1d8737355ceda0cb3ded3\nbranch refs/heads/main\n\nworktree ${WORKTREE}\nHEAD 0a4621c5737c70d482f20e7ea07591e9c117d6a1\ndetached\n\nworktree ${CLEAN}\nHEAD 1111111aaaaaaa\nbranch refs/heads/feat/clean\n\n`

const TIDY = '# branch.oid 1111111\n# branch.head feat/clean\n'

const DIRTY = `${TIDY}1 .M N... 100644 100644 100644 a b edited.ts\n`

const gitOf = (status = TIDY): Record<string, string> => ({
  [`${WORKTREE} symbolic-ref`]: 'origin/main\n',
  [`${WORKTREE} rev-parse`]: 'd575596\n',
  [`${WORKTREE} worktree`]: TREES,
  [`${CLEAN} status`]: status,
  [`${CLEAN} rev-list`]: '0\n',
})

const MIXED = (status: string): Child => ({ git: gitOf(status), sessions: [live('local_a'), live('local_b', { cwd: CLEAN })] })

const archives = (calls: readonly { tool: string; args: Record<string, unknown> }[]) => calls.filter(one => one.tool === 'archive_session').map(one => one.args.session_id)

const unarchives = (calls: readonly { tool: string; args: Record<string, unknown> }[]) => calls.filter(one => one.tool === 'unarchive_session').map(one => one.args.session_id)

const rowsOf = async (ui: Ui) => (await hitsOf(ui)).filter(hit => hit.startsWith('hit-row-') && !hit.endsWith('-chevron'))

const keysOf = async (ui: Ui) => (await ui.findAll({ type: 'Box' })).map(box => box.key ?? '')

const chip = async (ui: Ui, id: string) => Number(/(\d+)$/.exec(String((await ui.find({ key: `chip-${id}` }))?.text))?.[1])

const chipAlt = async (ui: Ui, id: string) => Number(/"alt":"[^"]* (\d+)"/.exec(JSON.stringify(await ui.find({ key: `chip-${id}` })))?.[1])

const alt = async (band: Ui) => String((await band.findAll({ type: 'Svg' })).find(one => String(one.props.source).includes('width="4096"'))?.props.alt)

function crew($: Engine, on: On) {
  let running: string[] = []
  let runs = 0
  on('agent.list', () => ({ value: running.map(id => ({ id, description: id, type: 'general-purpose', status: 'running' as const })) }))
  on('agent.spawn', (_, event) => {
    const agentId = event.workflow ? `${event.workflow.runId}-${event.workflow.agentIndex}` : event.description
    running = event.workflow ? running : [...running, agentId]
    return { model: 'claude-haiku-5-5', agentId }
  })
  on('turn.complete', (_, event) => {
    running = running.filter(id => id !== event.agentId)
    return { text: event.answer }
  })
  on('tool.call', { tool: 'Workflow' }, () => {
    runs += 1
    return { result: { status: 'async_launched' as const, taskId: `task${runs}`, taskType: 'local_workflow' as const, workflowName: 'review-changes', runId: `wf_${runs}`, summary: 'Review' }, text: 'Workflow launched in background.' }
  })
  const end = (agentId: string) => $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: `turn-${agentId}`, agentId, reason: 'answer' })
  return {
    sub: (description: string) => $.agent.spawn({ ...SPAWN, description, subagentType: 'general-purpose' }),
    end,
    run: async () => {
      await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'review-changes' }" })
      await $.agent.spawn({ ...SPAWN, description: 'scan', subagentType: 'workflow-subagent', workflow: { runId: `wf_${runs}`, agentIndex: 0 } })
      return `wf_${runs}`
    },
    endRun: (id: string) => end(`${id}-0`),
  }
}

async function withCrew($: Engine, on: On, board: unknown, child: Child, hasRun = true) {
  const c = crew($, on)
  const run = await started($, on, board, child)
  await c.sub('Review auth flow')
  const wf = hasRun ? await c.run() : ''
  await c.end('Review auth flow')
  if (hasRun) await c.endRun(wf)
  await run.clock.advance(10_000)
  return { ...run, c, wf }
}

const mountPane = ($: Engine, surface: 'desktop' | 'terminal' = 'desktop') => $.ui.mount({ ...PANE, surface })

test('AC1 the Done header holds one action, Clear done, and no archive-all exists', async ($, on) => {
  const { c } = await withCrew($, on, DONE, PAIR)
  await c.sub('Still going')
  const ui = await mountPane($)
  const hits = await hitsOf(ui)
  expect(hits.filter(hit => hit === 'hit-clear-done')).toHaveLength(1)
  expect(hits).not.toContain('hit-archive-all')
  expect(await ui.find({ key: 'face-clear-done' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Clear done' })).toBeDefined()
  expect(await ui.find({ key: 'face-archive-all' })).toBeUndefined()
  await ui.unmount()
})

test('AC2 the button shows with the All and Done chips and with no other chip', async ($, on) => {
  await started($, on, DONE, PAIR)
  const ui = await mountPane($)
  await click(ui, 'hit-chip-done')
  expect(await hitsOf(ui)).toContain('hit-clear-done')
  for (const chip of ['archived', 'working', 'waiting', 'needs-you']) {
    await click(ui, `hit-chip-${chip}`)
    expect(await ui.find({ key: 'face-clear-done' })).toBeUndefined()
    expect(await hitsOf(ui)).not.toContain('hit-clear-done')
  }
  await click(ui, 'hit-chip-all')
  expect(await hitsOf(ui)).toContain('hit-clear-done')
  await ui.unmount()
})

test('AC3 a Done section holding only finished subagents or runs shows the button', async ($, on) => {
  const working = boardOf({ id: 'local_w', name: 'local_w', state: 'working', progress: 'step 1 of 4 — build' })
  await withCrew($, on, working, { sessions: [live('local_w', { isRunning: true })] })
  const ui = await mountPane($)
  expect(await hitsOf(ui)).toContain('hit-clear-done')
  await ui.unmount()
})

test('AC4 sessions that are all dirty, missing or running, and nothing finished, show no button', async ($, on) => {
  const board = boardOf(fin('local_a'), fin('local_b'), fin('local_c'))
  await started($, on, board, { git: gitOf(DIRTY), sessions: [live('local_a', { cwd: CLEAN }), live('local_c', { isRunning: true })] })
  const ui = await mountPane($)
  expect(await ui.find({ key: 'group-head-done' })).toBeDefined()
  expect(await ui.find({ key: 'face-clear-done' })).toBeUndefined()
  expect(await hitsOf(ui)).not.toContain('hit-clear-done')
  await ui.unmount()
})

test('AC5 nothing in Done shows no button', async ($, on) => {
  await started($, on)
  const ui = await mountPane($)
  expect(await ui.find({ key: 'group-head-done' })).toBeUndefined()
  expect(await ui.find({ key: 'face-clear-done' })).toBeUndefined()
  await ui.unmount()
})

test('AC6 a plain session that opens the pane with the open tool shows no button', async ($, on) => {
  on('fs.write', () => ({ value: undefined }))
  const run = world(on, { ...childOf(3_600_000), sessions: PAIR.sessions })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  await $.tool.call({ tool: 'mcp__master-session__open' })
  const ui = await mountPane($)
  expect(await ui.find({ key: 'face-clear-done' })).toBeUndefined()
  expect(await hitsOf(ui)).not.toContain('hit-clear-done')
  await ui.unmount()
})

test('AC7 the press archives local_a then local_b with the pane reason and makes only list, get and archive calls', async ($, on) => {
  const { calls, clock } = await started($, on, DONE, PAIR)
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a', 'local_b'])
  for (const call of calls.filter(one => one.tool === 'archive_session')) expect(call.args.reason).toBe('Archived from the master session pane')
  const known = ['list_sessions', 'get_session', 'archive_session']
  expect(calls.filter(one => !known.includes(one.tool))).toEqual([])
  await ui.unmount()
})

test('AC8 a clean clear stops, deletes, messages and unarchives nothing, opens nothing and draws no confirm box', async ($, on) => {
  const { calls, clock, opened } = await started($, on, DONE, PAIR)
  const ui = await mountPane($)
  const before = opened.length
  await click(ui, 'hit-clear-done')
  await clock.settle()
  const banned = ['stop_session', 'delete_session', 'send_message', 'set_session_permission_mode', 'unarchive_session']
  expect(calls.filter(one => banned.includes(one.tool))).toEqual([])
  expect(opened.length).toBe(before)
  expect((await keysOf(ui)).filter(key => key.startsWith('confirm-'))).toEqual([])
  await ui.unmount()
})

test('AC9 a dirty session is skipped and counted, stays in Done with its loss line, and opens no box', async ($, on) => {
  const { calls, clock } = await started($, on, boardOf(seeded('local_a'), fin('local_b')), MIXED(DIRTY))
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a'])
  expect(await ui.find({ type: 'Text', text: 'Archived 1 session · skipped 1 with work to keep' })).toBeDefined()
  expect(await ui.find({ key: 'row-local_b' })).toBeDefined()
  expect((await textsOf(ui)).some(text => text.includes('uncommitted'))).toBe(false)
  await click(ui, 'hit-row-local_b')
  expect((await textsOf(ui)).some(text => /^Done, but .*uncommitted/.test(text))).toBe(true)
  expect((await keysOf(ui)).filter(key => key.startsWith('confirm-'))).toEqual([])
  await ui.unmount()
})

test('AC10 the skipped session keeps its own Archive… and the existing ArchiveBox, archiving only after Archive and remove', async ($, on) => {
  const { calls, clock } = await started($, on, boardOf(seeded('local_a'), fin('local_b')), MIXED(DIRTY))
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  await click(ui, 'hit-row-local_b')
  await click(ui, 'hit-archive-local_b')
  expect(await ui.find({ key: 'confirm-local_b' })).toBeDefined()
  const texts = await textsOf(ui)
  expect(texts).toContain('Archive local_b?')
  expect(texts.some(text => text.includes('1 uncommitted file'))).toBe(true)
  expect(archives(calls)).toEqual(['local_a'])
  await click(ui, 'hit-archive-yes-local_b')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a', 'local_b'])
  await ui.unmount()
})

test('AC11 a session whose git state is unknown is skipped', async ($, on) => {
  const { calls, clock } = await started($, on, DONE, { sessions: [live('local_a'), live('local_b', { cwd: `${HOME}/nowhere` })] })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a'])
  expect(await ui.find({ type: 'Text', text: 'Archived 1 session · skipped 1 with work to keep' })).toBeDefined()
  await ui.unmount()
})

test('AC12 a session clean at the draw and dirty at the re-check is skipped and counted', async ($, on) => {
  const git = gitOf()
  const { calls, clock } = await started($, on, DONE, { git, sessions: [live('local_a'), live('local_b', { cwd: CLEAN })] })
  const ui = await mountPane($)
  git[`${CLEAN} status`] = DIRTY
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a'])
  expect(await ui.find({ type: 'Text', text: 'Archived 1 session · skipped 1 with work to keep' })).toBeDefined()
  await ui.unmount()
})

test('AC13 an archive error archives one session, toasts the reason and stops', async ($, on) => {
  const { calls, toasts, clock } = await started($, on, DONE, { ...PAIR, archiveError: 'denied' })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a'])
  expect(toasts).toEqual(['Not archived: denied'])
  await ui.unmount()
})

test('AC14 a session that stays active toasts the approval line, stops and offers no Undo bar', async ($, on) => {
  const { calls, toasts, clock } = await started($, on, DONE, { ...PAIR, stuck: true })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a'])
  expect(toasts).toEqual(['Not archived: local_a is still active. The app may be waiting for your approval.'])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

test('AC15 a done session whose side session is running is not archived and the toast names it', async ($, on) => {
  const side = live('local_side', { name: 'side-work', title: 'side-work', startedBy: 'local_a', isRunning: true })
  const { calls, toasts, clock } = await started($, on, boardOf(fin('local_a')), { sessions: [live('local_a'), side] })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(archives(calls)).toEqual([])
  expect(toasts).toContain('Not archived: side-work is still working')
  await ui.unmount()
})

test('AC16 the press hides a finished subagent and run at once with no ccd call and no process', async ($, on) => {
  const working = boardOf({ id: 'local_w', name: 'local_w', state: 'working', progress: 'step 1 of 4 — build' })
  const { calls, gits, clock, wf } = await withCrew($, on, working, { sessions: [live('local_w', { isRunning: true })] })
  const ui = await mountPane($)
  expect(await rowsOf(ui)).toEqual(expect.arrayContaining(['hit-row-Review auth flow', `hit-row-${wf}`]))
  const [callsBefore, gitsBefore] = [calls.length, gits.length]
  await click(ui, 'hit-clear-done')
  await clock.settle()
  const rows = await rowsOf(ui)
  expect(rows).not.toContain('hit-row-Review auth flow')
  expect(rows).not.toContain(`hit-row-${wf}`)
  expect(calls.length).toBe(callsBefore)
  expect(gits.length).toBe(gitsBefore)
  await ui.unmount()
})

test('AC17 a subagent that finishes after the clear shows in Done and stays there until the next clear, however old', async ($, on) => {
  const { clock, c } = await withCrew($, on, DONE, { sessions: [] })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.advance(1_000)
  await c.sub('Later job')
  await c.end('Later job')
  expect(await rowsOf(ui)).toContain('hit-row-Later job')
  expect(await rowsOf(ui)).not.toContain('hit-row-Review auth flow')
  await clock.advance(300_000)
  expect(await rowsOf(ui)).toContain('hit-row-Later job')
  await ui.unmount()
})

test('AC18 running subagents and runs stay in Working', async ($, on) => {
  const { clock, c } = await withCrew($, on, DONE, { sessions: [] })
  await c.sub('Still going')
  const wf = await c.run()
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(await rowsOf(ui)).toEqual(expect.arrayContaining(['hit-row-Still going', `hit-row-${wf}`]))
  expect(await textsOf(ui)).toContain('Hid 1 subagent and 1 workflow')
  const keys = await keysOf(ui)
  const working = keys.indexOf('group-head-working')
  const done = keys.indexOf('group-head-done')
  for (const key of ['row-Still going', `row-${wf}`]) {
    expect(keys.indexOf(key)).toBeGreaterThan(working)
    expect(keys.indexOf(key)).toBeLessThan(done)
  }
  await ui.unmount()
})

test('AC19 the cleared subagent and run stay hidden after a hot reload', async ($, on) => {
  const { clock } = await withCrew($, on, DONE, { sessions: [] })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  await ui.unmount()
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const again = await mountPane($)
  const rows = await rowsOf(again)
  expect(rows).not.toContain('hit-row-Review auth flow')
  expect(rows.some(hit => hit.startsWith('hit-row-wf_'))).toBe(false)
  await again.unmount()
})

test('AC20 a second press while busy does nothing and the button shows pressed', async ($, on) => {
  let isHeld = false
  let release = () => {}
  const gate = new Promise<void>(resolve => (release = resolve))
  on('state.set', async (_, e, next) => {
    if (isHeld && e.key === 'live') await gate
    return next(e)
  })
  const { calls, clock } = await started($, on, DONE, PAIR)
  const ui = await mountPane($)
  isHeld = true
  await click(ui, 'hit-clear-done')
  await click(ui, 'hit-clear-done')
  expect((await ui.find({ key: 'face-clear-done' }))?.props.backgroundColor).toBe(C.pressBg)
  isHeld = false
  release()
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a', 'local_b'])
  await ui.unmount()
})

test('AC21 the Undo bar reads archived and hid, and is gone after UNDO_MS', async ($, on) => {
  const { clock } = await withCrew($, on, DONE, PAIR)
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(await ui.find({ key: 'undo-bar-done' })).toBeDefined()
  expect(await textsOf(ui)).toContain('Archived 2 sessions · hid 1 subagent and 1 workflow')
  expect(await ui.find({ key: 'face-undo-done' })).toBeDefined()
  await clock.advance(UNDO_MS)
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

test('AC22 Undo unarchives both sessions and brings the hidden rows back', async ($, on) => {
  const { calls, clock, wf } = await withCrew($, on, DONE, PAIR)
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  await click(ui, 'hit-undo-done')
  await clock.settle()
  expect(unarchives(calls)).toEqual(['local_a', 'local_b'])
  expect(await rowsOf(ui)).toEqual(expect.arrayContaining(['hit-row-local_a', 'hit-row-local_b', 'hit-row-Review auth flow', `hit-row-${wf}`]))
  await ui.unmount()
})

test('AC22 Undo with only hidden rows brings them back and the bar has Undo', async ($, on) => {
  const { clock, wf } = await withCrew($, on, DONE, { sessions: [] })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(await textsOf(ui)).toContain('Hid 1 subagent and 1 workflow')
  await click(ui, 'hit-undo-done')
  await clock.settle()
  expect(await rowsOf(ui)).toEqual(expect.arrayContaining(['hit-row-Review auth flow', `hit-row-${wf}`]))
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

test('AC23 an Undo whose unarchive fails toasts and the bar keeps the failed ids with Undo', async ($, on) => {
  const { toasts, calls, clock } = await withCrew($, on, DONE, { ...PAIR, unarchiveError: 'cannot restore' })
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.settle()
  await click(ui, 'hit-undo-done')
  await clock.settle()
  expect(toasts).toEqual(['Not unarchived: cannot restore'])
  expect(await ui.find({ key: 'undo-bar-done' })).toBeDefined()
  expect(await ui.find({ key: 'face-undo-done' })).toBeDefined()
  expect(await textsOf(ui)).toContain('Archived 2 sessions')
  await click(ui, 'hit-undo-done')
  await clock.settle()
  expect(unarchives(calls)).toEqual(['local_a', 'local_b', 'local_a', 'local_b'])
  await ui.unmount()
})

test('AC24 after the bar expired the sessions unarchive through their own confirm', async ($, on) => {
  const { calls, clock } = await started($, on, DONE, PAIR)
  const ui = await mountPane($)
  await click(ui, 'hit-clear-done')
  await clock.advance(UNDO_MS + 1_000)
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-row-local_a')
  await click(ui, 'hit-unarchive-local_a')
  expect(await ui.find({ key: 'face-unarchive-yes-local_a' })).toBeDefined()
  expect(unarchives(calls)).toEqual([])
  await click(ui, 'hit-unarchive-yes-local_a')
  await clock.settle()
  expect(unarchives(calls)).toEqual(['local_a'])
  await ui.unmount()
})

test('AC25 a press that archives, hides and skips nothing leaves no Undo bar', async ($, on) => {
  const child: Child = { sessions: [live('local_a'), live('local_b')] }
  const { toasts, clock } = await started($, on, DONE, child)
  const ui = await mountPane($)
  for (const one of child.sessions ?? []) (one as Record<string, unknown>).isRunning = true
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(toasts.length).toBeGreaterThan(0)
  expect(await ui.find({ key: 'undo-bar-done' })).toBeUndefined()
  await ui.unmount()
})

async function bandAndPane($: Engine, on: On, board: unknown, child: Child, withAgents: boolean, hasRun = true) {
  on('ui.render', { component: 'AbovePrompt' }, ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine</Text>
  })
  const bare = { ...child, isBare: true }
  const run = withAgents ? await withCrew($, on, board, bare, hasRun) : await started($, on, board, bare)
  const pane = await mountPane($)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  return { ...run, pane, band }
}

const WORKER = { id: 'local_w', name: 'local_w', state: 'working', progress: 'step 1 of 4 — build' }

test('AC25 a skipped-only press shows the skipped bar without Undo and leaves the cleared time alone', async ($, on) => {
  let isStale = false
  on('state.get', async (_, e, next) => (isStale && e.key === 'agents' ? { value: { value: [], version: 1 } } : next(e)))
  const { clock } = await withCrew($, on, boardOf(seeded('local_b')), { git: gitOf(DIRTY), sessions: [live('local_b', { cwd: CLEAN })] }, false)
  const ui = await mountPane($)
  expect(await hitsOf(ui)).toContain('hit-clear-done')
  isStale = true
  await click(ui, 'hit-clear-done')
  await clock.settle()
  expect(await textsOf(ui)).toContain('Skipped 1 with work to keep')
  expect(await ui.find({ key: 'face-undo-done' })).toBeUndefined()
  isStale = false
  await clock.advance(2_000)
  await ui.redraw()
  expect(await rowsOf(ui)).toContain('hit-row-Review auth flow')
  await ui.unmount()
})

test('AC26 the band drops the archived sessions and keeps the hidden subagent and run among its units', async ($, on) => {
  const board = boardOf(fin('local_a'), fin('local_b'), fin('local_c'))
  const child: Child = { git: gitOf(DIRTY), sessions: [live('local_a'), live('local_b'), live('local_c', { cwd: CLEAN })] }
  const { pane, band, clock } = await bandAndPane($, on, board, child, true)
  expect(await alt(band)).toMatch(/^Master session: all 5 done\./)
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await alt(band)).toMatch(/^Master session: all 3 done\./)
  expect(await chip(pane, 'archived')).toBe(2)
  await pane.unmount()
  await band.unmount()
})

test('AC27 the band reads 75 then 62 percent and the working and waiting chips do not move', async ($, on) => {
  const { pane, band, clock } = await bandAndPane($, on, boardOf(WORKER, fin('local_a')), { sessions: [live('local_w', { isRunning: true }), live('local_a')] }, true, false)
  expect(await alt(band)).toMatch(/^Master session: 75 percent, 2 of 3 done\./)
  expect([await chip(pane, 'working'), await chip(pane, 'waiting')]).toEqual([1, 0])
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await alt(band)).toMatch(/^Master session: 62 percent, \d of \d done\./)
  expect([await chip(pane, 'working'), await chip(pane, 'waiting')]).toEqual([1, 0])
  await pane.unmount()
  await band.unmount()
})

test('AC28 one clean done session and nothing else leaves the band empty', async ($, on) => {
  const { pane, band, clock } = await bandAndPane($, on, boardOf(fin('local_a')), { sessions: [live('local_a')] }, false)
  expect(await alt(band)).toMatch(/^Master session: all 1 done\./)
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  await pane.unmount()
  await band.unmount()
})

test('AC29 sessions working with only finished subagents in Done: the band is the same before and after', async ($, on) => {
  const { pane, band, clock } = await bandAndPane($, on, boardOf(WORKER), { sessions: [live('local_w', { isRunning: true })] }, true)
  const before = await alt(band)
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await alt(band)).toBe(before)
  expect(await rowsOf(pane)).not.toContain('hit-row-Review auth flow')
  await pane.unmount()
  await band.unmount()
})

test('AC30 after a clear the band count is finished/units and the pane chips still count working and waiting', async ($, on) => {
  const waiting = { id: 'local_q', name: 'local_q', state: 'waiting', progress: 'step 1 of 3 — wait', now: 'waiting for the go' }
  const { pane, band, clock } = await bandAndPane($, on, boardOf(WORKER, waiting, fin('local_a')), { sessions: [live('local_w', { isRunning: true }), live('local_q', { isRunning: true }), live('local_a')] }, true)
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await alt(band)).toMatch(/^Master session: \d+ percent, \d+ of \d+ done\./)
  expect([await chip(pane, 'working'), await chip(pane, 'waiting')]).toEqual([1, 1])
  await pane.unmount()
  await band.unmount()
})

test('AC31 the All chip drops by the archived and the hidden, and the Agents tile follows the hide', async ($, on) => {
  const { pane, clock } = await bandAndPane($, on, DONE, PAIR, true)
  const agents = async () => Number(/"alt":"Agents (\d+)"/.exec(JSON.stringify(await pane.find({ key: 'block-agents' })))?.[1])
  const readings = async () => [await chipAlt(pane, 'all'), await agents()]
  expect(await readings()).toEqual([4, 2])
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await readings()).toEqual([0, 0])
  await pane.unmount()
})

test('AC32 the archived sessions are neither rows nor units though the board lists them, with no board call, transcript read or board write', async ($, on) => {
  const writes: string[] = []
  on('fs.write', (_, e) => {
    writes.push(e.path)
    return { value: undefined }
  })
  const { calls, scans, pane, band, clock } = await bandAndPane($, on, DONE, PAIR, false)
  const before = [calls.length, scans.messages, writes.length]
  await click(pane, 'hit-clear-done')
  await clock.settle()
  expect(await rowsOf(pane)).not.toEqual(expect.arrayContaining(['hit-row-local_a']))
  expect(await rowsOf(pane)).not.toEqual(expect.arrayContaining(['hit-row-local_b']))
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  expect(calls.every(one => ['list_sessions', 'get_session', 'archive_session'].includes(one.tool))).toBe(true)
  expect(scans.messages).toBe(before[1])
  expect(writes.length).toBe(before[2])
  await pane.unmount()
  await band.unmount()
})

test('AC33 after a hot reload and three LIVE_MS periods both stay out of the rows and units', async ($, on) => {
  const { pane, band, clock } = await bandAndPane($, on, DONE, PAIR, false)
  await click(pane, 'hit-clear-done')
  await clock.settle()
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.advance(45_000)
  expect(await rowsOf(pane)).not.toContain('hit-row-local_a')
  expect(await rowsOf(pane)).not.toContain('hit-row-local_b')
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  await pane.unmount()
  await band.unmount()
})

test('AC34 the terminal Done header has a Clear done button where Archive all was', async ($, on) => {
  const { calls, clock } = await started($, on, DONE, PAIR)
  const ui = await mountPane($, 'terminal')
  expect(await buttonsOf(ui)).toContain('clear-done')
  expect(await buttonsOf(ui)).not.toContain('archive-all')
  expect(String((await ui.find({ key: 'clear-done' }))?.props.label)).toBe('Clear done')
  await ui.press({ key: 'clear-done' })
  await clock.settle()
  expect(archives(calls)).toEqual(['local_a', 'local_b'])
  await ui.unmount()
})

test('AC35 the terminal undo line reads archived and hid, with an Undo button', async ($, on) => {
  const { clock } = await withCrew($, on, DONE, PAIR)
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'clear-done' })
  await clock.settle()
  expect(await ui.find({ key: 'undo' })).toBeDefined()
  expect(await textsOf(ui)).toContain('Archived 2 sessions · hid 1 subagent and 1 workflow')
  expect(await buttonsOf(ui)).toContain('undo-archive')
  await ui.unmount()
})

test('AC36 no clear tool and no clear command is added', async ($, on) => {
  const { tools } = await started($, on)
  expect(tools.filter(name => /clear/i.test(name))).toEqual([])
})
