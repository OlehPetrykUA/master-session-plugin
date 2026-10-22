import { expect, test } from 'claude-code/testing'

import { BAND, HOME, PANE, altsOf, childOf, click, started, textsOf, typed, world } from './testing/world'

test('/master-session:start status opens the pane; with a task it also runs the skill', async ($, on) => {
  const { opened, ran, clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await $.command.run(typed('master-session:start', 'status'))).text).toBe('Master session pane opened.')
  expect(ran).toEqual([])
  expect((await $.command.run(typed('master-session:start', 'fix the hooks'))).text).toBe('skill ran')
  expect(ran).toEqual(['master-session:start fix the hooks'])
  expect((await $.command.run(typed('start', 'status'))).text).toBe('skill ran')
  expect(opened).toEqual(['master-session', 'master-session'])
})

test('/master-session:info opens the pane without running its skill, and ask asks the workers', async ($, on) => {
  const { opened, ran, clock } = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect((await $.command.run(typed('master-session:info', ''))).text).toBe('Master session pane opened.')
  expect(opened).toEqual(['master-session'])
  expect((await $.command.run(typed('master-session:info', 'ask'))).text).toMatch(/^No running workers to ask|^Asked \d+ running worker/)
  expect(opened).toEqual(['master-session'])
  expect(ran).toEqual([])
})

test('the skill prompt says the pane is on and points at the board tool', async ($, on) => {
  const { clock } = world(on)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await clock.settle()
  const plugin = await $.skill.prompt({ skill: 'master-session:start', text: 'Validator mode.', frontmatter: {}, source: 'plugin' })
  expect(plugin.text).toContain('Status pane: on. Publish every board with the mcp__master-session__board tool')
  const bare = await $.skill.prompt({ skill: 'start', text: 'Start.', frontmatter: {}, source: 'userSettings' })
  expect(bare.text).toBe('Start.')
  const other = await $.skill.prompt({ skill: 'commit', text: 'Commit.', frontmatter: {}, source: 'userSettings' })
  expect(other.text).toBe('Commit.')
})

test('a master board older than 30 minutes is ignored', async ($, on) => {
  const run = world(on, childOf(0))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.advance(3_000)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await altsOf(band)).toEqual([])
  expect((await band.find({ type: 'Text', text: 'engine' }))?.text).toBe('engine')
  await band.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await textsOf(ui)).not.toContain('from Orbit Agents Toolkit Validator')
  await ui.unmount()
})

test('the scroll tool moves the desktop pane to every drawn section and refuses the others', async ($, on) => {
  const landed: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    landed.push(e.offset)
    return { value: {} }
  }) as never)
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const raise = $.ui as unknown as { scroll: (input: unknown) => Promise<unknown> }
  const move = async (to: string) => {
    const answer = (await $.tool.call({ tool: 'mcp__master-session__scroll', to })) as { result?: string; deny?: string }
    const text = String(answer.result ?? answer.deny)
    const row = Number(/\(row (\d+)\)/.exec(text)?.[1] ?? -1)
    expect(text).toBe(`Not scrolled (row ${row}): no implementation for ui.scroll`)
    landed.length = 0
    await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 400, origin: { kind: 'plugin', name: 'master-session' } })
    expect(landed).toEqual([row])
    return row
  }
  expect(String(((await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'nowhere' })) as { deny?: string }).deny)).toContain('section-tiles')
  const header = await move('section-header')
  const chips = await move('section-chips')
  const tiles = await move('section-tiles')
  expect(header).toBe(0)
  expect(chips).toBe(0)
  expect(tiles).toBeGreaterThan(chips)
  for (const key of ['section-expanded', 'section-archived', 'section-summary']) {
    const answer = (await $.tool.call({ tool: 'mcp__master-session__scroll', to: key })) as { deny?: string }
    expect(String(answer.deny)).toContain(`${key} is not drawn`)
  }
  await click(ui, 'hit-tile-local_env')
  expect(await move('section-expanded')).toBe(tiles)
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 7, by: 7, bodyRows: 20, contentRows: 400, origin: { kind: 'plugin', name: 'master-session' } })
  expect(landed.at(-1)).toBe(7)
  const asked = await move('section-tiles')
  await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-tiles' })
  landed.length = 0
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 0, by: 0, bodyRows: 20, contentRows: 22, origin: { kind: 'plugin', name: 'master-session' } })
  expect(landed).toEqual([asked])
  await ui.unmount()
})

test('a person scroll passes through the pane hook untouched', async ($, on) => {
  const offsets: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    offsets.push(e.offset)
    return { value: {} }
  }) as never)
  await started($, on)
  await $.ui.mount({ ...PANE, surface: 'desktop' })
  const raise = $.ui as unknown as { scroll: (input: unknown) => Promise<unknown> }
  await raise.scroll({ component: 'Pane', requestId: 'master-session', offset: 3, by: 3, bodyRows: 20, contentRows: 80, origin: { kind: 'person' } })
  expect(offsets).toEqual([3])
})
