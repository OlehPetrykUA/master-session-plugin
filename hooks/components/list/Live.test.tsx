import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { AgentRecord } from '../../../types'

import { CH, LH, across, bodyWidthOf, down, faceWidth, tall, textWidth } from '../../lib/layout'
import { boardFromJson } from '../../lib/board'
import { rowsOf } from '../../lib/list'
import { blocksOf } from '../../lib/list'
import type { RunSummary } from '../../lib/totals'
import { tileInnerOf } from '../../lib/sections'
import { subOf } from './Summary'
import { C } from '../../theme/tokens'
import { BOARD, BOARD_TOOL, HOME, PANE, SELF, WORKTREE, altsOf, childOf, click, hitsOf, pluginScroll, started, textsOf, warmUp, world } from '../../testing/world'

const BASH = `Allow Bash: P=/Users/opetryk/Work/master-session-plugin; W="$HOME/.claude/worktrees/wt-master-session-plugin-band-v3"; git -C $P merge-base --is-ancestor 9bd146ce23c7d6485d main && git -C "$W" log --oneline -5 && git -C "$W" status --porcelain=v2 --branch --untracked-files=all`

const PROMPT = Array.from({ length: 35 }, (_, index) => `${index + 1}. Re-run the gate in /Users/opetryk/.claude/worktrees/wt-master-session-plugin-live-polish and report each command's exit code.`).join('\n')

const OLD = Array.from({ length: 20 }, (_, index) => ({
  sessionId: `local_old${index}`,
  name: `old-work-${index}`,
  title: `Implementer · Old work ${index}`,
  cwd: `${HOME}/.claude/worktrees/wt-master-session-plugin-old-${index}`,
  isRunning: false,
  isArchived: true,
  lastActivityAt: '1970-01-01T00:20:00.000Z',
  startedBy: SELF,
}))

declare const performance: { now: () => number }

const svgChars = (node: unknown): number =>
  Array.isArray(node)
    ? node.reduce((sum: number, one) => sum + svgChars(one), 0)
    : node && typeof node === 'object'
      ? Object.entries(node as Record<string, unknown>).reduce((sum: number, [key, value]) => sum + (key === 'source' && typeof value === 'string' ? value.length : svgChars(value)), 0)
      : 0

function seeded(on: On, agents: AgentRecord[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const linked = (sessionId: string, name: string, title: string) => ({ sessionId, name, title, cwd: WORKTREE, isRunning: true, isArchived: false, lastActivityAt: '1970-01-01T00:59:00.000Z', startedBy: SELF })

const asking = (id: string, name: string, needsYou: string) => ({ ...BOARD, sessions: [{ id, name, state: 'needs-you', progress: 'step 1 of 2 — fix', needsYou }, BOARD.sessions[1]] })

warmUp()

test('a needs-you row at the real pane width: the question takes two rows, the second ending in "…", with home as ~; Open chat goes icon-only because the task would show fewer than 12 characters beside its label', async ($, on) => {
  await started($, on, asking('local_impl', 'verify-personas', BASH.replaceAll('/Users/opetryk', HOME)), { sessions: [linked('local_impl', 'verify-personas', 'Implementer · Prompt status data')] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 46 } })
  const rows = await ui.findAll({ type: 'Text' })
  const asked = rows.filter(one => one.props.color === C.red && one.props.wrap === 'truncate-end').map(one => String(one.text))
  expect(asked.length).toBe(2)
  expect(asked[0]?.startsWith('Allow Bash: P=~/Work/')).toBe(true)
  expect(asked[1]?.endsWith('…')).toBe(true)
  expect(asked.join(' ')).not.toContain(HOME)
  expect((await ui.find({ key: 'face-chat-local_impl' }))?.props.width).toBe(across(32))
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Implementer', 'Prompt status data']))
  await ui.unmount()
})

test('Open chat keeps its label when the task fits whole beside it, or when at least 12 of its characters still show; below that it is icon-only, and always below 340 px', async ($, on) => {
  await started($, on, BOARD, { sessions: [linked('local_pane', 'pane-v2', 'Designer · Pane v2'), linked('local_long', 'prompt-data', 'Implementer · Prompt status data and more')] })
  const face = async (id: string, bodyColumns: number) => {
    await $.tool.call({ tool: BOARD_TOOL, ...asking(id, id, BASH) })
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns } })
    const width = (await ui.find({ key: `face-chat-${id}` }))?.props.width
    await ui.unmount()
    return width === across(32) ? 'icon' : 'label'
  }
  const room = (bodyColumns: number) => bodyWidthOf(bodyColumns) - 94 - faceWidth('Open chat', 'b32') - 1 - 12 - (4 + 4 + 12 + 4 + textWidth('opus', 12))
  const shown = (persona: string, task: string, bodyColumns: number) => rowsOf(task, room(bodyColumns) - textWidth(persona, 14, { isBold: true }) - 8 - textWidth('·', 14), 14, 1)[0] ?? ''
  expect(shown('Designer', 'Pane v2', 52)).toBe('Pane v2')
  expect(await face('local_pane', 52)).toBe('label')
  const cut = shown('Implementer', 'Prompt status data and more', 64)
  expect([cut.endsWith('…'), Array.from(cut).length - 1 >= 12]).toEqual([true, true])
  expect(await face('local_long', 64)).toBe('label')
  expect(Array.from(shown('Implementer', 'Prompt status data and more', 60)).length - 1).toBeLessThan(12)
  expect(await face('local_long', 60)).toBe('icon')
  expect(Array.from(shown('Implementer', 'Prompt status data and more', 52)).length - 1).toBeLessThan(12)
  expect(await face('local_long', 52)).toBe('icon')
  expect(await face('local_pane', 40)).toBe('icon')
})

