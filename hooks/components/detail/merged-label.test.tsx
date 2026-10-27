import { expect, test } from 'claude-code/testing'

import { BOARD_TOOL, GIT, HOME, PANE, click, started, warmUp } from '../../testing/world'

const MAIN = `${HOME}/Work/designer-main`
const TREE = `${HOME}/Work/designer-tree`
const OTHER = `${HOME}/Work/other-repo`
const OFF = 'bbbbbbb'
const ON_OTHER = 'ccccccc'
const ON_TOO = 'ddddddd'

const treesOf = (path: string) => `worktree ${path}\nHEAD d575596be1713c300bf1d8737355ceda0cb3ded3\nbranch refs/heads/main\n\n`

const gitOf = (path: string, extra: Record<string, string> = {}) => ({
  ...GIT,
  [`${path} worktree`]: treesOf(path),
  [`${path} symbolic-ref`]: 'origin/main\n',
  [`${path} rev-parse`]: 'd575596\n',
  [`${path} status`]: '# branch.oid d575596\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n',
  ...extra,
})

const boardOf = (sha: string, cwd = MAIN, repos: string[] = []) => ({ tick: '19:46', sessions: [{ id: 'local_designer', name: 'designer', state: 'done', progress: 'step 1 of 1 — canvas', sha, cwd }], needsYou: [], repos })

const sessionOf = { sessionId: 'local_designer', name: 'designer', title: 'Designer', cwd: MAIN, isRunning: false, isArchived: false, lastActivityAt: '1970-01-01T00:50:00.000Z', startedBy: 'local_validator' }

async function merged($: Parameters<typeof started>[0], on: Parameters<typeof started>[1], board: ReturnType<typeof boardOf>, git: Record<string, string>) {
  const { gits } = await started($, on, board, { git, sessions: [{ ...sessionOf, cwd: board.sessions[0]?.cwd }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_designer')
  const word = (await ui.findAll({ type: 'Text' })).find(one => String(one.text).startsWith('Done: merged to main'))
  await ui.unmount()
  return { word, gits }
}

warmUp()

test('a main-checkout session whose sha is not on base does not read merged', async ($, on) => {
  expect((await merged($, on, boardOf(OFF), gitOf(MAIN))).word).toBeUndefined()
})

test('a main-checkout session whose sha is proven an ancestor of base reads merged', async ($, on) => {
  expect((await merged($, on, boardOf(ON_TOO), gitOf(MAIN, { [`${MAIN} merge-base --is-ancestor ${ON_TOO} refs/heads/main`]: 'ok' }))).word).toBeDefined()
})

test('a sha proven only in another repo does not read merged', async ($, on) => {
  const { word, gits } = await merged($, on, boardOf(ON_OTHER, MAIN, [OTHER]), { ...gitOf(MAIN), ...gitOf(OTHER, { [`${OTHER} merge-base --is-ancestor ${ON_OTHER} refs/heads/main`]: 'ok' }) })
  expect(gits.some(argv => argv[3] === OTHER && argv[4] === 'worktree')).toBe(true)
  expect(gits.filter(argv => argv[4] === 'merge-base').map(argv => argv[3])).toEqual([MAIN])
  expect(word).toBeUndefined()
})

const treeGit = (extra: Record<string, string> = {}) =>
  gitOf(MAIN, {
    [`${TREE} worktree`]: `${treesOf(MAIN)}worktree ${TREE}\nHEAD ${OFF.repeat(5)}\nbranch refs/heads/designer\n\n`,
    [`${TREE} symbolic-ref`]: 'origin/main\n',
    [`${TREE} rev-parse`]: 'd575596\n',
    [`${TREE} status`]: '# branch.oid bbbbbbb\n# branch.head designer\n',
    [`${TREE} rev-list`]: '0\n',
    ...extra,
  })

test('a fresh worktree with no commits and no proof on base does not read merged', async ($, on) => {
  expect((await merged($, on, boardOf(OFF, TREE), treeGit())).word).toBeUndefined()
})

test('a worktree whose sha is proven an ancestor of base reads merged', async ($, on) => {
  expect((await merged($, on, boardOf(ON_TOO, TREE), treeGit({ [`${MAIN} merge-base --is-ancestor ${ON_TOO} refs/heads/main`]: 'ok' }))).word).toBeDefined()
})

test('repeat refreshes add no merge-base call while the base head is unchanged, and re-check only the negatives when it moves', async ($, on) => {
  const shas = Array.from({ length: 20 }, (_, index) => `${index < 10 ? 'e' : 'f'}${String(index).padStart(6, '0')}`)
  const rows = shas.map((sha, index) => ({ id: `local_r${index}`, name: `r${index}`, state: 'done', progress: 'step 1 of 1 — x', sha, cwd: MAIN }))
  const git = gitOf(MAIN, Object.fromEntries(shas.filter((_, index) => index < 10).map(sha => [`${MAIN} merge-base --is-ancestor ${sha} refs/heads/main`, 'ok'])))
  const { gits, clock } = await started($, on, { tick: '19:46', sessions: rows, needsYou: [], repos: [] }, { git, sessions: rows.map(row => ({ ...sessionOf, sessionId: row.id, name: row.name })) })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(1_000)
  const count = () => gits.filter(argv => argv[4] === 'merge-base').length
  const first = count()
  await clock.advance(120_000)
  const second = count()
  git[`${MAIN} rev-parse refs/heads/main`] = 'ffffff1\n'
  await clock.advance(120_000)
  expect([first, second - first, count() - second]).toEqual([20, 0, 10])
  await ui.unmount()
})

test('a new session start forgets proven ancestry, so the next refresh asks git again', async ($, on) => {
  const git = gitOf(MAIN, { [`${MAIN} merge-base --is-ancestor ${ON_TOO} refs/heads/main`]: 'ok' })
  const { gits, clock } = await started($, on, boardOf(ON_TOO), { git, sessions: [sessionOf] })
  const count = () => gits.filter(argv => argv[4] === 'merge-base').length
  expect(count()).toBe(1)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: BOARD_TOOL, ...boardOf(ON_TOO) })
  await clock.settle()
  expect(count()).toBe(2)
})
