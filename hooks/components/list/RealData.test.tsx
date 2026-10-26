import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord, Board } from '../../../types'

import { across, bodyWidthOf, textWidth } from '../../lib/layout'
import { foldPath, relativeOf, rowsOf } from '../../lib/list'
import { rowsOf as sessionRowsOf } from '../../lib/rows'
import { isFailed, testsOf } from '../../lib/totals'
import { pillOf, testsShownOf } from '../detail/Tests'
import { CAPTION } from './Summary'
import { C } from '../../theme/tokens'
import { ASKS, ELLIPSIS, ROCKET_PX, WIDE_ASKS } from '../../testing/widths'
import { AT, BOARD, HOME, PANE, SELF, WORKTREE, click, hitsOf, started, textsOf, warmUp } from '../../testing/world'

const COMMAND = `cd ${HOME}/.claude/worktrees/wt-master-session-plugin-rows-v3 && npm run build -- --filter hooks && node --test hooks/lib/list.test.ts hooks/lib/band.test.ts hooks/components/detail/Detail.test.tsx 2>&1 | tee /private/tmp/claude-501/rows-v3-gate.log && git status --porcelain && git log --oneline -3`

const PROMPT = Array.from({ length: 35 }, (_, index) => `${index + 1}. Check the ${['row chevron', 'needs glyph', 'undo group', 'tests chips'][index % 4]} against the v3 canvas and note every mismatch with a crop.`).join('\n')

function seeded(on: On, agents: AgentRecord[]) {
  on('state.get', async (_, e, next) => {
    const real = (await next(e)) as { value: { value: unknown; version: number } }
    return (e.key === 'agents' ? { value: { ...real.value, value: agents } } : real) as never
  })
}

const textsIn = (node: unknown): string[] => (typeof node === 'string' ? [node] : node && typeof node === 'object' ? Object.values(node as Record<string, unknown>).flatMap(textsIn) : [])

warmUp()