test('splitting a 20,000-character prompt into 4 rows ends in an ellipsis, and every row fits', () => {
  const prompt = 'Re-run the gate and report each exit code. '.repeat(470)
  expect(prompt.length).toBeGreaterThan(20_000)
  const rows = rowsOf(prompt, 300, 12, 4)
  expect(rows.length).toBe(4)
  expect(rows.at(-1)?.endsWith('…')).toBe(true)
  for (const row of rows) expect(textWidth(row, 12)).toBeLessThanOrEqual(300)
})

test('the Archived filter with 20 archived sessions draws the header, the chips and every archived row; the pinned header covers only its own rows', async ($, on) => {
  await started($, on, BOARD, { sessions: OLD })
  await $.tool.call({ tool: 'mcp__master-session__open', archived: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 30, bodyRows: 40 } } })
  expect((await ui.find({ key: 'section-header' }))?.text).toContain('Master session')
  expect(await hitsOf(ui)).toEqual(expect.arrayContaining(['hit-chip-all', 'hit-chip-archived', 'hit-row-local_old0', 'hit-row-local_old19']))
  expect(await textsOf(ui)).toEqual(expect.arrayContaining(['Implementer', 'Old work 19']))
  const pin = await ui.find({ key: 'header-pin' })
  expect(pin?.props.backgroundColor).toBeUndefined()
  expect((await ui.find({ key: 'header-band' }))?.props.backgroundColor).toBe('composerSidebarBackground')
  expect(svgChars(await ui.drawn())).toBeLessThan(100_000)
  await ui.unmount()
})

test('every open call moves the pane back to the top, or to the expanded card', async ($, on) => {
  const landed: number[] = []
  on('ui.scroll', ((_: unknown, e: { offset: number }) => {
    landed.push(e.offset)
    return { value: {} }
  }) as never)
  await started($, on)
  const raise = () => pluginScroll($, { offset: 30, by: 0, bodyRows: 2, contentRows: 400 })
  await $.tool.call({ tool: 'mcp__master-session__open' })
  await raise()
  expect(landed.at(-1)).toBe(0)
  await $.tool.call({ tool: 'mcp__master-session__open', expand: 'local_setup' })
  await raise()
  expect(Number(landed.at(-1))).toBeGreaterThan(0)
  expect(Number(landed.at(-1))).toBeLessThan(30)
})

test('the press target spans the header: a row its full width and height, a card top the same less its 3 px margins', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const width = bodyWidthOf(60)
  const size = async (key: string) => {
    const props = (await ui.find({ key }))?.props
    return [props?.width, props?.height]
  }
  expect(await size('hit-row-local_setup')).toEqual([Math.ceil(width / CH), Math.ceil(56 / LH)])
  await click(ui, 'hit-row-local_setup')
  expect(await size('hit-top-local_setup')).toEqual([Math.ceil((width - 6) / CH), Math.ceil(50 / LH)])
  await ui.unmount()
})

