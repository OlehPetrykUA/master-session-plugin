import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { GIT_CAP } from '../lib/constants'
import { BOARD, BOARD_TOOL, HOME, PANE, WORKTREE, click, started, warmUp } from '../testing/world'
import type { Ui } from '../testing/world'

warmUp()

const TREES = [WORKTREE, ...Array.from({ length: 6 }, (_, index) => `${HOME}/.claude/worktrees/wt-toolkit-${index}`)]
const MAIN = `${HOME}/Work/toolkit`
const ALL = [MAIN, ...TREES]
const indexOf = (path: string) => `${path}/.git/index`

function repo() {
  const list = ALL.map((path, index) => `worktree ${path}\nHEAD ${String(index).repeat(40)}\nbranch refs/heads/b${index}\n\n`).join('')
  const git: Record<string, string> = { [`${WORKTREE} worktree`]: list, [`${WORKTREE} rev-parse`]: 'abc1234\n' }
  for (const path of ALL) {
    git[`${path} status`] = '# branch.oid 1\n# branch.head b\n# branch.upstream origin/b\n# branch.ab +0 -0\n'
    git[`${path} rev-list`] = '2\n'
  }
  return git
}

const files = () => Object.fromEntries([...ALL, `${HOME}/dotfiles`].map(path => [indexOf(path), 'i0']))

async function master($: Engine, on: On) {
  const tree = files()
  const git = repo()
  const run = await started($, on, BOARD, { git, files: tree })
  return { ...run, tree, git }
}

const DIRTY = '# branch.oid 1\n# branch.head b\n# branch.upstream origin/b\n# branch.ab +0 -0\n1 .M N... 100644 100644 100644 a b edited.ts\n'

const statusesOf = (gits: string[][], from: number) => gits.slice(from).filter(argv => argv[4] === 'status').map(argv => String(argv[3]))

const PROBE = {
  name: 'state-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'state-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const repos = await $.state.get({ plugin: 'master-session', key: 'repos' })
      return <Text>{JSON.stringify(repos.value ?? [])}</Text>
    })
  },
}

type Probed = { base?: string; landed?: number; worktrees: { path: string; dirty: number; unmerged?: number }[] }

async function reposOfProbe($: Engine) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'state-probe', requestId: 'state-probe', surface: 'terminal' })
  const repos = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as Probed[]
  await ui.unmount()
  return repos
}

const repoOfProbe = async ($: Engine) => (await reposOfProbe($)).find(one => one.worktrees.some(tree => tree.path === WORKTREE))

const treeOfProbe = async ($: Engine, path: string) => (await reposOfProbe($)).flatMap(one => one.worktrees).find(one => one.path === path)

test('a master with nine worktrees runs far fewer git processes a minute than the 100 it ran before', async ($, on) => {
  const { clock, gits } = await master($, on)
  await clock.advance(150_000)
  const from = gits.length
  await clock.advance(120_000)
  const perMinute = (gits.length - from) / 2
  expect(perMinute).toBeLessThanOrEqual(30)
})

test('an idle worktree is not scanned again until its index changes or the memo ages out', async ($, on) => {
  const { clock, gits, tree } = await master($, on)
  await clock.advance(15_000)
  const from = gits.length
  await clock.advance(60_000)
  expect(statusesOf(gits, from)).toEqual([])
  tree[indexOf(TREES[2] ?? '')] = 'i1'
  const changed = gits.length
  await clock.advance(15_000)
  expect(statusesOf(gits, changed)).toEqual([TREES[2]])
  const aged = gits.length
  await clock.advance(150_000)
  expect(new Set(statusesOf(gits, aged)).size).toBe(ALL.length + 1)
})