test('rows: split by width, at most n, the last ends in "…"; emoji count by code point and never leave a lone surrogate', () => {
  const rows = rowsOf('Archive can lose work until this lands: 2 commits exist only on archive-guard, and Archive all would remove its worktree. '.repeat(3), 280, 13, 3)
  expect(rows.length).toBe(3)
  expect(rows.at(-1)?.endsWith('…')).toBe(true)
  for (const row of rows) expect(textWidth(row, 13)).toBeLessThanOrEqual(280)
  for (const row of rowsOf('Archive can lose work until this lands: 2 commits exist only on archive-guard. '.repeat(4), 200, 13, 3, { isBold: true })) expect(textWidth(row, 13, { isBold: true })).toBeLessThanOrEqual(200)
  for (const row of rowsOf(COMMAND, 200, 12, 6, { isMono: true })) expect(textWidth(row, 12, { isMono: true })).toBeLessThanOrEqual(200)
  const realRocketsOf = (row: string) => Array.from(row.replace(/…$/, '')).length * (ROCKET_PX[12] ?? Infinity) + (row.endsWith('…') ? ELLIPSIS : 0)
  const rockets = rowsOf('🚀'.repeat(96), 300, 12, 4)
  expect(rockets.at(-1)?.endsWith('…')).toBe(true)
  for (const row of rockets) expect([row, realRocketsOf(row) <= 300]).toEqual([row, true])
  const fitting = rowsOf('🚀'.repeat(76), 300, 12, 4)
  expect([fitting.join('').endsWith('…'), Array.from(fitting.join('')).length, fitting.every(row => realRocketsOf(row) <= 300)]).toEqual([false, 76, true])
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

test('a subagent asking for Bash: Permission callout, a Now block, the description in 2 rows and no prompt', async ($, on) => {
  seeded(on, [
    { id: 'q1', type: 'master-session:qa-verifier', description: 'Verify rows-v3 at 48187ca in a clean detached worktree, then compare every changed board with the v3 canvas and report each mismatch', prompt: PROMPT, state: 'running', startedAt: 3_540_000, parentSessionId: 'local_setup', asking: { text: `Allow Bash: ${COMMAND}`, since: 3_560_000 } },
  ])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await click(ui, 'hit-row-q1')
  expect((await ui.find({ key: 'callout-q1-rows-1' }))?.children?.length).toBe(6)
  expect((await ui.find({ key: 'task-title-q1' }))?.children?.length).toBe(2)
  expect(await ui.find({ key: 'task-prompt-q1' })).toBeUndefined()
  const texts = await textsOf(ui)
  expect(texts.some(text => text.includes('-line prompt'))).toBe(false)
  expect(texts).toEqual(expect.arrayContaining(['Waiting for your answer', 'Bash · asked 40s ago']))
  await ui.unmount()
})

test('a needs row whose task cannot show 12 characters beside the Open chat label draws it icon-only; the persona is cut last, after the task is gone', async ($, on) => {
  await started($, on, { ...BOARD, sessions: [{ id: 'local_d1', name: 'd1', title: 'Compare the live pane with every lane', persona: 'Design checker', state: 'needs-you', needsYou: 'Allow Read: /etc/hosts' }] }, { sessions: [{ sessionId: 'local_d1', name: 'd1', title: '', cwd: '/', isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF }] })
  const at = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns } })
    const found = {
      chat: (await ui.find({ key: 'face-chat-local_d1' }))?.props.width === across(32) ? 'icon' : 'label',
      shrink: (await ui.find({ key: 'row-local_d1-persona' }))?.props.flexShrink,
      hasTask: textsIn((await ui.find({ key: 'row-local_d1' }))?.children).includes('Compare the live pane with every lane'),
    }
    await ui.unmount()
    return found
  }
  expect(await at(70)).toEqual({ chat: 'label', shrink: 0, hasTask: true })
  expect(await at(42)).toEqual({ chat: 'icon', shrink: 0, hasTask: true })
  expect(await at(41)).toEqual({ chat: 'icon', shrink: 1, hasTask: false })
  expect(await at(30)).toEqual({ chat: 'icon', shrink: 1, hasTask: false })
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
  const reruns = board([{ id: 'd', name: 'd', state: 'working', tests: ['bun test · 120 pass · 8 fail', 'bun test · 128 pass · 0 fail', 'tsc · 3 errors'] }])
  expect(testsOf(rows(reruns), reruns)).toEqual({ value: '128', sub: 'from 1 session’s checks' })
  const broken = board([{ id: 'e', name: 'e', state: 'working', tests: ['bun test · 128 pass · 0 fail', 'bun test · 120 pass · 8 fail', 'tsc · 3 errors'] }])
  expect(testsOf(rows(broken), broken)).toEqual({ value: '—', sub: 'none reported' })
  const rerun = board([{ id: 'f', name: 'f', state: 'working', tests: ['tsc -p . --noEmit · exit 0', 'tsc · 3 errors', 'lint · passed'] }])
  expect(testsOf(rows(rerun), rerun)).toEqual({ value: '1 check', sub: 'passed · no counts' })
  expect(testsShownOf(['tsc -p . --noEmit · exit 0', 'tsc · 3 errors'], 600).pills.map(pill => pill.label)).toEqual(['tsc · failed'])
  for (const label of ['e2e · fail', 'e2e · fails', 'e2e · failed', 'smoke · 3 failing', 'bun test · 120 pass · 8 fail', 'tsc · 1 error', 'build · exit 2', 'e2e · failing', 'smoke · 2 failures', 'lint · 1 failure']) expect([label, isFailed(label)]).toEqual([label, true])
  for (const label of ['bun test · 128 pass · 0 fail', 'smoke · 0 failing', 'tsc · exit 0', 'plugin test · passed · 252 pass', 'failover test · passed']) expect([label, isFailed(label)]).toEqual([label, false])
})

test('tests pills: a failed run is a red pill with the failed glyph and “· failed”, never green; only the newest label per command shows', async ($, on) => {
  const labels = (tests: string[], room = 600) => testsShownOf(tests, room).pills.map(pill => [pill.label, pill.isFailed])
  expect(labels(['bun test · 120 pass · 8 fail', 'tsc · 3 errors', 'bun test · 128 pass · 0 fail', 'tsc -p . --noEmit · exit 2'])).toEqual([
    ['tsc · failed', true],
    ['bun test · 128 pass', false],
  ])
  expect(labels(['bun test · 128 pass · 0 fail', 'bun test · 120 pass · 8 fail'])).toEqual([['bun test · failed', true]])
  const many = ['archive.test.ts · 3 failing', ...Array.from({ length: 13 }, (_, index) => `check-${index} · exit 0`), 'tsc · exit 0']
  const shown = testsShownOf(many, 300)
  expect([shown.pills[0]?.label, shown.pills[1]?.label, shown.pills.length + shown.more]).toEqual(['archive.test.ts · failed', 'tsc', 15])
  const pillPx = (label: string) => 6 + 12 + 4 + textWidth(label, 12, { isBold: true }) + 8
  expect(testsShownOf(['lint · exit 0', 'tsc · exit 0'], pillPx('tsc') + 4 + pillPx('lint')).more).toBe(0)
  expect(testsShownOf(['lint · exit 0', 'tsc · exit 0'], pillPx('tsc') + 4 + pillPx('lint') - 1).more).toBe(1)
  const long = pillOf('integration-suite-for-the-master-session-pane-and-band.test.ts · 2 failing')
  expect([long.head.endsWith('…'), long.tail, textWidth(long.label, 12, { isBold: true }) <= 140]).toEqual([true, ' · failed', true])
  await started($, on, { ...BOARD, sessions: [BOARD.sessions[0], { ...BOARD.sessions[1], tests: ['bun test · 120 pass · 8 fail', 'plugin test · passed · 228 pass'] }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } })
  await click(ui, 'hit-row-local_setup')
  const [failed, passed] = [await ui.find({ key: 'test-local_setup-0' }), await ui.find({ key: 'test-local_setup-1' })]
  expect([failed?.props.backgroundColor, failed?.text, JSON.stringify(failed?.children).includes('"alt":"failed"')]).toEqual([C.redTint, 'bun test · failed', true])
  expect([passed?.props.backgroundColor, passed?.text]).toEqual([C.greenTint, 'plugin test · 228 pass'])
  await ui.unmount()
})

