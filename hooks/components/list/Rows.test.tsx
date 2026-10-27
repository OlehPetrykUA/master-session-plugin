import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord } from '../../../types'

import { CH, LH, across, bodyWidthOf, down, tall } from '../../lib/layout'
import { oneLine } from '../../lib/list'
import { hitPxOf } from '../../lib/rowfit'
import { phaseStrip } from '../../theme/detail'
import { C } from '../../theme/tokens'
import { BOARD, PANE, altsOf, click, hitsOf, started, textsOf, warmUp } from '../../testing/world'

const NOW = 3_600_000

const ASK = { text: 'Allow Bash: rm -rf dist?', since: NOW - 10_000 }

function seeded(on: On, agents: AgentRecord[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const agent = (id: string, more: Partial<AgentRecord>): AgentRecord => ({ id, type: 'master-session:reviewer', description: `review ${id}`, prompt: 'Run the gate.', state: 'running', startedAt: NOW - 60_000, ...more })

warmUp()

test('a subagent waiting on a prompt in a worker chat: a red row with its parent and question, no Open chat, its card says where the prompt waits', async ($, on) => {
  seeded(on, [agent('a1', { asking: ASK, parentSessionId: 'local_setup' })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'row-a1' }))?.props.borderColor).toBe(C.red)
  const texts = await textsOf(ui)
  for (const word of ['Code reviewer', 'review a1', 'Session ›', 'needs you']) expect(texts).toContain(word)
  expect(texts).not.toContain('Allow Bash: rm -rf dist?')
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['needs you']))
  expect(await hitsOf(ui)).not.toContain('hit-chat-a1')
  await click(ui, 'hit-row-a1')
  const card = await textsOf(ui)
  expect(card).toContain('Needs you: it asks to use Bash. Answer in Session · Redo toolkit setup UI’s chat.')
  expect(card.some(text => text.includes('rm -rf'))).toBe(false)
  for (const word of ['Name', 'Status', 'Started by', 'Redo toolkit setup UI']) expect(card.some(text => text.includes(word))).toBe(true)
  expect(await hitsOf(ui)).toContain('hit-top-a1')
  expect((await hitsOf(ui)).filter(one => one.includes('chat') && one.endsWith('a1'))).toEqual([])
  await ui.unmount()
})

test('a press on a subagent chevron chip toggles its row', async ($, on) => {
  seeded(on, [agent('a2', { asking: ASK })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'detail-a2' })).toBeUndefined()
  await click(ui, 'hit-row-a2-chevron')
  expect(await ui.find({ key: 'detail-a2' })).toBeDefined()
  await click(ui, 'hit-top-a2-chevron')
  expect(await ui.find({ key: 'detail-a2' })).toBeUndefined()
  await ui.unmount()
})

test('a subagent of the Validator has no Open chat: the row shows its time and expands, and the card says to answer here', async ($, on) => {
  seeded(on, [agent('a2', { asking: ASK })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await hitsOf(ui)).not.toContain('hit-chat-a2')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Validator ›', 'needs you', '1m']))
  await click(ui, 'hit-row-a2')
  const card = await textsOf(ui)
  expect(card).toContain('Needs you: it asks to use Bash. Answer in this chat.')
  expect(card).toContain('Validator')
  await ui.unmount()
})

test('a nested subagent names its immediate parent and folds the earlier ones; no subagent of a worker offers a chat button, asking or finished', async ($, on) => {
  seeded(on, [
    agent('p1', { type: 'master-session:qa-verifier', description: 'verify a38c72e', parentSessionId: 'local_setup' }),
    agent('k1', { description: 'review a38c72e', parentAgentId: 'p1', asking: ASK }),
    agent('d1', { type: 'master-session:researcher', description: 'find usages', state: 'done', endedAt: NOW - 1_000, result: 'found 3', parentSessionId: 'local_setup' }),
  ])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui)
  for (const word of ['QA verifier', 'Session ›', 'waiting', 'QA verifier ›', 'needs you', 'Researcher']) expect(texts).toContain(word)
  for (const word of ['on Code reviewer · review a38c72e', '… › QA verifier ›', 'found 3']) expect(texts).not.toContain(word)
  expect(await hitsOf(ui)).not.toContain('hit-chat-k1')
  await click(ui, 'hit-row-p1')
  expect(await textsOf(ui)).toContain('Waiting for its subagent “review a38c72e” to finish.')
  await click(ui, 'hit-top-p1')
  await click(ui, 'hit-row-d1')
  expect((await textsOf(ui)).some(text => /^Done in 59s: found 3\./.test(text))).toBe(true)
  expect(await hitsOf(ui)).not.toContain('hit-parent-chat-d1')
  await ui.unmount()
})