test('a press on the chevron chip toggles the row like the header: the chip carries its own press target', async ($, on) => {
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await click(ui, 'hit-row-local_setup-chevron')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeDefined()
  await click(ui, 'hit-top-local_setup-chevron')
  expect(await ui.find({ key: 'detail-local_setup' })).toBeUndefined()
  await ui.unmount()
})

test('the expanded card draws its top as the row: a 3 px inset from the card border, the same content place', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], title: 'Implementer · Archive safety for side sessions in other repos' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = (await ui.find({ key: 'row-local_setup' }))?.props
  await click(ui, 'hit-row-local_setup')
  expect((await ui.find({ key: 'detail-local_setup' }))?.props).toEqual(expect.objectContaining({ paddingX: 0, paddingY: 0, borderStyle: 'round' }))
  const top = (await ui.find({ key: 'top-local_setup' }))?.props
  expect(top?.gap).toBe(row?.gap)
  expect(top).toEqual(expect.objectContaining({ marginTop: down(3), marginBottom: down(3), marginLeft: across(3), marginRight: across(3), paddingTop: down(4), paddingBottom: down(4), paddingLeft: across(8), paddingRight: across(0), minHeight: tall(50), borderStyle: 'round', borderColor: C.clear }))
  expect(row).toEqual(expect.objectContaining({ paddingTop: down(8), paddingBottom: down(8), paddingLeft: across(12), paddingRight: across(4) }))
  await ui.unmount()
})

test('activity from a report draws one line per item with its age on the right, whatever the command holds', async ($, on) => {
  const commit = 'commit 34ebd4c fix(pane): one-line callout, commits, files and row text after rebase onto main with the archive guard'
  const report = { v: 1, kind: 'status', session: 'local_env', engineId: 'engine-env', parent: SELF, seq: 2, at: 3_590_000, run: { isRunning: true }, modelAt: 3_590_000, state: 'working', activity: [{ at: 3_480_000, text: commit }, { at: 3_590_000, text: `Bash ${BASH}` }], commits: [], tests: [], files: [], git: { branch: '', dirty: 0, ahead: 0, at: 3_590_000, path: WORKTREE } }
  const { clock } = await started($, on, BOARD, { files: { [`${HOME}/.claude/state/master-session/sessions/local_env.json`]: JSON.stringify(report) } })
  await clock.advance(3_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_env')
  for (const index of [0, 1]) expect((await ui.find({ key: `activity-local_env-${index}` }))?.props).toEqual(expect.objectContaining({ height: tall(20), minWidth: 0 }))
  const texts = await textsOf(ui)
  expect(texts).toEqual(expect.arrayContaining(['commit', '2m', '<1m']))
  expect((await ui.find({ key: 'activity-local_env-0' }))?.text).toMatch(/^BashAllow Bash/)
  expect((await ui.find({ key: 'activity-local_env-1' }))?.text).toMatch(/^commit34ebd4c/)
  const rest = (await ui.findAll({ type: 'Text' })).filter(one => String(one.text ?? '').startsWith('34ebd4c fix(pane)'))
  expect(rest.length).toBe(1)
  expect(rest[0]?.props.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('tests chips: repeated labels show once, and one row of chips ends in +N more', async ($, on) => {
  const tests = ['persona.test · exit 0', 'persona.test · exit 0', 'tsc -p . --noEmit · exit 0', 'persona.test · exit 0', `bash -lc ${BASH.slice(12)} · exit 0`, 'plugin test · passed · 212 pass', 'plugin validate --strict · exit 0']
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], tests }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 46 } })
  await click(ui, 'hit-row-local_setup')
  const texts = await textsOf(ui)
  expect(texts.filter(text => text === 'persona.test · exit 0').length).toBeLessThanOrEqual(1)
  const chips = (await ui.findAll({ type: 'Box' })).filter(box => box.key?.startsWith('test-local_setup-')).length
  const more = Number(texts.find(text => /^\+\d+ more$/.test(text))?.slice(1).split(' ')[0] ?? 0)
  expect(chips + more).toBe(5)
  expect(more).toBeGreaterThan(0)
  expect(texts[texts.lastIndexOf('Tests') + 1]).toBe('plugin validate')
  await ui.unmount()
})