test('a subagent with a name shows it as its task in its row and in the chain of the agents it started; its Task block keeps the description', async ($, on) => {
  seeded(on, [
    { id: 'q1', name: 'rows-v3 48187ca', type: 'master-session:qa-verifier', description: 'Verify rows-v3 at 48187ca in a clean detached worktree', state: 'running', startedAt: 3_540_000, parentSessionId: 'local_setup' },
    { id: 'r1', type: 'master-session:reviewer', description: 'Review the diff', state: 'running', startedAt: 3_550_000, parentSessionId: 'local_setup', parentAgentId: 'q1' },
  ])
  await started($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } })
  expect(textsIn((await ui.find({ key: 'row-q1' }))?.children)).toContain('rows-v3 48187ca')
  await click(ui, 'hit-row-r1')
  expect((await textsOf(ui)).some(text => text.includes('QA verifier · rows-v3 48187ca'))).toBe(true)
  await click(ui, 'hit-row-q1')
  expect(textsIn((await ui.find({ key: 'task-title-q1' }))?.children).join(' ')).toContain('Verify rows-v3 at 48187ca')
  await ui.unmount()
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

test('L8 at 53 columns with real glyph widths: "Designer · band diff" keeps the Open chat label, and a Validator prompt "Allow Read outside the project: ~/.agents/RULES.md?" takes 2 whole rows', async ($, on) => {
  seeded(on, [
    { id: 'c1', name: 'canvas v3 check', type: 'master-session:reviewer', description: 'Check the canvas', state: 'running', startedAt: 3_570_000, asking: { text: 'Allow Read outside the project: ~/.agents/RULES.md?', since: 3_590_000 } },
  ])
  await started($, on, { ...BOARD, sessions: [{ id: 'local_b1', name: 'b1', title: 'band diff', persona: 'Designer', state: 'needs-you', needsYou: 'Allow Bash: rm -rf dist?' }] }, { sessions: [{ sessionId: 'local_b1', name: 'b1', title: '', cwd: '/', isRunning: false, isArchived: false, lastActivityAt: AT, startedBy: SELF }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 53 } })
  expect((await ui.find({ key: 'face-chat-local_b1' }))?.props.width).not.toBe(across(32))
  expect(textsIn((await ui.find({ key: 'row-local_b1' }))?.children)).toEqual(expect.arrayContaining(['Designer', 'band diff']))
  expect(await hitsOf(ui)).not.toContain('hit-chat-c1')
  const rows = (await ui.find({ key: 'row-c1-ask-rows' }))?.children ?? []
  const texts = rows.map(row => textsIn(row).at(-1))
  expect(texts).toEqual(['Allow Read outside the project:', '~/.agents/RULES.md?'])
  await ui.unmount()
  const tight = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 52 } })
  expect((await tight.find({ key: 'face-chat-local_b1' }))?.props.width).toBe(across(32))
  await tight.unmount()
})

