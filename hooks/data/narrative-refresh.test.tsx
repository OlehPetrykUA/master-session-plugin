import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { TICK_MS } from '../lib/constants'
import { CREDENTIALS } from '../testing/credentials'
import { BOARD, BOARD_TOOL, HOME, PANE, SPAWN, childOf, click, started, warmUp, world } from '../testing/world'
import type { Ui } from '../testing/world'

warmUp()

const OLD = 'Two workers are running. env-e2e-test needs you to approve a settings edit. Nothing else is pending.'
const FRESH = 'env-e2e-test is waiting on you for the settings edit while a docs lookup runs. Next: commit once approved. Approve the settings edit.'
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const FAILED = { isAnswered: false as const, reason: 'api-error' as const, status: 500, error: 'server_error' as const, usage: USAGE }

type Asked = { model: string; prompt: string; system?: string; effort?: string; maxTokens?: number; timeoutMs?: number }

function model(on: On, reply: (count: number) => Promise<unknown> | unknown = () => ({ isAnswered: true, text: FRESH, usage: USAGE })) {
  const asked: Asked[] = []
  on('model.complete', async (_, e) => {
    if (String(e.system ?? '').startsWith('Describe this task')) return { value: FAILED }
    asked.push(e as Asked)
    return { value: (await reply(asked.length)) as never }
  })
  on('agent.spawn', (_, e) => ({ model: 'claude-haiku-5-5', agentId: `a${e.description}` }))
  on('agent.list', () => ({ value: [] }))
  return asked
}

const spawn = ($: Engine, description: string, prompt = 'Read the docs.') => $.agent.spawn({ ...SPAWN, description, prompt, subagentType: 'Explore' })

async function pane($: Engine) {
  return $.ui.mount({ ...PANE, surface: 'desktop' })
}

async function shown(ui: Ui) {
  const texts = (await ui.findAll({ type: 'Text' })).map(one => String(one.text))
  const age = texts.findIndex(one => one.startsWith('written '))
  return { text: texts.slice(0, age).join(' '), age: texts[age] }
}

async function master($: Engine, on: On, reply?: (count: number) => Promise<unknown> | unknown) {
  const asked = model(on, reply)
  const run = await started($, on, { ...BOARD, narrative: OLD })
  await run.clock.advance(TICK_MS)
  return { ...run, asked }
}

test('a state change rewrites the narrative with one haiku call and the age restarts', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  await run.clock.advance(180_000)
  expect(await shown(ui)).toEqual({ text: OLD, age: 'written 3m ago' })
  await spawn($, 'Docs lookup')
  await run.clock.advance(TICK_MS)
  expect(run.asked).toHaveLength(1)
  const [one] = run.asked
  expect([one?.model, one?.effort, one?.maxTokens, one?.timeoutMs]).toEqual(['haiku', 'low', 220, 20_000])
  expect(one?.prompt).toContain(OLD)
  expect(one?.prompt).toContain('env-e2e-test')
  expect(one?.prompt).toContain('Docs lookup')
  expect(await shown(ui)).toEqual({ text: FRESH, age: 'written just now' })
  await ui.unmount()
})

test('no change makes no call', async ($, on) => {
  const run = await master($, on)
  await run.clock.advance(300_000)
  expect(run.asked).toHaveLength(0)
})

test('two changes inside 60 seconds make one call', async ($, on) => {
  const run = await master($, on)
  await spawn($, 'first')
  await run.clock.advance(TICK_MS)
  await spawn($, 'second')
  await run.clock.advance(30_000)
  expect(run.asked).toHaveLength(1)
  await run.clock.advance(30_000)
  expect(run.asked).toHaveLength(2)
})

test('a closed pane makes no call', async ($, on) => {
  const asked = model(on)
  const run = await started($, on, { ...BOARD, narrative: OLD }, { isPaneOpen: false })
  await run.clock.advance(TICK_MS)
  await spawn($, 'Docs lookup')
  await run.clock.advance(120_000)
  expect(asked).toHaveLength(0)
})

test('a normal chat makes no model call', async ($, on) => {
  const asked = model(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await spawn($, 'Docs lookup')
  await run.clock.advance(300_000)
  expect(asked).toHaveLength(0)
})

test('a worker makes no model call', async ($, on) => {
  const asked = model(on)
  on('fs.write', () => ({ value: undefined }))
  const run = world(on, { ...childOf(3_600_000), isPaneOpen: true })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  await spawn($, 'Docs lookup')
  await run.clock.advance(300_000)
  expect(asked).toHaveLength(0)
})

test('a newer narrative from the board call wins over the refreshed one', async ($, on) => {
  const run = await master($, on)
  const ui = await pane($)
  await spawn($, 'Docs lookup')
  await run.clock.advance(TICK_MS)
  expect((await shown(ui)).text).toBe(FRESH)
  const mine = 'The board call wrote this newer text. Nothing needs you.'
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, narrative: mine })
  expect(await shown(ui)).toEqual({ text: mine, age: 'written just now' })
  await run.clock.advance(TICK_MS)
  expect((await shown(ui)).text).toBe(mine)
  await ui.unmount()
})

test('a board call that lands while the model works discards the late reply', async ($, on) => {
  let release = () => undefined as void
  const run = await master($, on, () => new Promise(done => (release = () => done({ isAnswered: true, text: FRESH, usage: USAGE }))))
  const ui = await pane($)
  await spawn($, 'Docs lookup')
  await run.clock.advance(TICK_MS)
  const mine = 'The board call wrote this while the model worked. Nothing needs you.'
  await $.tool.call({ tool: BOARD_TOOL, ...BOARD, narrative: mine })
  release()
  await run.clock.advance(TICK_MS)
  expect((await shown(ui)).text).toBe(mine)
  await ui.unmount()
})

test('a long reply with a control character shows cleaned and cut to 500 characters plus an ellipsis', async ($, on) => {
  const long = `A\u0001${'word '.repeat(150)}`
  const run = await master($, on, () => ({ isAnswered: true, text: long, usage: USAGE }))
  const ui = await pane($)
  await spawn($, 'Docs lookup')
  await run.clock.advance(TICK_MS)
  await click(ui, 'hit-narrative-more')
  await run.clock.settle()
  const text = (await shown(ui)).text
  expect(text.startsWith('Aword word')).toBe(true)
  expect(text.endsWith('…')).toBe(true)
  expect(Array.from(text)).toHaveLength(501)
  expect(text).not.toContain('\u0001')
  await ui.unmount()
})

test('a failed call keeps the old text and its age', async ($, on) => {
  const run = await master($, on, () => FAILED)
  const ui = await pane($)
  await run.clock.advance(120_000)
  await spawn($, 'Docs lookup')
  await run.clock.advance(TICK_MS)
  expect(run.asked).toHaveLength(1)
  expect(await shown(ui)).toEqual({ text: OLD, age: 'written 2m ago' })
  await ui.unmount()
})

test('the text sent to the model holds no prompt, command or credential', async ($, on) => {
  const run = await master($, on)
  const commands = CREDENTIALS.map(one => one[1])
  await spawn($, 'Docs lookup', `Run these: ${commands.join(' ; ')}`)
  await run.clock.advance(TICK_MS)
  expect(run.asked).toHaveLength(1)
  const sent = `${run.asked[0]?.system}\n${run.asked[0]?.prompt}`
  expect(sent).not.toContain('Run these')
  for (const [, command, secrets] of CREDENTIALS) {
    expect(sent).not.toContain(command)
    for (const secret of secrets) expect(sent).not.toContain(secret)
  }
})
