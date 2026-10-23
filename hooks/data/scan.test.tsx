import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { GIT_CAP } from '../lib/constants'
import { BOARD, BOARD_TOOL, HOME, PANE, WORKTREE, click, started, warmUp } from '../testing/world'

warmUp()

declare const console: { log: (...values: unknown[]) => void }

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

async function repoOfProbe($: Engine) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'state-probe', requestId: 'state-probe', surface: 'terminal' })
  const repos = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as { base?: string; worktrees: { path: string }[] }[]
  await ui.unmount()
  return repos.find(one => one.worktrees.some(tree => tree.path === WORKTREE))
}

async function dirtyOf($: Engine, path: string) {
  const ui = await $.ui.mount({ ...PANE, plugin: 'state-probe', requestId: 'state-probe', surface: 'terminal' })
  const repos = JSON.parse(String((await ui.find({ type: 'Text' }))?.text)) as { worktrees: { path: string; dirty: number }[] }[]
  await ui.unmount()
  return repos.flatMap(one => one.worktrees).find(one => one.path === path)?.dirty
}

test('a master with nine worktrees runs far fewer git processes a minute than the 100 it ran before', async ($, on) => {
  const { clock, gits } = await master($, on)
  await clock.advance(150_000)
  const from = gits.length
  await clock.advance(120_000)
  const perMinute = (gits.length - from) / 2
  console.log(`GITS_PER_MINUTE ${perMinute}`)
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

test('an edit that leaves the index alone shows on the next forced refresh, never stale', { plugins: [PROBE] }, async ($, on) => {
  const { clock, git } = await master($, on)
  const path = TREES[2] ?? ''
  expect(await dirtyOf($, path)).toBe(0)
  git[`${path} status`] = DIRTY
  await clock.advance(15_000)
  expect(await dirtyOf($, path)).toBe(0)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD })
  await clock.settle()
  expect(await dirtyOf($, path)).toBe(1)
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
  expect(await dirtyOf($, path)).toBe(1)
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