test('textWidth follows anthropic-sans at opsz 16 as Chrome renders it at 12–14 px: 1.5–5 % above the real width (the ×1.02 margin), with its own semibold widths', () => {
  const measured: [string, number, boolean, number][] = [
    ['band diff', 14, false, 59.95],
    ['Prompt status data', 14, false, 125.61],
    ['Implementer', 14, true, 86.76],
    ['Designer', 14, true, 60.93],
    ['Open chat', 13, true, 65.4],
    ['Allow Read outside the project: ~/.agents/RULES.md?', 12, true, 309.1],
    ['(1) [2] {3}: a.b, c; d! e? f.', 12, false, 131.77],
    ['(1) [2] {3}: a.b, c; d! e? f.', 12, true, 135.06],
    ['Allow Bash: ls -1 ./a/ | wc -l; ls -1 ./b/ | wc -l; ls -1 ./c/ | wc -l?', 12, true, 328.98],
    ['Allow Bash: rm -f ./a.js ./b.js ./c.js ./d.js ./e.js ./f.js ./g.js?', 12, true, 307.28],
  ]
  for (const [text, size, isBold, real] of measured) {
    const ratio = textWidth(text, size, { isBold }) / real
    expect([text, size, isBold, ratio >= 1.015 && ratio <= 1.05]).toEqual([text, size, isBold, true])
  }
})

type Measured = { text: string; prefixes: readonly number[]; ellipsis?: number }

const realOf = (entry: Measured, row: string, from: number) => {
  const body = row.endsWith('…') ? row.slice(0, -1) : row
  return (entry.prefixes[from + Array.from(body).length] ?? Infinity) - (entry.prefixes[from] ?? 0) + (row.endsWith('…') ? (entry.ellipsis ?? ELLIPSIS) : 0)
}

const rowsByRealWidth = (entry: Measured, room: number, size = 12, isBold = true) => {
  const rows = rowsOf(entry.text, room, size, 2, { isBold })
  const chars = Array.from(entry.text)
  const second = Array.from(rows[1]?.replace(/…$/, '') ?? '')
  let from = Array.from(rows[0] ?? '').length
  while (from < chars.length && chars.slice(from, from + second.length).join('') !== second.join('')) from += 1
  return rows.map((row, index) => ({ row, real: realOf(entry, row, index ? from : 0) }))
}

test('ask rows by real width: seven asks across rooms 120–330, each row measured in Chrome at 600/12, never wider than its room', () => {
  for (const ask of ASKS)
    for (let room = 120; room <= 330; room += 5)
      for (const { row, real } of rowsByRealWidth(ask, room)) expect([room, row, real <= room]).toEqual([room, row, true])
  expect(ASKS[0] && rowsByRealWidth(ASKS[0], 192.25).every(one => one.real <= 192.25)).toBe(true)
  expect(ASKS[1] && rowsByRealWidth(ASKS[1], 302).every(one => one.real <= 302)).toBe(true)
})

test('rows break at spaces first, then after a slash in a path; never after a hyphen that starts a token or inside a path', () => {
  const rows = rowsOf('Allow Bash: node --test hooks/lib/list.test.ts && cd ~/.claude/worktrees/wt-master-session-plugin-rows-v3', 150, 12, 4, { isBold: true })
  expect(rows.some(row => /-$/.test(row) || /^-[^-]/.test(row))).toBe(false)
  expect(rows.some(row => row.endsWith('wt-') || row.endsWith('master-'))).toBe(false)
  const command = rowsOf('cd ~/.claude/worktrees/wt-master-session-plugin-rows-v3 && npm run build', 200, 12, 3, { isMono: true })
  expect(command[0]).toBe('cd ~/.claude/worktrees/')
  expect(rowsOf('every-worktree-is-merged-back-into-main-before-the-archive', 120, 12, 3)[0]?.endsWith('-')).toBe(true)
  const isFull = (row: string, rest: string, room: number) => textWidth(`${row}${Array.from(rest)[0] ?? ''}`, 12) > room
  const flag = '--test-name-pattern=every-row-of-the-band-suite'
  const [first = ''] = rowsOf(flag, 100, 12, 2)
  expect(isFull(first, flag.slice(first.length), 100)).toBe(true)
  const path = 'cd ~/x/wt-master-session-plugin-rows-v3-with-a-longer-name && npm test'
  const [, second = ''] = rowsOf(path, 100, 12, 3)
  expect([second.includes('-'), isFull(second, path.slice(path.indexOf(second) + second.length), 100)]).toEqual([true, true])
})

