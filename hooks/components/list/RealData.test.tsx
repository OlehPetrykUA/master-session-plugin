import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord, Board } from '../../../types'

import { textWidth } from '../../lib/layout'
import { foldPath, relativeOf, rowsOf } from '../../lib/list'
import { rowsOf as sessionRowsOf } from '../../lib/rows'
import { testsOf } from '../../lib/totals'
import { C } from '../../theme/tokens'
import { BOARD, HOME, PANE, WORKTREE, click, hitsOf, started, textsOf } from '../../testing/world'

const COMMAND = `cd ${HOME}/.claude/worktrees/wt-master-session-plugin-rows-v3 && npm run build -- --filter hooks && node --test hooks/lib/list.test.ts hooks/lib/band.test.ts hooks/components/detail/Detail.test.tsx 2>&1 | tee /private/tmp/claude-501/rows-v3-gate.log && git status --porcelain && git log --oneline -3`

const PROMPT = Array.from({ length: 35 }, (_, index) => `${index + 1}. Check the ${['row chevron', 'needs glyph', 'undo group', 'tests chips'][index % 4]} against the v3 canvas and note every mismatch with a crop.`).join('\n')

function seeded(on: On, agents: AgentRecord[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const textsIn = (node: unknown): string[] => (typeof node === 'string' ? [node] : node && typeof node === 'object' ? Object.values(node as Record<string, unknown>).flatMap(textsIn) : [])

test('rows: split by width, at most n, the last ends in "…"; emoji count by code point and never leave a lone surrogate', () => {
  const rows = rowsOf('Archive can lose work until this lands: 2 commits exist only on archive-guard, and Archive all would remove its worktree. '.repeat(3), 280, 13, 3)
  expect(rows.length).toBe(3)
  expect(rows.at(-1)?.endsWith('…')).toBe(true)
  for (const row of rows) expect(textWidth(row, 13)).toBeLessThanOrEqual(280)
  const rockets = rowsOf('🚀'.repeat(148), 300, 12, 4)
  expect(rockets.join('').endsWith('…')).toBe(false)
  expect(Array.from(rockets.join('')).length).toBe(148)
  const cut = rowsOf('🚀'.repeat(400), 300, 12, 2)
  expect(cut.at(-1)?.endsWith('…')).toBe(true)
  expect(/[\uD800-\uDBFF]…$/.test(cut.at(-1) ?? '')).toBe(false)
})

test('paths: relative to the worktree, else ~, middle folders fold until they fit; a home with a trailing slash still matches', () => {
  expect(relativeOf(`${HOME}/notes/plan.md`, [], `${HOME}/`)).toBe('~/notes/plan.md')
  expect(relativeOf(`${WORKTREE}/hooks/lib/archive.ts`, [`${WORKTREE}/`], HOME)).toBe('hooks/lib/archive.ts')
  expect(foldPath('hooks/components/detail/blocks/SessionDetailBlocks.tsx', 300)).toBe('hooks/…/blocks/SessionDetailBlocks.tsx')
  expect(foldPath('~/.agents/skills/master-session/skills/worker/SKILL.md', 220)).toBe('~/…/skills/worker/SKILL.md')
  expect(foldPath('hooks/lib/archive.ts', 300)).toBe('hooks/lib/archive.ts')
})

test('a risk is an amber callout under Now and Next, clamped to 3 rows, never on the row', async ($, on) => {
  const risk = 'Archive can lose work until this lands: 2 commits exist only on archive-guard, and Archive all would remove its worktree. '.repeat(3)
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], risk }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(textsIn((await ui.find({ key: 'row-local_setup' }))?.children).join(' ')).not.toContain('Archive can lose')
  await click(ui, 'hit-row-local_setup')
  const callout = await ui.find({ key: 'callout-risk-local_setup' })
  expect(callout?.props.backgroundColor).toBe(C.amberTint)
  expect(callout?.text).toContain('RISK')
  const rows = (await ui.find({ key: 'callout-risk-local_setup-rows-0' }))?.children ?? []
  expect(rows.length).toBe(3)
  expect(JSON.stringify(rows.at(-1))).toContain('…')
  const keys = (await ui.findAll({ type: 'Box' })).map(box => box.key ?? '')
  expect(keys.indexOf('pair-now-local_setup')).toBeLessThan(keys.indexOf('callout-risk-local_setup'))
  expect(keys).not.toContain('risk-local_setup')
  await ui.unmount()
})