test('files owned show relative to the worktree, not as absolute paths', async ($, on) => {
  const files = [`${WORKTREE}/hooks/lib/band.ts`, `${WORKTREE}/hooks/components/band/Band.tsx`, '~/.claude/notes.md']
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], files }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-local_setup')
  const texts = await textsOf(ui)
  expect(texts).toEqual(expect.arrayContaining(['hooks/lib/band.ts', 'hooks/components/band/Band.tsx', '~/.claude/notes.md']))
  expect(texts.some(text => text.startsWith(HOME))).toBe(false)
  await ui.unmount()
})

test('a subagent card draws no prompt rows and no N-line prompt line, whatever the prompt holds', async ($, on) => {
  seeded(on, [{ id: 'q1', type: 'master-session:qa-verifier', description: 'Live check every item', prompt: PROMPT, state: 'running', startedAt: 3_540_000 }])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-q1')
  expect(await ui.find({ key: 'task-prompt-q1' })).toBeUndefined()
  expect(await ui.find({ key: 'task-title-q1' })).toBeDefined()
  expect((await textsOf(ui)).some(text => text.includes('-line prompt') || text.includes('the whole prompt is in'))).toBe(false)
  await ui.unmount()
})

test('the Tests block sums the pass counts of each session’s latest test labels', async ($, on) => {
  const one = ['plugin test · passed · 212 pass', 'persona.test · passed · 14 passed', 'plugin test · passed · 214 pass']
  const two = ['tsc -p . --noEmit · exit 0', 'plugin test · passed · 298 pass']
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], tests: one }, { ...BOARD.sessions[1], tests: two }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } })
  expect((await ui.find({ key: 'block-tests' }))?.text).toBe('Testsfrom 2 sessions’ checks')
  expect((await ui.findAll({ type: 'Svg' })).some(svg => svg.props.alt === 'Tests 526')).toBe(true)
  await ui.unmount()
})

test('KPI tiles at 47 columns keep every label and sub whole: Needs you drops its glyph, the subs take their short form; wide tiles keep both', async ($, on) => {
  seeded(on, [{ id: 'k1', type: 'master-session:reviewer', description: 'Review', state: 'running', startedAt: 3_540_000, parentSessionId: 'local_setup', asking: { text: 'Allow Bash: ls', since: 3_590_000 } }])
  const one = ['plugin test · passed · 212 pass']
  const two = ['plugin test · passed · 298 pass']
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], tests: one }, { ...BOARD.sessions[1], tests: two }] })
  const tile = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns } })
    const found = { needs: (await ui.find({ key: 'block-needs-you' }))?.text, icon: JSON.stringify((await ui.find({ key: 'block-needs-you' }))?.children).includes('"alt":"needs"'), tests: (await ui.find({ key: 'block-tests' }))?.text }
    await ui.unmount()
    return found
  }
  expect(await tile(47)).toEqual({ needs: 'Needs you2 blockers', icon: false, tests: 'Tests510 passed' })
  expect(await tile(100)).toEqual({ needs: 'Needs you1 session · 1 subagent', icon: true, tests: 'Testsfrom 2 sessions’ checks' })
  const inner = (bodyWidthOf(47) - 3 * 8) / 4 - 2 - 16
  for (const text of ['Needs you', '2 blockers', '510 passed']) expect([text, textWidth(text, 11, { isBold: text === 'Needs you' }) <= inner]).toEqual([text, true])
  expect(textWidth('Needs you', 11, { isBold: true }) + 16).toBeGreaterThan(inner)
})