test('a done session with a ready sha reads waiting on its row; its Status says it waits for QA with the gate, and no Ready callout is drawn', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done', sha: '4e431f7', tests: ['tsc', 'plugin test'] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await altsOf(ui)).toContain('ready for verify')
  expect(await textsOf(ui)).toContain('waiting')
  await click(ui, 'hit-row-local_setup')
  const texts = await textsOf(ui)
  expect(texts).not.toContain('READY FOR VERIFY')
  expect(texts.some(text => /^Waiting for QA: ready at 4e431f7/.test(text))).toBe(true)
  await ui.unmount()
})

test('an archived card shows Name, Status, Archived and Git, then Open and Unarchive; the confirm takes the buttons’ place', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-row-local_old')
  const texts = await textsOf(ui)
  for (const word of ['Name', 'Status', 'Archived', 'Git', 'Open', 'Unarchive']) expect(texts).toContain(word)
  for (const word of ['Last', 'Worktree', 'Model', 'Time']) expect(texts).not.toContain(word)
  expect(texts.some(text => /^Archived 10m ago/.test(text))).toBe(true)
  expect(texts.some(text => /^archived \d\d:\d\d$/.test(text))).toBe(true)
  expect(await altsOf(ui)).toEqual(expect.arrayContaining(['archived', 'collapse']))
  await click(ui, 'hit-unarchive-local_old')
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Unarchive Remove the stale mod?', 'It comes back in its group with its chat. Its worktree is made again on its next turn.', 'Cancel']))
  expect(await hitsOf(ui)).not.toContain('hit-unarchive-local_old')
  await click(ui, 'hit-unarchive-no-local_old')
  expect(await hitsOf(ui)).toContain('hit-unarchive-local_old')
  await ui.unmount()
})

test('a finished run’s strip greys its done share and keeps failures red; a run waiting on an answer greys done and reds the asking share; a running run fills green', () => {
  const finished = phaseStrip(300, [{ done: 5, running: 0, failed: 1, asking: 0, total: 6, isFinished: true }])
  expect(finished).toContain('fill:var(--grey)')
  expect(finished).toContain('fill:var(--red)')
  expect(finished).not.toContain('fill:var(--green)')
  expect(phaseStrip(300, [{ done: 1, running: 1, failed: 0, asking: 0, total: 3, isFinished: false }])).toContain('fill:var(--green)')
  const asking = phaseStrip(300, [{ done: 1, running: 2, failed: 0, asking: 1, total: 3, isFinished: false }])
  expect(asking).toContain('fill:var(--grey)')
  expect(asking).toContain('fill:var(--red)')
  expect(asking).not.toContain('fill:var(--green)')
})