test('a session asking "Allow Bash: …" leads its card with a Permission callout: the command in mono, home as ~, at most 6 rows', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [{ ...BOARD.sessions[0], needsYou: `Allow Bash: ${COMMAND}` }, BOARD.sessions[1]] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 46 } })
  const question = (await ui.findAll({ type: 'Text' })).filter(one => one.props.color === C.red && one.props.wrap === 'truncate-end').map(one => String(one.text))
  expect(question.length).toBe(2)
  expect(question.join(' ')).toContain('~/.claude')
  expect(question.join(' ')).not.toContain(HOME)
  await click(ui, 'hit-row-local_env')
  const callout = await ui.find({ key: 'callout-permission-local_env' })
  expect(callout?.text).toContain('PERMISSIONAllow Bash')
  expect(callout?.text).toContain('the whole command is in its chat')
  const command = (await ui.findAll({ type: 'Text' })).filter(one => one.props.mono === true && one.props.wrap === 'truncate-end' && String(one.text ?? '').length > 0)
  const rows = (await ui.find({ key: 'callout-permission-local_env-rows-1' }))?.children ?? []
  expect(rows.length).toBe(6)
  expect(JSON.stringify(rows[0])).toContain('cd ~/.claude/worktrees/')
  expect(JSON.stringify(rows.at(-1))).toContain('…')
  expect(command.length).toBeGreaterThan(0)
  const keys = (await ui.findAll({ type: 'Box' })).map(box => box.key ?? '')
  expect(keys.indexOf('callout-permission-local_env')).toBeLessThan(keys.indexOf('pair-now-local_env'))
  await ui.unmount()
})

test('a subagent asking for Bash: Permission callout, a Now block, the description in 2 rows, the prompt in 4, then its line count and where it is', async ($, on) => {
  seeded(on, [
    { id: 'q1', type: 'master-session:qa-verifier', description: 'Verify rows-v3 at 48187ca in a clean detached worktree, then compare every changed board with the v3 canvas and report each mismatch', prompt: PROMPT, state: 'running', startedAt: 3_540_000, parentSessionId: 'local_setup', asking: { text: `Allow Bash: ${COMMAND}`, since: 3_560_000 } },
  ])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-q1')
  expect((await ui.find({ key: 'callout-q1-rows-1' }))?.children?.length).toBe(6)
  expect((await ui.find({ key: 'task-title-q1' }))?.children?.length).toBe(2)
  expect((await ui.find({ key: 'task-prompt-q1' }))?.children?.length).toBe(4)
  const texts = await textsOf(ui)
  expect(texts).toContain('35-line prompt · the whole prompt is in Session’s chat')
  expect(texts).toEqual(expect.arrayContaining(['Waiting for your answer', 'Bash · asked 40s ago']))
  await ui.unmount()
})

test('a narrow pane that still shows the Open chat label cuts the persona last, after the task is gone', async ($, on) => {
  seeded(on, [{ id: 'd1', type: 'master-session:design-checker', description: 'Compare the live pane with every lane', state: 'running', startedAt: 3_540_000, parentSessionId: 'local_setup', asking: { text: 'Allow Read: /etc/hosts', since: 3_590_000 } }])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 41 } })
  expect(await hitsOf(ui)).toContain('hit-chat-d1')
  const persona = await ui.find({ key: 'row-d1-persona' })
  expect(persona?.props).toEqual(expect.objectContaining({ flexShrink: 1, minWidth: 0 }))
  expect(textsIn((await ui.find({ key: 'row-d1' }))?.children)).not.toContain('Compare the live pane with every lane')
  await ui.unmount()
  const wide = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 60 } })
  expect((await wide.find({ key: 'row-d1-persona' }))?.props.flexShrink).toBe(0)
  await wide.unmount()
})