test('KPI subs drawn at 47 and 60 columns never truncate: each tile draws the first of its subs that fits, with 12 asking subagents, a long testsNote, and nothing reported', async ($, on) => {
  const asking = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}`, type: 'master-session:reviewer', description: `Review ${index}`, state: 'running' as const, startedAt: 3_500_000, parentSessionId: 'local_setup', asking: { text: 'Allow Bash: ls', since: 3_590_000 } }))
  seeded(on, asking)
  const quiet = { ...BOARD, sessions: [BOARD.sessions[1]], needsYou: [] }
  const loud = { ...quiet, testsPassed: 52_614, testsNote: 'smoke 398 · hooks 128 · e2e 52088 across 4 workers' }
  await started($, on, loud)
  const subsAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns } })
    const blocks = (await ui.findAll({ type: 'Box' })).filter(box => box.key?.startsWith('block-') && !box.key.startsWith('block-value') && !box.key.startsWith('block-dot') && !box.key.startsWith('block-icon'))
    const found = blocks.map(box => ({ key: box.key, texts: (box.children ?? []).flatMap(child => JSON.stringify(child).match(/"children":\["([^"]*)"\]/g) ?? []).map(text => text.slice(13, -2)) }))
    await ui.unmount()
    return found
  }
  for (const board of [loud, quiet]) {
    await $.tool.call({ tool: BOARD_TOOL, ...board })
    for (const bodyColumns of [47, 60]) {
      const inner = (bodyWidthOf(bodyColumns) - 3 * 8) / 4 - 2 - 16
      const found = await subsAt(bodyColumns)
      expect(found.map(one => one.key)).toEqual(['block-sessions', 'block-needs-you', 'block-subagents', 'block-workflows', 'block-commits', 'block-tests', 'block-duration', 'block-git'])
      if (bodyColumns === 47) expect([found[1]?.texts, found[5]?.texts]).toEqual([['Needs you', '12 blockers'], ['Tests', board === loud ? '52614' : 'none']])
      for (const { key, texts } of found)
        for (const text of texts) expect([bodyColumns, key, text, textWidth(text, 11, { isBold: text === texts[0] }) <= inner]).toEqual([bodyColumns, key, text, true])
    }
  }
})

test('when "N blockers" is wider than the tile, Needs you draws the bare count', async ($, on) => {
  const count = 100
  seeded(on, Array.from({ length: count }, (_, index) => ({ id: `n${index}`, type: 'master-session:reviewer', description: `Review ${index}`, state: 'running' as const, startedAt: 3_500_000, parentSessionId: 'local_setup', asking: { text: 'Allow Bash: ls', since: 3_590_000 } })))
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[1]], needsYou: [] })
  const inner = (bodyWidthOf(47) - 3 * 8) / 4 - 2 - 16
  expect([textWidth(`${count} blockers`, 11) > inner, textWidth(String(count), 11) <= inner]).toEqual([true, true])
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 47 } })
  expect((await ui.find({ key: 'block-needs-you' }))?.text).toBe(`Needs you${count}`)
  await ui.unmount()
})

test('each tile draws the FIRST of [sub, ...shorts] whose width fits, and it fits, at every width from 47 to 60 columns, for long, short and empty data', () => {
  const base: RunSummary = {
    sessions: { total: 3, waiting: 1, working: 1, done: 1 },
    needsYou: { sessions: 0, subagents: 12 },
    subagents: { total: 14, running: 12, done: 2, failed: 0, asking: 12 },
    workflows: { total: 1, running: 1, done: 0, failed: 0, asking: 0, agents: 17, agentsDone: 14 },
    commits: { total: 14, repos: 3 },
    tests: { value: '52614', sub: 'smoke 398 · hooks 128 · e2e 52088 across 4 workers' },
    duration: { since: 0, ms: 4_000_000 },
    git: { dirty: 5 },
  }
  const cases: [RunSummary, string | undefined][] = [
    [base, '20:04'],
    [base, undefined],
    [{ ...base, needsYou: { sessions: 1, subagents: 1000 }, tests: { value: '6 checks', sub: 'passed · no counts' } }, undefined],
    [{ ...base, needsYou: { sessions: 0, subagents: 0 }, subagents: { total: 2, running: 0, done: 2, failed: 0, asking: 0 }, tests: { value: '—', sub: 'none reported' } }, '20:04'],
  ]
  for (let bodyColumns = 47; bodyColumns <= 60; bodyColumns += 1) {
    const inner = tileInnerOf(bodyWidthOf(bodyColumns), 4)
    for (const [totals, end] of cases)
      for (const block of blocksOf(totals, true, end)) {
        if (block.dots) continue
        const subs = [block.sub, ...(block.shorts ?? [])]
        const first = subs.findIndex(text => textWidth(text, 11) <= inner)
        expect([bodyColumns, block.key, subOf(block, inner)]).toEqual([bodyColumns, block.key, subs[first < 0 ? subs.length - 1 : first]])
        expect(subs.slice(0, first < 0 ? subs.length - 1 : first).every(text => textWidth(text, 11) > inner)).toBe(true)
        expect([bodyColumns, block.key, textWidth(subOf(block, inner) ?? '', 11) <= inner]).toEqual([bodyColumns, block.key, true])
      }
  }
  const needs = blocksOf({ ...base, needsYou: { sessions: 1, subagents: 1000 } }, true)[1]
  expect(needs && subOf(needs, tileInnerOf(bodyWidthOf(47), 4))).toBe('1001')
})

const SECONDS = /^\d+s$/

const OLD_AGENT = { id: 'q1', type: 'master-session:qa-verifier', description: 'Live check', prompt: 'go', state: 'running', startedAt: 3_500_000 }

const STALE_LIVE = { self: SELF, title: '', sessions: [], error: '', at: 1 }

function seededRuns(on: On, values: Record<string, unknown> = {}) {
  const all: Record<string, unknown> = {
    agents: [{ ...OLD_AGENT, startedAt: 3_599_000 }],
    workflows: [{ id: 'w1', toolUseId: 'toolu_w', name: 'audit', phases: [], startedAt: 3_599_000 }],
    ...values,
  }
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key in all ? { value: { ...real.value, value: all[e.key] } } : real) as never
  })
  return all
}

const invalidations = (on: On) => {
  const drawn = { count: 0 }
  on('ui.invalidate', (_, e, next) => {
    drawn.count += 1
    return next(e)
  })
  return drawn
}

test('a running workflow row and a subagent row read 1s at mount and 3s after two quiet seconds', async ($, on) => {
  seededRuns(on)
  const run = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const secondsOf = async () => (await textsOf(ui)).filter(text => SECONDS.test(text))
  expect(await secondsOf()).toEqual(['1s', '1s'])
  await run.clock.advance(2_000)
  expect(await secondsOf()).toEqual(['3s', '3s'])
  await ui.unmount()
})

test('a closed pane is never redrawn by the time tick', async ($, on) => {
  seededRuns(on)
  const drawn = invalidations(on)
  const run = await started($, on, BOARD, { isPaneOpen: false })
  const before = drawn.count
  await run.clock.advance(5_000)
  expect(drawn.count).toBe(before)
})

test('a session that is not a claimed master is never redrawn by the time tick, even when a board shows up', async ($, on) => {
  const seeded = seededRuns(on)
  const drawn = invalidations(on)
  const run = world(on)
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await run.clock.settle()
  seeded.board = { sessions: [], needsYou: [], repos: [], source: 'tool', since: 0, at: 0 }
  await run.clock.advance(5_000)
  expect(drawn.count).toBe(0)
})

test('a worker with an open pane and a running subagent is never redrawn by the time tick', async ($, on) => {
  seededRuns(on)
  on('fs.write', () => ({ value: undefined }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  const drawn = invalidations(on)
  const run = world(on, childOf(3_600_000))
  await $.session.start({ cwd: HOME, surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'master-session:worker', text: 'Worker.', frontmatter: {}, source: 'plugin' })
  await run.clock.advance(5_000)
  expect(drawn.count).toBe(0)
})

const ONE = { ...BOARD, sessions: [{ id: 'local_env', name: 'env-e2e-test', state: 'working', progress: 'step 1 of 2 — fix' }], needsYou: [] }

async function timed($: Engine, on: On, input: { age?: number; seen?: number; since?: number }) {
  const seeded = seededRuns(on, { agents: [], workflows: [] })
  const drawn = invalidations(on)
  const run = await started($, on, ONE)
  const now = 3_600_000
  const session = { id: 'local_env', name: 'env-e2e-test', title: '', cwd: HOME, isRunning: true, isArchived: false, lastActivityAt: 0, createdAt: now - (input.age ?? 0) }
  seeded.live = { ...STALE_LIVE, at: now - (input.seen ?? 600_000), sessions: input.age === undefined ? [] : [session] }
  seeded.board = { ...boardFromJson(ONE, 'tool'), since: input.since ?? 0, at: 0 }
  await run.clock.advance(1_000)
  return { run, drawn }
}

const minutesOf = async (ui: Parameters<typeof textsOf>[0]) => (await textsOf(ui)).filter(text => /^(<1|\d)m$/.test(text))

test('a subagent row reads 1s, 2s, 3s on successive ticks, one redraw each', async ($, on) => {
  seededRuns(on, { workflows: [] })
  const drawn = invalidations(on)
  const run = await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const secondsOf = async () => (await textsOf(ui)).filter(text => SECONDS.test(text))
  expect(await secondsOf()).toEqual(['1s'])
  for (const second of ['2s', '3s']) {
    const before = drawn.count
    await run.clock.advance(1_000)
    expect([await secondsOf(), drawn.count - before]).toEqual([[second], 1])
  }
  await ui.unmount()
})

test('a session row created now gets no redraw until its label changes at the minute', async ($, on) => {
  const { run, drawn } = await timed($, on, { age: 0 })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await minutesOf(ui)).toEqual(['<1m'])
  const before = drawn.count
  await run.clock.advance(58_000)
  expect(drawn.count).toBe(before)
  expect(await minutesOf(ui)).toEqual(['<1m'])
  await run.clock.advance(2_000)
  expect(drawn.count - before).toBe(1)
  expect(await minutesOf(ui)).toEqual(['1m'])
  await run.clock.advance(60_000)
  expect(await minutesOf(ui)).toEqual(['2m'])
  await ui.unmount()
})

test('a row started 30 s past a minute shows the next minute within a second of that boundary', async ($, on) => {
  const { run, drawn } = await timed($, on, { age: 30_000 })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = drawn.count
  await run.clock.advance(28_000)
  expect([await minutesOf(ui), drawn.count - before]).toEqual([['<1m'], 0])
  await run.clock.advance(1_000)
  expect([await minutesOf(ui), drawn.count - before]).toEqual([['1m'], 1])
  await ui.unmount()
})

test('the header moves past a minute on the tick that crosses it, with nothing running and no redraw before', async ($, on) => {
  const { run, drawn } = await timed($, on, {})
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const updated = async () => (await textsOf(ui)).filter(text => text.startsWith('updated'))
  expect(await updated()).toEqual(['updated 10m ago'])
  const before = drawn.count
  await run.clock.advance(58_000)
  expect([await updated(), drawn.count - before]).toEqual([['updated 10m ago'], 0])
  await run.clock.advance(2_000)
  expect([await updated(), drawn.count - before]).toEqual([['updated 11m ago'], 1])
  await ui.unmount()
})

test('the Duration tile moves on its own minute, with no other label changing', async ($, on) => {
  const { run, drawn } = await timed($, on, { age: 0, since: 3_600_000 - 630_000 })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const lengthOf = async () => (await altsOf(ui)).filter(alt => String(alt).startsWith('Duration'))
  expect(await lengthOf()).toEqual(['Duration 10m'])
  const before = drawn.count
  await run.clock.advance(28_000)
  expect([await lengthOf(), drawn.count - before]).toEqual([['Duration 10m'], 0])
  await run.clock.advance(2_000)
  expect([await lengthOf(), drawn.count - before]).toEqual([['Duration 11m'], 1])
  await ui.unmount()
})

test('the header reads just now, then seconds, then a minute while the data stays put', async ($, on) => {
  const { run } = await timed($, on, { seen: 0 })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const updated = async () => (await textsOf(ui)).filter(text => text.startsWith('updated'))
  expect(await updated()).toEqual(['updated just now'])
  await run.clock.advance(19_000)
  expect(await updated()).toEqual(['updated 20s ago'])
  await run.clock.advance(41_000)
  expect(await updated()).toEqual(['updated 1m ago'])
  await ui.unmount()
})

test('an expanded run older than a minute with a fresh agent reads 1s, 2s, 3s on that agent, one redraw per tick', async ($, on) => {
  const base = { type: 'workflow-subagent', prompt: 'go', description: 'scan' }
  seededRuns(on, {
    agents: [
      { ...base, id: 'w0', state: 'done', startedAt: 3_450_000, endedAt: 3_550_000, run: { id: 'wf_1', index: 0 } },
      { ...base, id: 'w1', state: 'running', startedAt: 3_599_000, run: { id: 'wf_1', index: 1 } },
    ],
    workflows: [{ id: 'wf_1', toolUseId: 't', name: 'audit', phases: [], startedAt: 3_450_000 }],
    live: STALE_LIVE,
  })
  const drawn = invalidations(on)
  const run = await started($, on)
  await $.tool.call({ tool: 'mcp__master-session__open', expand: 'wf_1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const secondsOf = async () => (await textsOf(ui)).filter(text => SECONDS.test(text))
  expect(await secondsOf()).toEqual(['1s'])
  for (const second of ['2s', '3s']) {
    const before = drawn.count
    await run.clock.advance(1_000)
    expect([await secondsOf(), drawn.count - before]).toEqual([[second], 1])
  }
  await ui.unmount()
})