test('a tick never runs more git processes than the cap, and the rest follow on the next ticks', async ($, on) => {
  const { clock, gits, tree } = await master($, on)
  await clock.advance(15_000)
  for (const path of ALL) tree[indexOf(path)] = 'i2'
  const seen = new Set<string>()
  for (let tick = 0; tick < 8; tick += 1) {
    const from = gits.length
    await clock.advance(15_000)
    expect(gits.length - from).toBeLessThanOrEqual(GIT_CAP)
    for (const path of statusesOf(gits, from)) seen.add(path)
  }
  expect(ALL.every(path => seen.has(path))).toBe(true)
})

test('an edit that leaves the index alone shows on the next forced refresh, not before', { plugins: [PROBE] }, async ($, on) => {
  const { clock, git } = await master($, on)
  const path = TREES[2] ?? ''
  expect((await treeOfProbe($, path))?.dirty).toBe(0)
  git[`${path} status`] = DIRTY
  await clock.advance(15_000)
  expect((await treeOfProbe($, path))?.dirty).toBe(0)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await clock.settle()
  expect((await treeOfProbe($, path))?.dirty).toBe(1)
})

async function archiveClick($: Engine, on: On, status: string | undefined) {
  const { clock, git, calls } = await master($, on)
  if (status !== undefined) git[`${WORKTREE} status`] = status
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  await click(ui, 'hit-archive-yes-local_setup')
  await clock.settle()
  await ui.unmount()
  return calls.filter(one => one.tool === 'archive_session').length
}

test('control: a clean worktree archives', async ($, on) => {
  expect(await archiveClick($, on, undefined)).toBe(1)
})

const FAMILY = {
  name: 'family-probe',
  register(on: On) {
    on('ui.render', { component: 'Pane', requestId: 'family-probe' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const live = await $.state.get({ plugin: 'master-session', key: 'live' })
      return <Text>{JSON.stringify((live.value as { family?: unknown } | undefined)?.family ?? null)}</Text>
    })
  },
}