test('every row ends in a chevron: expand while closed, collapse on the card top; the summary needs block reds only its border, tint and glyph; the active chip is semibold', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const inside = async (key: string) => JSON.stringify((await ui.find({ key }))?.children ?? null)
  expect((await ui.find({ key: 'row-local_setup-chevron' }))?.props).toEqual(expect.objectContaining({ width: across(24), height: tall(24), flexShrink: 0, borderStyle: 'round', borderColor: C.clear }))
  expect(await inside('row-local_setup-chevron')).toContain('"alt":"expand"')
  expect(await inside('row-local_setup-chevron')).toContain('M6 9l6 6 6-6')
  expect(await inside('row-local_setup-chevron')).toContain('stroke:var(--muted);stroke-width:2;')
  expect(await inside('row-local_env-chevron')).toContain('"alt":"expand"')
  const needs = await ui.find({ key: 'block-needs-you' })
  expect(needs?.props).toEqual(expect.objectContaining({ borderColor: C.red, backgroundColor: C.redTint }))
  expect(await inside('block-needs-you')).toContain('"alt":"needs"')
  expect(await inside('block-needs-you')).toContain('stroke:var(--red);stroke-width:2.2;')
  for (const text of ['Needs you', '1 session']) expect((await ui.findAll({ type: 'Text', text })).every(one => one.props.color !== C.red)).toBe(true)
  expect(String((await ui.findAll({ type: 'Svg' })).find(one => one.props.alt === 'Needs you 1')?.props.source)).not.toContain('var(--red)')
  await click(ui, 'hit-row-local_setup')
  expect(await inside('top-local_setup-chevron')).toContain('"alt":"collapse"')
  expect(await inside('top-local_setup-chevron')).toContain('M6 15l6-6 6 6')
  expect(await inside('top-local_setup-chevron')).toContain('stroke:var(--muted);stroke-width:2;')
  await ui.unmount()
  const plain = await $.ui.mount({ ...PANE, surface: 'vscode' })
  const all = await plain.findAll({ type: 'Text', text: 'All' })
  expect(all.length).toBeGreaterThan(0)
  expect(all.every(one => one.props.weight === 'semibold')).toBe(true)
  await plain.unmount()
})

