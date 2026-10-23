import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { boardPath } from './status'
import { BOARD, BOARD_TOOL, HOME, SELF, started, warmUp } from '../testing/world'

warmUp()

const OWN = boardPath(HOME, SELF)
const DOTFILES = `${HOME}/dotfiles`

async function master($: Engine, on: On, repos: string[]) {
  const writes: { path: string; text: string }[] = []
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  const run = await started($, on, { ...BOARD, repos }, { files: { [`${DOTFILES}/.git/index`]: 'i0' } })
  await run.clock.advance(60_000)
  const boards = () => writes.filter(one => one.path === OWN).map(one => JSON.parse(one.text).board.repos as string[])
  return { ...run, boards }
}

test('a board listing ~/dotfiles and a scan finding the absolute path give one repo in the board file', async ($, on) => {
  const run = await master($, on, ['~/dotfiles'])
  const last = run.boards().at(-1) ?? []
  expect(last.filter(path => path.endsWith('/dotfiles'))).toEqual([DOTFILES])
})

test('the same repos in a different scan order cause no second board write', async ($, on) => {
  const run = await master($, on, [`${HOME}/dotfiles`, `${HOME}/Work/toolkit`])
  const before = run.boards().length
  expect(before).toBeGreaterThan(0)
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, repos: [`${HOME}/Work/toolkit`, `${HOME}/dotfiles`] })
  await run.clock.advance(60_000)
  expect(run.boards().length).toBe(before)
})