test('the archive list kept for the confirm is dropped once a refresh replaces the sessions', { plugins: [FAMILY] }, async ($, on) => {
  await archiveClick($, on, undefined)
  const ui = await $.ui.mount({ ...PANE, plugin: 'family-probe', requestId: 'family-probe', surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('null')
  await ui.unmount()
})

test('archive sees an unstaged edit made after the last scan and asks instead of archiving', async ($, on) => {
  expect(await archiveClick($, on, DIRTY)).toBe(0)
})

test('archive refuses a worktree whose git status could not be read', async ($, on) => {
  expect(await archiveClick($, on, '')).toBe(0)
})

test('no tick runs more git processes than the cap while every repo and worktree memo ages out', async ($, on) => {
  const { clock, gits } = await master($, on)
  let peak = 0
  for (let tick = 0; tick < 24; tick += 1) {
    const from = gits.length
    await clock.advance(15_000)
    peak = Math.max(peak, gits.length - from)
  }
  expect(peak).toBeLessThanOrEqual(GIT_CAP)
})

test('a failed git status is not remembered: the next tick reads it again without waiting for an index change', { plugins: [PROBE] }, async ($, on) => {
  const tree = files()
  const git = repo()
  const path = TREES[3] ?? ''
  const good = git[`${path} status`] ?? ''
  git[`${path} status`] = ''
  const run = await started($, on, BOARD, { git, files: tree })
  git[`${path} status`] = DIRTY
  await run.clock.advance(15_000)
  expect(good).not.toBe('')
  expect((await treeOfProbe($, path))?.dirty).toBe(1)
})

test('a forced refresh re-reads the repo base instead of the remembered one', { plugins: [PROBE] }, async ($, on) => {
  const { clock, git } = await master($, on)
  expect((await repoOfProbe($))?.base).toBe('main')
  git[`${WORKTREE} rev-parse`] = ''
  await clock.advance(15_000)
  expect((await repoOfProbe($))?.base).toBe('main')
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await clock.settle()
  expect((await repoOfProbe($))?.base).toBeUndefined()
})

test('each tracked repo counts what landed on its base since the run start, with one capped rev-list per refresh', { plugins: [PROBE] }, async ($, on) => {
  const { clock, gits } = await master($, on)
  const repo = await repoOfProbe($)
  expect(repo?.landed).toBe(2)
  const since = gits.filter(argv => argv.some(one => one.startsWith('--since=')))
  expect(since.length).toBeGreaterThan(0)
  const before = since.length
  await clock.advance(60_000)
  expect(gits.filter(argv => argv.some(one => one.startsWith('--since='))).length).toBe(before)
})

test('a base move seen in the worktree listing rescans the unmerged count of a worktree whose index did not change', { plugins: [PROBE] }, async ($, on) => {
  const { clock, git } = await master($, on)
  const path = TREES[2] ?? ''
  expect((await treeOfProbe($, path))?.unmerged).toBe(2)
  git[`${WORKTREE} rev-parse`] = 'def5678\n'
  git[`${WORKTREE} worktree`] = (git[`${WORKTREE} worktree`] ?? '').replace(`HEAD ${'0'.repeat(40)}`, `HEAD ${'9'.repeat(40)}`)
  git[`${path} rev-list`] = '5\n'
  for (let tick = 0; tick < 6; tick += 1) await clock.advance(15_000)
  expect((await treeOfProbe($, path))?.unmerged).toBe(5)
})

const MCP = {
  name: 'mcp-probe',
  register(on: On) {
    const hidden: string[] = []
    on('mcp.call', async (_, e, next) => {
      if (e.tool === 'archive_session') hidden.push(String(e.args.session_id))
      if (e.tool === 'unarchive_session' && e.args.session_id === 'local_b') return { value: { content: [{ type: 'text' as const, text: 'cannot unarchive' }], isError: true } } as never
      const done = (await next(e)) as { value: { content: { type: 'text'; text: string }[] } }
      if (e.tool !== 'list_sessions' || !hidden.length) return done as never
      const list = JSON.parse(done.value.content[0]?.text ?? '[]') as { sessionId: string }[]
      return { value: { content: [{ type: 'text' as const, text: JSON.stringify(list.filter(one => !hidden.includes(one.sessionId))) }], isError: false } } as never
    })
  },
}

const barOf = async (ui: Ui) => (await ui.findAll({ type: 'Box' })).map(box => box.key ?? '').filter(key => key.startsWith('undo-bar'))

test('an archive that succeeds but leaves the session out of the refreshed list is reported, not counted', { plugins: [MCP] }, async ($, on) => {
  const { clock, toasts } = await master($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  await click(ui, 'hit-archive-local_setup')
  await click(ui, 'hit-archive-yes-local_setup')
  await clock.settle()
  expect(toasts.some(toast => toast.startsWith('Not archived:') && toast.includes('session list'))).toBe(true)
  expect(await barOf(ui)).toEqual([])
  await ui.unmount()
})

test('undo unarchives each id: one that fails stays in the bar for a fresh 10 s and is toasted once', { plugins: [MCP] }, async ($, on) => {
  const written: unknown[] = []
  let isSeeded = true
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (isSeeded && e.key === 'undone' ? { value: { ...real.value, value: { ids: ['local_a', 'local_b'], name: '', skipped: 0, group: 'waiting', index: 0, at: Number.MAX_SAFE_INTEGER } } } : real) as never
  })
  on('state.set', async (_, e, next) => {
    const done = await next(e)
    if (e.key === 'undone') {
      isSeeded = false
      written.push(e.value)
    }
    return done
  })
  const { clock, toasts } = await master($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-undo-waiting')
  await clock.settle()
  expect(toasts.filter(toast => toast.startsWith('Not unarchived'))).toHaveLength(1)
  expect((written.at(-1) as { ids: string[] }).ids).toEqual(['local_b'])
  expect((written.at(-1) as { at: number }).at).toBeLessThan(Number.MAX_SAFE_INTEGER)
  await clock.advance(9_000)
  expect((written.at(-1) as { ids: string[] } | null)?.ids).toEqual(['local_b'])
  await clock.advance(2_000)
  expect(written.at(-1)).toBeNull()
  await ui.unmount()
})
