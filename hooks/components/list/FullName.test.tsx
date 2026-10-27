import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord } from '../../../types'

import { LH } from '../../lib/layout'
import { PANE, click, started, warmUp } from '../../testing/world'

const NOW = 3_600_000

const LONG = 'a very long agent task name that keeps going and going well past any single line of the pane so that it has to wrap onto more rows'

const seeded = (on: On, agents: AgentRecord[]) =>
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })

const agent = (id: string, name: string): AgentRecord => ({ id, type: 'master-session:implementer', description: name, name, prompt: 'Build it.', state: 'running', startedAt: NOW - 60_000 })

warmUp()

test('an open card wraps the full name and task and its hit covers the wrapped top; a collapsed row still truncates', async ($, on) => {
  seeded(on, [agent('long', LONG), agent('short', 'short task')])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const wraps = async () => (await ui.findAll({ type: 'Text' })).filter(one => one.text === LONG || one.text === 'short task').map(one => [one.text, one.props.wrap])
  expect(await wraps()).toEqual([[LONG, 'truncate-end'], ['short task', 'truncate-end']])
  const heights = async (id: string) => (await ui.find({ key: `hit-top-${id}` }))?.props.height as number
  await click(ui, 'hit-row-long')
  expect((await wraps()).filter(([text]) => text !== 'short task')).toEqual([[LONG, 'wrap']])
  const long = await heights('long')
  await click(ui, 'hit-top-long')
  await click(ui, 'hit-row-short')
  expect(long).toBeGreaterThanOrEqual((await heights('short')) + 2)
  await ui.unmount()
})