test('tabular digits: the elapsed time is measured at 0.64 em per digit as it renders, so the ask beside it stays inside its real column', async ($, on) => {
  expect(textWidth('11m', 12)).toBeGreaterThanOrEqual(25.81)
  seeded(on, [
    { id: 't1', name: 'band diff', type: 'master-session:reviewer', description: 'Review', state: 'running', startedAt: 2_940_000, asking: { text: 'Allow Bash: bun install && bun run build && bun test?', since: 3_590_000 } },
    { id: 't2', name: 'canvas v3 check', type: 'master-session:reviewer', description: 'Check', state: 'running', startedAt: 3_589_000, asking: { text: 'Allow Read outside the project: ~/.agents/RULES.md?', since: 3_590_000 } },
  ])
  await started($, on)
  for (const [bodyColumns, id, elapsed, real] of [[46, 't1', '11m', 25.81], [44, 't2', '11s', 21.52]] as const) {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns } })
    expect(textsIn((await ui.find({ key: `row-${id}` }))?.children)).toContain(elapsed)
    const ask = ASKS.find(one => one.text.startsWith(id === 't1' ? 'Allow Bash: bun' : 'Allow Read')) ?? { text: '', prefixes: [] }
    const column = bodyWidthOf(bodyColumns) - 88 - (16 + real + 12) - 16
    const rows = ((await ui.find({ key: `row-${id}-ask-rows` }))?.children ?? []).map(row => String(textsIn(row).at(-1)))
    let from = 0
    for (const row of rows) {
      expect([bodyColumns, row, realOf(ask, row, from) <= column]).toEqual([bodyColumns, row, true])
      from = ask.text.indexOf(rows[rows.indexOf(row) + 1]?.replace(/…$/, '') ?? '', from + Array.from(row).length)
    }
    await ui.unmount()
  }
})

test('wide glyphs by real width: Æ Œ, Cyrillic, arrows and box drawing, ✓ ★, emoji lines at 12 and 13 px, 400 and 600 — every row, measured in Chrome, fits its room at any width', () => {
  for (const ask of WIDE_ASKS)
    for (let room = 100; room <= 330; room += 5)
      for (const { row, real } of rowsByRealWidth(ask, room, ask.size, ask.isBold)) expect([ask.size, room, row, real <= room]).toEqual([ask.size, room, row, true])
  for (const [index, room] of [[0, 156], [1, 120], [2, 291], [3, 150]] as const) {
    const ask = WIDE_ASKS[index]
    expect(ask && rowsByRealWidth(ask, room, ask.size, ask.isBold).every(one => one.real <= room)).toBe(true)
  }
  expect(textWidth('Æ', 12)).toBeGreaterThanOrEqual(1.1 * 12)
  expect(textWidth('é', 12)).toBe(textWidth('e', 12))
  expect(textWidth('Å', 12, { isBold: true })).toBe(textWidth('A', 12, { isBold: true }))
  expect(textWidth('Ж', 13, { isBold: true })).toBeGreaterThanOrEqual(1.1 * 13)
  expect(Math.round(textWidth('漢', 12) * 1000)).toBe(Math.round(1.02 * 12 * 1.02 * 1000))
  expect(Math.round(textWidth('🚀', 12) * 1000)).toBe(Math.round(1.25 * 12 * 1.02 * 1000))
  expect(textWidth('🚀', 13, { isBold: true })).toBeGreaterThanOrEqual(ROCKET_PX[13] ?? Infinity)
})

test('digits count 0.64 em each, the tabular advance the desktop draws for every Text, at both weights; other characters keep their own widths', () => {
  const px = (value: number) => Math.round(value * 1000) / 1000
  expect(px(textWidth('1111', 12))).toBe(px(4 * 0.64 * 12 * 1.02))
  expect(px(textWidth('1', 12))).toBe(px(textWidth('8', 12)))
  expect(px(textWidth('11m', 12) - textWidth('m', 12))).toBe(px(2 * 0.64 * 12 * 1.02))
  expect(px(textWidth('0', 12, { isBold: true }))).toBe(px(0.64 * 12 * 1.02))
})

test('KPI tile text matches the live desktop pane: 14 tile labels and subs read from a retina screenshot (1 css px = 2.315 px, set by the 16.2 px tabular digit pitch), ink plus the font’s side bearings, all within −3 % / +9 % of textWidth at the caption size', () => {
  const live: [string, boolean, number][] = [
    ['Sessions', true, 47.49],
    ['Needs you', true, 56.06],
    ['Subagents', true, 56.57],
    ['Workflows', true, 55.68],
    ['Commits', true, 47.63],
    ['Tests', true, 27.94],
    ['Duration', true, 45.7],
    ['Git', true, 15.59],
    ['1 session', false, 49.27],
    ['none', false, 26.3],
    ['2 repos', false, 40.57],
    ['475 passed', false, 63.04],
    ['since 12:29', false, 61.67],
    ['clean', false, 28.85],
  ]
  for (const [text, isBold, real] of live) {
    const ratio = textWidth(text, CAPTION, { isBold }) / real
    expect([text, Math.round(ratio * 1000) / 1000, ratio >= 0.97 && ratio <= 1.09]).toEqual([text, Math.round(ratio * 1000) / 1000, true])
  }
})