test('tests: one row, newest first, each label at most 140 px, then "+N more" in 12/600 muted', async ($, on) => {
  const tests = Array.from({ length: 15 }, (_, index) => (index === 14 ? 'plugin test · passed · 228 pass' : index === 13 ? 'tsc -p . --noEmit · exit 0' : `case-${index}.test · exit 0`))
  tests.push(`bash -lc "${COMMAND}" · passed · 1234 pass`)
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], tests }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } })
  await click(ui, 'hit-row-local_setup')
  const texts = await textsOf(ui)
  const first = texts.lastIndexOf('Tests')
  expect(texts.slice(first + 1, first + 4)).toEqual(['bash · 1234 pass', 'plugin test · 228 pass', 'tsc'])
  const more = (await ui.findAll({ type: 'Text' })).find(one => /^\+\d+ more$/.test(String(one.text)))
  expect(more?.props).toEqual(expect.objectContaining({ weight: 'semibold', color: C.muted }))
  await ui.unmount()
})

test('files owned: three folded paths relative to the worktree or under ~, then "+N more"', async ($, on) => {
  const files = [`${WORKTREE}/hooks/components/detail/blocks/SessionDetailBlocks.tsx`, `${WORKTREE}/hooks/lib/archive.ts`, `${HOME}/.agents/skills/master-session/skills/worker/SKILL.md`, `${WORKTREE}/a.ts`, `${WORKTREE}/b.ts`]
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], files }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 46 } })
  await click(ui, 'hit-row-local_setup')
  const texts = await textsOf(ui)
  expect(texts).toEqual(expect.arrayContaining(['hooks/lib/archive.ts', '+2 more']))
  expect(texts.some(text => text.startsWith('hooks/…/') && text.endsWith('SessionDetailBlocks.tsx'))).toBe(true)
  expect(texts.some(text => text.startsWith('~/') && text.endsWith('SKILL.md'))).toBe(true)
  expect(texts.some(text => text.startsWith(HOME))).toBe(false)
  await ui.unmount()
})

test('the Tests tile takes the first source that applies: testsPassed, then summed counts, then passing checks, then a dash', () => {
  const live = { self: 'master', title: '', sessions: [], error: '', at: 0 }
  const board = (sessions: Board['sessions'], extra: Partial<Board> = {}): Board => ({ sessions, needsYou: [], repos: [], source: 'tool', ...extra })
  const rows = (one: Board) => sessionRowsOf(one, live)
  const counted = board([
    { id: 'a', name: 'a', state: 'working', tests: ['plugin test · passed · 212 pass', 'plugin test · passed · 226 pass'] },
    { id: 'b', name: 'b', state: 'working', tests: ['plugin test · passed · 128 pass', 'tsc · exit 0'] },
  ])
  expect(testsOf(rows(counted), board([], { testsPassed: 526, testsNote: 'smoke 398 · hooks 128' }))).toEqual({ value: '526', sub: 'smoke 398 · hooks 128' })
  expect(testsOf(rows(counted), counted)).toEqual({ value: '354', sub: 'from 2 sessions’ checks' })
  const checks = board([{ id: 'c', name: 'c', state: 'working', tests: ['tsc · exit 0', 'persona.test · exit 0', 'lint · passed', 'smoke · failed', 'plugin validate · exit 0', 'build · exit 0', 'e2e · exit 0'] }])
  expect(testsOf(rows(checks), checks)).toEqual({ value: '6 checks', sub: 'passed · no counts' })
  expect(testsOf([], null)).toEqual({ value: '—', sub: 'none reported' })
})

test('the header wraps a long status line and grows; offline shows I.offline muted on line 2 and the notice in C.text with an amber glyph', async ($, on) => {
  let failure: string | undefined
  const { clock } = await started($, on, BOARD, { listError: () => failure })
  failure = 'board.json not found'
  await clock.advance(15_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'section-header' }))?.props.minHeight).toBeGreaterThan(0)
  const status = (await ui.findAll({ type: 'Text' })).find(one => one.text === 'live data unavailable')
  expect(status?.props.wrap).toBe('wrap')
  expect(JSON.stringify((await ui.find({ key: 'section-header' }))?.children)).toContain('"alt":"offline"')
  const notice = await ui.find({ key: 'notice' })
  expect(JSON.stringify(notice?.children)).toContain('"alt":"offline"')
  expect((await ui.findAll({ type: 'Text' })).find(one => String(one.text).startsWith('Can’t read sessions'))?.props.color).toBe(C.text)
  await ui.unmount()
})
