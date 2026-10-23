import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord } from '../../../types'

import { across, bodyWidthOf, faceWidth, tall, textWidth } from '../../lib/layout'
import { rowsOf } from '../../lib/list'
import { C } from '../../theme/tokens'
import { BOARD, BOARD_TOOL, HOME, PANE, SELF, WORKTREE, click, hitsOf, started, textsOf } from '../../testing/world'

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

type Raise = { scroll: (input: unknown) => Promise<unknown> }

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
  const room = (bodyColumns: number) => bodyWidthOf(bodyColumns) - 88 - faceWidth('Open chat', 'b32') - 1 - 12
  const shown = (persona: string, task: string, bodyColumns: number) => rowsOf(task, room(bodyColumns) - textWidth(persona, 14, { isBold: true }) - 8 - textWidth('·', 14), 14, 1)[0] ?? ''
  expect(shown('Designer', 'Pane v2', 52)).toBe('Pane v2')
  expect(await face('local_pane', 52)).toBe('label')
  const cut = shown('Implementer', 'Prompt status data and more', 60)
  expect([cut.endsWith('…'), Array.from(cut).length - 1 >= 12]).toEqual([true, true])
  expect(await face('local_long', 60)).toBe('label')
  expect(Array.from(shown('Implementer', 'Prompt status data and more', 52)).length - 1).toBeLessThan(12)
  expect(await face('local_long', 52)).toBe('icon')
  expect(await face('local_pane', 40)).toBe('icon')
})

test('splitting a 20,000-character prompt into 4 rows takes under 10 ms, and every row fits', () => {
  const prompt = 'Re-run the gate and report each exit code. '.repeat(470)
  expect(prompt.length).toBeGreaterThan(20_000)
  const start = performance.now()
  const rows = rowsOf(prompt, 300, 12, 4)
  expect(performance.now() - start).toBeLessThan(10)
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
  const raise = () => ($.ui as unknown as Raise).scroll({ component: 'Pane', requestId: 'master-session', offset: 30, by: 0, bodyRows: 2, contentRows: 400, origin: { kind: 'plugin', name: 'master-session' } })
  await $.tool.call({ tool: 'mcp__master-session__open' })
  await raise()
  expect(landed.at(-1)).toBe(0)
  await $.tool.call({ tool: 'mcp__master-session__open', expand: 'local_setup' })
  await raise()
  expect(Number(landed.at(-1))).toBeGreaterThan(0)
  expect(Number(landed.at(-1))).toBeLessThan(30)
})

test('the expanded card draws its top exactly as the row: no inset from the card border', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], title: 'Implementer · Archive safety for side sessions in other repos' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = (await ui.find({ key: 'row-local_setup' }))?.props
  await click(ui, 'hit-row-local_setup')
  expect((await ui.find({ key: 'detail-local_setup' }))?.props).toEqual(expect.objectContaining({ paddingX: 0, paddingY: 0, borderStyle: 'round' }))
  const top = (await ui.find({ key: 'top-local_setup' }))?.props
  for (const side of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'gap', 'minHeight'] as const) expect(top?.[side]).toBe(row?.[side])
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

test('a subagent card clamps a 35-line prompt to a few lines with an ellipsis', async ($, on) => {
  seeded(on, [{ id: 'q1', type: 'master-session:qa-verifier', description: 'Live check every item', prompt: PROMPT, state: 'running', startedAt: 3_540_000 }])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-q1')
  const body = ((await ui.find({ key: 'task-prompt-q1' }))?.children ?? []) as { text?: string }[]
  expect(body.length).toBe(4)
  expect(JSON.stringify(body.at(-1))).toContain('…')
  expect((await textsOf(ui)).some(text => text.includes('\n'))).toBe(false)
  expect(await textsOf(ui)).toContain('35-line prompt · the whole prompt is in this chat')
  await ui.unmount()
})

test('the Tests block sums the pass counts of each session’s latest test labels', async ($, on) => {
  const one = ['plugin test · passed · 212 pass', 'persona.test · passed · 14 passed', 'plugin test · passed · 214 pass']
  const two = ['tsc -p . --noEmit · exit 0', 'plugin test · passed · 298 pass']
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], tests: one }, { ...BOARD.sessions[1], tests: two }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'block-tests' }))?.text).toBe('Testsfrom 2 sessions’ checks')
  expect((await ui.findAll({ type: 'Svg' })).some(svg => svg.props.alt === 'Tests 526')).toBe(true)
  await ui.unmount()
})