test('every toggle header lights as one: row and card top, session and needs-you subagent, share a scope; the chip shows and the chevron brightens; the body stays out', async ($, on) => {
  seeded(on, [agent('a1', { asking: ASK, parentSessionId: 'local_setup' })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  type Node = { props?: Record<string, unknown>; hover?: unknown; children?: unknown[] }
  const walk = (node: unknown, key: string): Node | undefined => {
    const one = node as Node
    if (!one || typeof one !== 'object') return undefined
    if (one.props?.key === key) return one
    for (const child of one.children ?? []) {
      const hit = walk(child, key)
      if (hit) return hit
    }
    return undefined
  }
  const check = async (head: string, id: string, isTop: boolean, isNeeds: boolean) => {
    const scope = `toggle-${head}-${id}`
    const tree = await ui.drawn()
    const box = walk(tree, `${head}-${id}`)
    expect(box?.hover).toEqual(isTop ? { scope, backgroundColor: C.tileHover } : { scope, backgroundColor: C.tileHover, borderColor: isNeeds ? C.red : C.accentRing })
    expect(box?.props).toEqual(expect.objectContaining({ borderStyle: 'round', paddingTop: down(isTop ? 4 : 8), paddingLeft: across(isTop ? 8 : 12), paddingRight: across(isTop ? 0 : 4) }))
    const chip = walk(tree, `${head}-${id}-chevron`)
    expect(chip?.hover).toEqual({ scope, backgroundColor: C.hoverBg, borderColor: C.borderStrong })
    expect(chip?.props?.backgroundColor).toBeUndefined()
    const hot = walk(tree, `${head}-${id}-chevron-hot`)
    expect(hot?.props).toEqual(expect.objectContaining({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, display: 'none' }))
    expect(hot?.hover).toEqual({ scope, display: 'flex' })
    expect(JSON.stringify(hot?.children)).toContain('stroke:var(--text);stroke-width:2;')
  }
  await check('row', 'local_setup', false, false)
  await check('row', 'a1', false, true)
  await click(ui, 'hit-row-local_setup')
  await check('top', 'local_setup', true, false)
  await click(ui, 'hit-top-local_setup')
  await click(ui, 'hit-row-a1')
  await check('top', 'a1', true, true)
  expect((await ui.find({ key: 'top-a1' }))?.props).toEqual(expect.objectContaining({ marginTop: down(3), marginLeft: across(3), borderColor: C.clear, minHeight: tall(50) }))
  expect(walk(await ui.drawn(), 'body-a1')?.hover).toBeUndefined()
  await ui.unmount()
})

test('a long id caps the toggle scope at 64 characters, shared by the header, chip and bright chevron', async ($, on) => {
  const id = 'x'.repeat(80)
  seeded(on, [agent(id, { asking: ASK })])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const find = (node: unknown, key: string): { hover?: { scope?: string }; children?: unknown[]; props?: Record<string, unknown> } | undefined => {
    const one = node as { props?: Record<string, unknown>; children?: unknown[] }
    if (!one || typeof one !== 'object') return undefined
    if (one.props?.key === key) return one
    for (const child of one.children ?? []) {
      const hit = find(child, key)
      if (hit) return hit
    }
    return undefined
  }
  const tree = await ui.drawn()
  const scopes = [`row-${id}`, `row-${id}-chevron`, `row-${id}-chevron-hot`].map(key => find(tree, key)?.hover?.scope)
  expect(scopes).toEqual([`toggle-row-${id}`.slice(0, 64), `toggle-row-${id}`.slice(0, 64), `toggle-row-${id}`.slice(0, 64)])
  expect(scopes[0]?.length).toBe(64)
  await ui.unmount()
})

test('an open archived card or workflow agent card counts as expanded, so the pane can scroll to its end', async ($, on) => {
  seeded(on, [{ id: 'w1', type: 'workflow-subagent', description: 'review:bugs', state: 'running', startedAt: NOW - 30_000, run: { id: 'wf_1', index: 1 } }])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const drawn = async () => String(((await $.tool.call({ tool: 'mcp__master-session__scroll', to: 'section-expanded' })) as { deny?: string }).deny ?? '')
  expect(await drawn()).toContain('section-expanded is not drawn')
  await click(ui, 'hit-row-wf_1')
  await click(ui, 'hit-row-w1')
  expect(await ui.find({ key: 'detail-w1' })).toBeDefined()
  expect(await drawn()).not.toContain('is not drawn')
  await click(ui, 'hit-chip-archived')
  await click(ui, 'hit-row-local_old')
  expect(await ui.find({ key: 'detail-local_old' })).toBeDefined()
  expect(await drawn()).not.toContain('is not drawn')
  await ui.unmount()
})

test('long multi-line tests and activity draw as one truncated line each: tests dedupe into one row of chips with +N more, nothing spills into the next item', async ($, on) => {
  const script = 'cd "$HOME/.claude/worktrees/wt-x"\nL=$(mktemp)\ntsc -p . --noEmit > "$L" 2>&1\necho "tsc exit $?"\ncat "$L"\nrm "$L"'
  const tests = ['tsc · passed', 'persona.test · exit 0', 'persona.test · exit 0', 'plugin test · passed · 212 pass', 'one', 'two', script]
  const activity = [`Bash ${script} · 2m`, 'Read hooks/lib/band.ts · 1m']
  const path = 'hooks/lib/\nband.ts'
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], tests, activity, commits: [`abc1234 ${script}`], files: [path] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  const flat = script.replace(/\s+/g, ' ')
  const keys = (await ui.findAll({ type: 'Box' })).flatMap(box => (box.key?.startsWith('test-local_setup-') ? [box.key] : []))
  const texts = await textsOf(ui)
  const more = texts.find(text => /^\+\d+ more$/.test(text))
  expect(keys.length + Number(more?.slice(1).split(' ')[0] ?? 0)).toBe(6)
  expect(texts.filter(text => text === 'persona.test · exit 0').length).toBeLessThanOrEqual(1)
  expect((await ui.find({ key: 'tests-pills-local_setup' }))?.props).toEqual(expect.objectContaining({ height: tall(24) }))
  expect((await ui.find({ key: 'tests-pills-local_setup' }))?.props.flexWrap).toBeUndefined()
  expect(texts.some(text => text.includes('\n'))).toBe(false)
  const lines = (await ui.findAll({ type: 'Text' })).filter(one => String(one.text ?? '').includes('mktemp') && one.props.wrap !== undefined)
  expect(lines.length).toBe(1)
  expect(texts).toContain('Read hooks/lib/band.ts')
  expect(lines.every(one => one.props.wrap === 'truncate-end')).toBe(true)
  expect((await ui.find({ key: 'commit-local_setup-0' }))?.props.minWidth).toBe(0)
  const file = (await ui.findAll({ type: 'Text' })).find(one => one.text === oneLine(path))
  expect(file?.props.wrap).toBe('truncate-middle')
  expect(lines.map(one => String(one.text))).toEqual(expect.arrayContaining([flat]))
  expect((await ui.find({ key: 'test-local_setup-0' }))?.props).toEqual(expect.objectContaining({ height: tall(24), minWidth: 0, flexShrink: 1 }))
  await ui.unmount()
})

test('a task, a needs question and a status line with newlines each draw on one line, and the question and the status line are not on the row', async ($, on) => {
  seeded(on, [agent('a9', { description: 'band\ndiff', asking: { text: 'Allow\nBash: rm -rf dist?', since: NOW - 10_000 } })])
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], now: 'waiting\nfor the go' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = await textsOf(ui)
  expect(texts).toContain('band diff')
  for (const word of ['Allow Bash: rm -rf dist?', 'waiting for the go']) expect(texts).not.toContain(word)
  expect(texts.some(text => text.includes('\n'))).toBe(false)
  await click(ui, 'hit-row-local_setup')
  expect(await textsOf(ui)).toContain('Waiting: waiting for the go.')
  await ui.unmount()
})

