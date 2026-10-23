import { expect, test } from 'claude-code/testing'

import { GIT, HOME, PANE, started, warmUp } from '../../testing/world'

const MAIN = `${HOME}/Work/designer-main`
const OTHER = `${HOME}/Work/other-repo`
const ON = 'aaaaaaa'
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

const boardOf = (sha: string) => ({ tick: '19:46', sessions: [{ id: 'local_designer', name: 'designer', state: 'done', progress: 'step 1 of 1 — canvas', sha, cwd: MAIN }], needsYou: [], repos: [] })

const sessionOf = { sessionId: 'local_designer', name: 'designer', title: 'Designer', cwd: MAIN, isRunning: false, isArchived: false, lastActivityAt: '1970-01-01T00:50:00.000Z', startedBy: 'local_validator' }

async function merged($: Parameters<typeof started>[0], on: Parameters<typeof started>[1], sha: string, git: Record<string, string>) {
  await started($, on, boardOf(sha), { git, sessions: [sessionOf] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const word = await ui.find({ type: 'Text', text: 'merged to main' })
  await ui.unmount()
  return word
}

warmUp()

test('a main-checkout session whose sha is not on base does not read merged', async ($, on) => {
  expect(await merged($, on, OFF, gitOf(MAIN))).toBeUndefined()
})

test('a main-checkout session whose sha is proven an ancestor of base reads merged', async ($, on) => {
  expect(await merged($, on, ON_TOO, gitOf(MAIN, { [`${MAIN} merge-base --is-ancestor ${ON_TOO} refs/heads/main`]: 'ok' }))).toBeDefined()
})

test('a sha proven only in another repo does not read merged', async ($, on) => {
  expect(await merged($, on, ON_OTHER, { ...gitOf(MAIN), ...gitOf(OTHER, { [`${OTHER} merge-base --is-ancestor ${ON_OTHER} refs/heads/main`]: 'ok' }) })).toBeUndefined()
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