test('the Status sentence names the checks the gate passed as a count and never the test names, whatever the tests hold', async ($, on) => {
  const script = 'cd "$HOME/x"\nL=$(mktemp)\ntsc -p .'
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], state: 'done', sha: '4e431f7', tests: [script, 'plugin test'] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  const sentence = (await textsOf(ui)).find(text => text.startsWith('Waiting for QA: ready at 4e431f7'))
  expect(sentence).toBeDefined()
  expect(String(sentence)).not.toContain('mktemp')
  await ui.unmount()
})

test('a status line with newlines stays one line on a narrow row and in the terminal pane; line 2 holds the word only', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], now: 'waiting\nfor the go' }] })
  const narrow = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  expect(await textsOf(narrow)).toEqual(expect.arrayContaining(['waiting', '40m']))
  expect((await textsOf(narrow)).some(text => text.includes('\n'))).toBe(false)
  await narrow.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await textsOf(terminal)).toEqual(expect.arrayContaining(['opus · 40m · 2/5', 'waiting']))
  expect((await textsOf(terminal)).some(text => text.includes('\n'))).toBe(false)
  await terminal.unmount()
})

test('AC7: the press target of a needs-you row is its drawn 56 px and a card top is 50 px, whatever the question', async ($, on) => {
  const ask = 'Approve the settings.json edit and then restart every hook so that the new rules apply to all workers'
  await started($, on, { ...BOARD, sessions: BOARD.sessions.map(one => (one.id === 'local_env' ? { ...one, needsYou: ask } : one)) })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const width = bodyWidthOf(60)
  const size = async (key: string) => {
    const props = (await ui.find({ key }))?.props
    return [props?.width, props?.height]
  }
  expect((await ui.find({ key: 'row-local_env' }))?.props.minHeight).toBe(tall(56))
  expect(await size('hit-row-local_env')).toEqual([Math.ceil(width / CH), Math.ceil(56 / LH)])
  expect([hitPxOf(56, false), hitPxOf(56, true)]).toEqual([56, 50])
  await click(ui, 'hit-row-local_env')
  expect((await ui.find({ key: 'top-local_env' }))?.props.minHeight).toBe(tall(50))
  expect(await size('hit-top-local_env')).toEqual([Math.ceil((width - 6) / CH), Math.ceil(50 / LH)])
  await ui.unmount()
})
