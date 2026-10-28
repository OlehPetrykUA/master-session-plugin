import { expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord, Board, BoardSession, Live, PlanPiece, Repo, WorkflowRecord } from '../../../types'

import { BAR_MIN, ELAPSED_ICON, PILL_WIDTH, askToolOf, askingChatOf, countsOf, bandAction, bandProgress, bandProgressWith, bandSetOf, bandUnitsOf, bandViewOf, countsText, countsWidthOf, overallOf, percentOf } from '../../lib/band'
import type { AgentCounts, InRunCounts } from '../../lib/band'
import { CH, across, tall, textWidth, widthOf } from '../../lib/layout'
import { BAND, BOARD_TOOL, PANE, SELF, SPAWN, click, started, text, warmUp, world } from '../../testing/world'
import { PERCENT } from '../../theme/band'
import { glyph } from '../../theme/icons'
import { glowOf, strip } from '../../theme/strip'
import { C } from '../../theme/tokens'
import { guardSvg } from '../guard'
import { Band } from './Band'
import { TextBand } from './TextBand'

const PROBE = 'band-probe'

const WORKING: BoardSession[] = [
  { id: 'local_a', name: 'setup-ui-redo', state: 'waiting', progress: 'step 4 of 5 — mockups' },
  { id: 'local_b', name: 'mod-ui', state: 'working', progress: 'step 3 of 5 — pane' },
  { id: 'local_c', name: 'mod-data', state: 'working', progress: 'step 4 of 5 — reports' },
  { id: 'local_d', name: 'conductor-redo', state: 'done', progress: 'step 5 of 5 — shipped' },
]

const NEEDS: BoardSession[] = [{ id: 'local_e', name: 'env-e2e-test', state: 'needs-you', progress: 'step 1 of 2 — fix', needsYou: 'commit blocked' }, ...WORKING]

const DONE: BoardSession[] = WORKING.map(one => ({ ...one, state: 'done' }))

const boardOf = (sessions: BoardSession[]): Board => ({ sessions, needsYou: [], repos: [], source: 'tool' })

const publish = (sessions: BoardSession[]) => ({ tick: '09:00', sessions, needsYou: [], repos: [] })

const liveOf = (archived: string[] = [], workers: BoardSession[] = NEEDS, idle: string[] = []): Live => ({
  self: SELF,
  title: '',
  error: '',
  at: 0,
  sessions: workers.map(one => ({ id: one.id, name: one.name, title: '', cwd: '/', isRunning: !idle.includes(one.id), isArchived: archived.includes(one.id), lastActivityAt: 0, startedBy: SELF })),
})

type Linked = { sessionId: string; name: string; title: string; cwd: string; isRunning: boolean; isArchived: boolean; lastActivityAt: string; startedBy?: string }

const linkedOf = (id: string, name: string, isRunning: boolean, isArchived = false): Linked => ({ sessionId: id, name, title: name, cwd: '/', isRunning, isArchived, lastActivityAt: '1970-01-01T00:50:00.000Z', startedBy: SELF })

type McpHook = (context: unknown, event: { tool: string }) => unknown

async function band($: Engine, on: On, sessions: BoardSession[], isPaneOpen = false, linked: Linked[] = []) {
  let isOpen = isPaneOpen
  let isHidden = false
  on('ui.panes', () => ({ value: isOpen ? [{ id: 'master-session', title: 'Master session', isShown: !isHidden, isFocused: false, isPlaced: true }] : [] }))
  const register = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const scoped = (event: string, ...rest: unknown[]) => {
    if (event === 'ui.panes') return undefined
    if (event !== 'mcp.call') return register(event, ...rest)
    const inner = rest[0] as McpHook
    return register(event, (context: unknown, call: { tool: string }) => (call.tool === 'list_sessions' ? text(linked) : inner(context, call)))
  }
  const closed: string[] = []
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  const run = await started($, scoped as unknown as On, publish(sessions))
  return { ...run, closed, open: (value: boolean) => (isOpen = value), hide: () => (isHidden = true) }
}

const mount = ($: Engine, bodyColumns = 100) => $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns } })

type Counts = Pick<AgentCounts, 'agents' | 'workflows' | 'at'>

const inRun = (counts: Counts) => counts as InRunCounts

const IDLE = inRun({ agents: [], workflows: [], at: 0 })

const progressOf = (current: Board | null, live: Live) => bandProgress(bandSetOf(current, IDLE, live, [], true).rows, current, live)

function crewOf($: Engine, on: On) {
  let running: string[] = []
  let runs = 0
  on('agent.spawn', (_, event) => {
    const agentId = event.workflow ? `${event.workflow.runId}-${event.workflow.agentIndex}` : event.description
    running = event.workflow ? running : [...running, agentId]
    return { model: 'claude-haiku-5-5', agentId }
  })
  on('agent.list', () => ({ value: running.map(id => ({ id, description: id, type: 'general-purpose', status: 'running' as const })) }))
  on('turn.complete', (_, event) => {
    running = running.filter(id => id !== event.agentId)
    return { text: event.answer }
  })
  on('tool.call', { tool: 'Workflow' }, () => {
    runs += 1
    return { result: { status: 'async_launched' as const, taskId: `task${runs}`, taskType: 'local_workflow' as const, workflowName: 'review-changes', runId: `wf_${runs}`, summary: 'Review' }, text: 'Workflow launched in background.' }
  })
  return {
    subagent: (description: string) => $.agent.spawn({ ...SPAWN, description, subagentType: 'general-purpose' }),
    workflow: async (agents: number) => {
      await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'review-changes' }" })
      for (const index of [...Array(agents).keys()]) await $.agent.spawn({ ...SPAWN, description: `scan ${index}`, subagentType: 'workflow-subagent', workflow: { runId: `wf_${runs}`, agentIndex: index } })
    },
    finish: (agentId: string) => $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: `turn-${agentId}`, agentId, reason: 'answer' }),
  }
}


const wideColumns = Math.ceil((900 + 16) / CH)

const columnsFor = (width: number) => Math.ceil((width + 16) / CH)

type Found = { findAll: (query: { type?: string }) => Promise<FoundElement[]>; find: (query: { key?: string }) => Promise<FoundElement | undefined> }

const textsOf = async (ui: Found) => (await ui.findAll({ type: 'Text' })).map(one => one.text.replace(/[  ]/g, '').trim())

const buttonsOf = async (ui: Found) => (await ui.findAll({ type: 'Button' })).map(one => [one.key, String(one.props.label)])

const hitsOf = async (ui: Found) => (await ui.findAll({ type: 'Client' })).map(one => [one.key, one.props.module, one.props.props])

const stripOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).find(one => String(one.props.source).includes('width="4096"'))

const barWidthOf = async (ui: Found) => Number(String((await stripOf(ui))?.props.source).match(/viewBox="0 0 ([\d.]+) 6"/)?.[1])

const faceOf = async (ui: Found) => (await ui.findAll({ type: 'Box' })).filter(one => one.key?.startsWith('face-band-'))

const iconsOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).filter(one => !String(one.props.source).includes('width="4096"')).map(one => String(one.props.alt))

const percentIn = async (ui: Found) => (await textsOf(ui)).find(one => /^\d+%$/.test(one))

const countsIn = async (ui: Found) => (await ui.findAll({ type: 'Text' })).find(one => /^(\d+\/\d+|All \d+ done)$/.test(one.text))

const scopesOf = async (ui: Found) => (await faceOf(ui)).map(one => one.key)

warmUp()

const crewValues = (crew: Counts, sessions: BoardSession[] = WORKING, archived: string[] = []) => {
  const live = liveOf(archived, sessions)
  return bandUnitsOf(progressOf(boardOf(sessions), live)?.segments ?? [], boardOf(sessions), inRun(crew), live)
}

const agentOf = (id: string, state: AgentRecord['state'], extra: Partial<AgentRecord> = {}): AgentRecord => ({ id, type: 'general-purpose', description: id, state, startedAt: 1, ...extra })

const CREW = (asking: { own?: boolean; remote?: boolean; flow?: boolean } = {}) => {
  const ask = { text: 'Allow Bash: rm -rf dist', since: 1 }
  return inRun({
    agents: [
      { id: 'o1', name: 'QA verifier', type: 'master-session:qa-verifier', description: 'Verify the sha', state: 'running' as const, startedAt: 1 },
      { id: 'o2', name: 'Reviewer', type: 'master-session:reviewer', description: 'Review the diff', state: 'running' as const, startedAt: 2, parentAgentId: 'o1', ...(asking.own ? { asking: ask } : {}) },
      { id: 'r1', name: 'QA verifier', type: 'master-session:qa-verifier', description: 'Verify', state: 'running' as const, startedAt: 3, parentSessionId: 'local_b' },
      { id: 'r2', name: 'Reviewer', type: 'master-session:reviewer', description: 'Review', state: 'running' as const, startedAt: 4, parentSessionId: 'local_b', parentAgentId: 'r1', ...(asking.remote ? { asking: ask } : {}) },
      { id: 'x0', type: 'workflow-subagent', description: 'remote scan', state: 'running' as const, startedAt: 5, parentSessionId: 'local_c', run: { id: 'wf_9', index: 0 } },
      { id: 'w0', type: 'workflow-subagent', description: 'scan 0', state: 'done' as const, startedAt: 6, endedAt: 7, run: { id: 'wf_1', index: 0 } },
      { id: 'w1', type: 'workflow-subagent', description: 'scan 1', state: 'running' as const, startedAt: 8, run: { id: 'wf_1', index: 1 }, ...(asking.flow ? { asking: { ...ask, text: 'Allow Edit: a.ts' } } : {}) },
    ],
    workflows: [{ id: 'wf_1', toolUseId: 't1', name: 'review-changes', phases: ['Scan', 'Check'], startedAt: 6 }],
    at: 0,
  })
}


const viewOf = (sessions: BoardSession[], crew: Counts, columns = 100) => {
  const current = boardOf(sessions)
  const live = liveOf([], sessions)
  const progress = progressOf(current, live)
  if (!progress) throw new Error('no band')
  const chats: string[] = []
  const view = bandViewOf(columns, current, progress, false, inRun(crew), { board: () => chats.push('board'), chat: (id, name) => chats.push(`${id} ${name}`) }, live)
  return { view, chats }
}


test('no band with no board and no worker of mine, with an empty board and no workers, or with every worker archived; archived ones drop out', () => {
  const outsider = { id: 'local_x', name: 'outsider', title: '', cwd: '/', isRunning: true, isArchived: false, lastActivityAt: 0 }
  expect(progressOf(null, { ...liveOf([], []), sessions: [outsider] })).toBeUndefined()
  expect(progressOf(boardOf([]), liveOf([], []))).toBeUndefined()
  expect(progressOf(boardOf(WORKING), liveOf(WORKING.map(one => one.id), WORKING))).toBeUndefined()
  expect(progressOf(boardOf(NEEDS), liveOf(['local_b']))?.segments.map(one => one.id)).toEqual(['local_e', 'local_a', 'local_c', 'local_d'])
  expect(progressOf(boardOf(WORKING), liveOf([], WORKING))?.segments.map(one => one.fill)).toEqual([0.8, 0.6, 0.8, 1])
})



test('unit values: a session is steps done over total and 1 when done, a subagent 0 until it finishes (done or failed) then 1, a run is its agents finished over its agents', () => {
  expect(crewValues(IDLE).map(one => [one.value, one.isFinished])).toEqual([
    [0.8, false],
    [0.6, false],
    [0.8, false],
    [1, true],
  ])
  const crew = { agents: [agentOf('s1', 'running'), agentOf('s2', 'done'), agentOf('s3', 'failed'), agentOf('n1', 'running', { parentAgentId: 's1' })], workflows: [], at: 0 }
  expect(crewValues(crew, []).map(one => [one.value, one.isRunning])).toEqual([
    [0, true],
    [0, true],
    [1, false],
    [1, false],
  ])
  const run = (states: AgentRecord['state'][]) => ({ agents: states.map((state, index) => agentOf(`w${index}`, state, { type: 'workflow-subagent', run: { id: 'wf_1', index } })), workflows: [], at: 0 })
  const valueOf = (states: AgentRecord['state'][]) => crewValues(run(states), [])[0]
  expect([valueOf(['done', 'running', 'running'])?.value, valueOf(['done', 'failed', 'running', 'running'])?.value, valueOf(['running'])?.value]).toEqual([1 / 3, 0.5, 0])
  expect([valueOf(['done', 'failed']), valueOf(['done', 'failed'])?.isFinished]).toEqual([expect.objectContaining({ value: 1, isRunning: false }), true])
})

test('overall is the mean of the unit values and the percent its floor: 2 of 3 steps is 66, a finished session at 5 of 5 that still works is 99, and 100 needs every unit finished', () => {
  const only = (progress: string, state: BoardSession['state'] = 'working') => crewValues(IDLE, [{ id: 'local_a', name: 'a', state, progress }])
  expect(percentOf(only('step 2 of 3 — x'))).toBe(66)
  expect(percentOf(only('step 5 of 5 — x'))).toBe(99)
  expect(percentOf(only('step 5 of 5 — x', 'done'))).toBe(100)
  const units = crewValues({ agents: [agentOf('s1', 'running')], workflows: [], at: 0 })
  expect(Math.abs(overallOf(units) - 3.2 / 5)).toBeLessThan(1e-9)
  expect(percentOf(units)).toBe(64)
  expect(percentOf([])).toBe(0)
  const tenths = crewValues(IDLE, Array.from({ length: 100 }, (_, index) => ({ id: `local_${index}`, name: `n${index}`, state: 'working' as const, progress: `step ${index < 29 ? 1 : 0} of 1 — x` })))
  expect(Math.abs(overallOf(tenths) - 0.29)).toBeLessThan(1e-9)
  expect(percentOf(tenths)).toBe(29)
})

test('finishing never lowers the overall: a subagent and a run agent stay counted as 1', () => {
  const before = { agents: [agentOf('s1', 'running'), agentOf('w0', 'done', { run: { id: 'wf_1', index: 0 } }), agentOf('w1', 'running', { run: { id: 'wf_1', index: 1 } })], workflows: [], at: 0 }
  const mid = percentOf(crewValues(before))
  const after = { agents: before.agents.map(one => (one.id === 's1' ? { ...one, state: 'done' as const } : one)), workflows: [], at: 0 }
  expect(percentOf(crewValues(after))).toBeGreaterThanOrEqual(mid)
  const ended = { agents: after.agents.map(one => ({ ...one, state: 'done' as const })), workflows: [], at: 0 }
  expect(percentOf(crewValues(ended))).toBeGreaterThanOrEqual(percentOf(crewValues(after)))
})

const own = (id: string, extra: Partial<AgentRecord> = {}) => agentOf(id, 'running', extra)

const ASKING = { text: 'which one?', since: 1 }

const AT = 1_000_000

const TREES: Repo[] = [
  {
    path: '/r',
    name: 'r',
    localOnly: 0,
    base: 'main',
    onBase: ['abc1234'],
    worktrees: [
      { path: '/r/one', branch: 'one', sha: 'abc1234', isMain: false, dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0, unmerged: 0 },
      { path: '/r/two', branch: 'two', sha: 'def5678', isMain: false, dirty: 0, paths: [], upstream: '', ahead: 0, behind: 0, unmerged: 2 },
    ],
  },
]

const READY: BoardSession = { id: 'local_r', name: 'ready-one', state: 'done', progress: 'step 4 of 4 — x', sha: 'abc1234', cwd: '/r/one' }

type Fixture = { name: string; sessions: BoardSession[]; agents: AgentRecord[]; workflows?: WorkflowRecord[]; trees?: Repo[]; family?: boolean; outsiders?: boolean; text: string }

const FIXTURES: Fixture[] = [
  { name: 'no sessions, a running subagent and a running workflow', sessions: [], agents: [own('s1'), own('w0', { type: 'workflow-subagent', run: { id: 'wf_1', index: 0 } })], text: '0/2' },
  { name: 'sessions only', sessions: WORKING, agents: [], text: '1/4' },
  { name: 'an asking subagent', sessions: WORKING, agents: [own('s1', { asking: ASKING })], text: '' },
  { name: 'a running parent subagent with a running child', sessions: [], agents: [own('s1'), own('n1', { parentAgentId: 's1' })], text: '0/2' },
  { name: 'a worker with a remote running run', sessions: WORKING, agents: [own('x0', { parentSessionId: 'local_c', run: { id: 'wf_9', index: 0 } })], text: '1/5' },
  { name: 'a local run and a remote running run', sessions: WORKING, agents: [own('w0', { run: { id: 'wf_1', index: 0 } }), own('x0', { parentSessionId: 'local_c', run: { id: 'wf_9', index: 0 } })], text: '1/6' },
  { name: 'a records-only workflow older than 120 s', sessions: [], agents: [], workflows: [{ id: 'wf_old', toolUseId: 't', startedAt: AT - 121_000 }], text: '' },
  { name: 'a ready session whose family has unmerged commits', sessions: [READY], agents: [], trees: TREES, family: true, text: '0/1' },
  { name: 'no board and sessions that are not workers', sessions: [], agents: [], outsiders: true, text: '' },
  { name: 'a mix', sessions: NEEDS, agents: [own('s1'), own('n1', { parentAgentId: 's1' }), agentOf('d1', 'done'), own('r1', { parentSessionId: 'local_b' }), own('w0', { run: { id: 'wf_1', index: 0 } }), own('x0', { parentSessionId: 'local_c', run: { id: 'wf_9', index: 0 } })], text: '' },
]

const READY_LIVE: Live['sessions'][number] = { id: '', name: 'out', title: 'out', cwd: '/', isRunning: false, isArchived: false, lastActivityAt: 0, startedBy: 'someone-else' }

const fixtureLive = (fixture: Fixture): Live => {
  const live = liveOf([], fixture.sessions)
  if (fixture.outsiders) return { ...live, sessions: [{ ...READY_LIVE, id: 'o1', isRunning: true }, { ...READY_LIVE, id: 'o2', isRunning: false }] }
  if (!fixture.family) return live
  const side = { id: 'local_f', name: 'side', title: '', cwd: '/r/two', isRunning: false, isArchived: false, lastActivityAt: 0, startedBy: READY.id }
  return { ...live, sessions: live.sessions.map(one => ({ ...one, cwd: '/r/one' })), family: [...live.sessions.map(one => ({ ...one, cwd: '/r/one' })), side] }
}

const NO_ACT = { board: () => undefined, chat: () => undefined }

for (const fixture of FIXTURES) test(`the band count reads finished/units, and nothing when it has no band or a pill: ${fixture.name}`, () => {
  const board = fixture.outsiders ? null : boardOf(fixture.sessions)
  const counts = inRun({ agents: fixture.agents, workflows: fixture.workflows ?? [], at: AT })
  const live = fixtureLive(fixture)
  const progress = bandProgressWith(board, live, counts)
  const view = progress && bandViewOf(200, board, progress, false, counts, NO_ACT, live, fixture.trees ?? [])
  expect(view ? countsText(view.parts) : '').toBe(fixture.text)
})

test('the band reads finished/units: one own subagent running reads 0/1, one subagent and one workflow running read 0/2', () => {
  const texts = (agents: AgentRecord[]) => {
    const counts = inRun({ agents, workflows: [], at: 0 })
    const view = bandViewOf(100, null, bandProgressWith(null, liveOf([], []), counts) ?? { segments: [], total: 0 }, false, counts, NO_ACT, liveOf([], []))
    return countsText(view.parts)
  }
  expect(texts([own('s1')])).toBe('0/1')
  expect(texts([own('s1'), own('w0', { run: { id: 'wf_1', index: 0 } })])).toBe('0/2')
})

test('units count the master’s own subagents and runs, each worker’s subagents and runs, and the ones of a worker that is gone', () => {
  const crew = {
    agents: [
      agentOf('o1', 'running'),
      agentOf('r1', 'running', { parentSessionId: 'local_b' }),
      agentOf('g1', 'running', { parentSessionId: 'local_gone' }),
      agentOf('x0', 'running', { parentSessionId: 'local_c', run: { id: 'wf_9', index: 0 } }),
      agentOf('w0', 'done', { run: { id: 'wf_1', index: 0 } }),
    ],
    workflows: [], at: 0,
  }
  const { view } = viewOf(WORKING, crew)
  expect([view.percent, countsText(view.parts)]).toEqual([46, '2/9'])
})

test('fill tone: red when anyone needs you, else green while anything runs, else grey; green and full when all done', () => {
  const view = (sessions: BoardSession[], crew: Counts = IDLE) => viewOf(sessions, crew).view
  const waiting = WORKING.map(one => ({ ...one, state: 'waiting' as const }))
  expect([view(NEEDS).tone, view(WORKING).tone, view(waiting).tone, view(DONE).tone]).toEqual(['red', 'green', 'grey', 'green'])
  expect(view(NEEDS, { agents: [agentOf('s1', 'running')], workflows: [], at: 0 }).tone).toBe('red')
  expect(view(waiting, { agents: [agentOf('s1', 'running')], workflows: [], at: 0 }).tone).toBe('green')
  expect(view(waiting, { agents: [agentOf('s1', 'done')], workflows: [], at: 0 }).tone).toBe('grey')
  expect([view(DONE).isAllDone, view(DONE).isRunning, view(DONE).overall]).toEqual([true, false, 1])
})


test('the user’s case: every session done and 2 subagents running reads 66% and running, with the slider, never "All N done"', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, DONE)
  await crew.subagent('docs')
  await crew.subagent('review')
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['66%', '4/6', '4', '6', '<1m', 'Open board'])
  const source = String((await stripOf(ui))?.props.source)
  expect(source).toContain('linearGradient')
  expect(source).toContain('fill:var(--green)')
  expect((await stripOf(ui))?.props.alt).toBe('Master session: 66 percent, 4 of 6 done. <1m elapsed.')
  await crew.finish('docs')
  await crew.finish('review')
  await ui.unmount()
  const done = await mount($)
  expect((await textsOf(done)).slice(0, 1)).toEqual(['All 6 done'])
  expect((await textsOf(done)).includes('Open board')).toBe(true)
  expect(String((await stripOf(done))?.props.source)).not.toContain('linearGradient')
  await done.unmount()
})

test('the highlight: a still white band 0 → .55 → 0 of max(16, 30% of the fill) at 35%, clipped to the fill while anything runs; none when nothing runs; nothing ever animates', () => {
  const running = strip({ width: 200, overall: 0.5, tone: 'green', isSliding: true })
  expect(running).not.toContain('animate')
  expect(running).not.toContain('class="m"')
  expect(running).toContain('stop-opacity="0"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>')
  expect(running).toContain('<g clip-path="url(#c)">')
  expect(running).toContain('<clipPath id="c"><path d="M3.0,0h94.0a3,3 0 0 1 0,6h-94.0a3,3 0 0 1 0,-6Z"/></clipPath>')
  expect(running).toContain('<rect x="35.0" y="0" width="30.0" height="6" fill="url(#k)"/>')
  expect(glowOf(100)).toBe(30)
  expect(glowOf(40)).toBe(16)
  expect(strip({ width: 200, overall: 0.05, tone: 'green', isSliding: true })).toContain('width="16.0" height="6" fill="url(#k)"/>')
  const still = strip({ width: 200, overall: 0.5, tone: 'green', isSliding: false })
  expect(still).not.toContain('animate')
  expect(still).not.toContain('linearGradient')
  expect(still).not.toContain('class="s"')
})

test('the bar is one capsule 6 high: the track at full width, the fill overall × width and at least 10 once above 0, none at 0, full when all done, in one tone var', () => {
  const capsule = (width: number) => `M3.0,0h${(width - 6).toFixed(1)}a3,3 0 0 1 0,6h${(6 - width).toFixed(1)}a3,3 0 0 1 0,-6Z`
  const fillOnly = (source: string, tone: string) => source.match(new RegExp(`<path d="([^"]*)" style="fill:var\\(--${tone}\\)"/>`))?.[1]
  const source = strip({ width: 300, overall: 0.25, tone: 'green', isSliding: false })
  expect(source).toContain('height="6" viewBox="0 0 300 6"')
  expect(fillOnly(source, 'track')).toBe(capsule(300))
  expect(fillOnly(source, 'green')).toBe(capsule(75))
  expect(fillOnly(strip({ width: 300, overall: 0.01, tone: 'grey', isSliding: false }), 'grey')).toBe(capsule(10))
  expect(fillOnly(strip({ width: 300, overall: 0, tone: 'grey', isSliding: false }), 'grey')).toBeUndefined()
  expect(fillOnly(strip({ width: 300, overall: 1, tone: 'red', isSliding: false }), 'red')).toBe(capsule(300))
  expect(source).toContain('--track:rgba(31,30,29,0.10);--grey:#87867F;--green:#3F7A35;--red:#C2413B')
  expect(source).toContain('@media (prefers-color-scheme: dark){svg{--track:rgba(250,249,245,0.12);--grey:#9C9A92;--green:#7BC46A;--red:#F06A60}}')
})

test('working, pane closed: percent, one bar with the slider, uniform counts, and one Open board pressable over its whole face opens the pane', async ($, on) => {
  const { opened } = await band($, on, WORKING)
  const ui = await mount($)
  const bar = await stripOf(ui)
  expect(bar?.props.alt).toBe('Master session: 80 percent, 1 of 4 done. <1m elapsed.')
  expect(bar?.props.isInteractive).toBeUndefined()
  expect(await textsOf(ui)).toEqual(['80%', '1/4', '1', '4', '<1m', 'Open board'])
  expect(await buttonsOf(ui)).toEqual([])
  const [hit] = await hitsOf(ui)
  const columns = (hit?.[2] as { columns: number }).columns
  expect(hit).toEqual(['band-hit-board', 'hooks/components/press.tsx', { id: 'band-hit-board', columns, rows: 2 }])
  expect(columns * CH).toBeGreaterThanOrEqual(Number((await ui.find({ key: 'face-band-board' }))?.props.width) * CH)
  await click(ui, 'band-hit-board', columns - 1, 1)
  expect(opened).toEqual(['master-session'])
  await ui.unmount()
})

test('counts: done/total, numbers and slash 600 C.text, numbers tabular, with no words and no zero counts', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING)
  const styleOf = async (ui: Found) => {
    const counts = await countsIn(ui)
    const numbers = (await ui.findAll({ type: 'Text' })).filter(one => one.props.weight === 'semibold' && /^\d+$/.test(one.text))
    return { text: counts?.text, parent: [counts?.props.color, counts?.props.weight], numbers: numbers.map(one => [one.text, one.props.color, one.props.weight, one.props.tabular]) }
  }
  const none = await mount($)
  expect(await styleOf(none)).toEqual({ text: '1/4', parent: ['text', 'semibold'], numbers: [['1', 'text', 'semibold', true], ['4', 'text', 'semibold', true]] })
  await none.unmount()
  await crew.subagent('docs')
  await crew.subagent('review')
  await crew.workflow(3)
  const all = await mount($)
  const found = await styleOf(all)
  expect(found.text).toBe('1/7')
  expect(String((await all.findAll({ type: 'Svg' })).find(one => one.props.alt === 'elapsed')?.props.source)).toBe(glyph('elapsed', ELAPSED_ICON, 'muted', 2.2))
  expect(found.parent).toEqual(['text', 'semibold'])
  expect(found.numbers).toEqual(['1', '7'].map(value => [value, 'text', 'semibold', true]))
  expect((await stripOf(all))?.props.alt).toBe('Master session: 45 percent, 1 of 7 done. <1m elapsed.')
  const colors = (await all.findAll({ type: 'Text' })).filter(one => one.text !== 'Open board' && !/%$/.test(one.text)).map(one => one.props.color)
  expect(new Set(colors)).toEqual(new Set(['inactive', 'text']))
  await all.unmount()
  await crew.finish('docs')
  await crew.finish('review')
  for (const index of [0, 1, 2]) await crew.finish(`wf_1-${index}`)
  const after = await mount($)
  expect((await styleOf(after)).text).toBe('4/7')
  await after.unmount()
  expect(countsText(countsOf(3, 7))).toBe('3/7')
})

test('needs you: the pill first, then the red bar, then Open chat; no percent and no counts; Open chat opens that worker', async ($, on) => {
  const { calls } = await band($, on, NEEDS, true, [linkedOf('local_e', 'env-e2e-test', true)])
  const ui = await mount($, 100)
  const bar = await stripOf(ui)
  expect(bar?.props.alt).toBe('Master session: Session · env-e2e-test needs you, commit blocked')
  expect(String(bar?.props.source)).toContain('fill:var(--red)')
  expect(await textsOf(ui)).toEqual(['Session · env-e2e-test needs you · commit blocked', 'Open chat'])
  expect(await percentIn(ui)).toBeUndefined()
  expect(await countsIn(ui)).toBeUndefined()
  expect(await iconsOf(ui)).toEqual(['session', 'Open chat'])
  const order = (await ui.findAll({})).filter(one => one.type === 'Svg' || one.key === 'face-band-chat' || one.props.borderColor === 'error').map(one => (one.type === 'Svg' ? (String(one.props.source).includes('width="4096"') ? 'bar' : one.props.alt) : one.props.borderColor === 'error' ? 'pill' : 'chat'))
  expect(order).toEqual(['pill', 'session', 'bar', 'chat', 'Open chat'])
  expect((await hitsOf(ui)).map(one => one[0])).toEqual(['band-hit-chat'])
  await click(ui, 'band-hit-chat', 1, 0)
  expect(calls.filter(one => one.tool === 'open_session_in').map(one => one.args.session_id)).toEqual(['local_e'])
  await ui.unmount()
  const narrow = await mount($, columnsFor(330))
  expect(await textsOf(narrow)).toEqual(['Session needs you'])
  expect(await iconsOf(narrow)).toEqual(['session'])
  expect(await hitsOf(narrow)).toEqual([])
  await narrow.unmount()
})

test('all done: the check, the full green bar with no slider, "All N done" counting every unit, and the button reads Hide board while the pane is open', async ($, on) => {
  const run = await band($, on, DONE)
  const ui = await mount($)
  const bar = await stripOf(ui)
  expect(bar?.props.alt).toBe('Master session: all 4 done. <1m elapsed.')
  expect(String(bar?.props.source)).toContain('fill:var(--green)')
  expect(String(bar?.props.source)).not.toContain('animate')
  expect(await textsOf(ui)).toEqual(['All 4 done', '<1m', 'Open board'])
  expect(await iconsOf(ui)).toEqual(['check', 'elapsed', 'Open board'])
  expect(await percentIn(ui)).toBeUndefined()
  run.open(true)
  await click(ui, 'band-hit-board', 2, 1)
  await run.clock.settle()
  expect(run.opened).toEqual([])
  expect(run.closed).toEqual(['master-session'])
  expect((await textsOf(ui)).includes('Open board')).toBe(false)
  expect((await textsOf(ui)).includes('Hide board')).toBe(true)
  await ui.unmount()
})

test('with the pane open the one button reads Hide board and a press closes the pane and opens nothing',async ($, on) => {
  const run = await band($, on, WORKING, true)
  const ui = await mount($)
  expect((await textsOf(ui)).filter(one => one === 'Hide board')).toHaveLength(1)
  expect((await textsOf(ui)).filter(one => one === 'Open board')).toHaveLength(0)
  expect(await iconsOf(ui)).toContain('Hide board')
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  expect(run.closed).toEqual(['master-session'])
  expect(run.opened).toEqual([])
  await ui.unmount()
})

test('a Pane draw still in flight when the pane closes does not restart the open timers', async ($, on) => {
  const run = await band($, on, WORKING, true)
  const first = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const ui = await mount($)
  await run.clock.settle()
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  expect(run.closed).toEqual(['master-session'])
  run.open(false)
  await first.unmount()
  const late = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await run.clock.settle()
  const before = run.reads.count
  await run.clock.advance(10_000)
  await run.clock.settle()
  expect(run.reads.count).toBe(before)
  await late.unmount()
  await ui.unmount()
})

test('with the pane closed the board button reads Open board and a press opens it and closes nothing',async ($, on) => {
  const shut = await band($, on, WORKING)
  const again = await mount($)
  expect((await textsOf(again)).filter(one => one === 'Open board')).toHaveLength(1)
  await click(again, 'band-hit-board', 1, 1)
  await shut.clock.settle()
  expect(shut.opened).toEqual(['master-session'])
  expect(shut.closed).toEqual([])
  await again.unmount()
})

test('exactly one board button, restyled in place on hover, never a second face: Open board while the pane is closed, Hide board while it is open', async ($, on) => {
  const run = await band($, on, WORKING)
  const ui = await mount($)
  expect(await scopesOf(ui)).toEqual(['face-band-board'])
  type Node = { props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: unknown[] }
  const flat = (node: unknown): Node[] => (node && typeof node === 'object' ? [node as Node, ...((node as Node).children ?? []).flatMap(flat)] : [])
  const nodes = flat(await ui.drawn())
  const face = nodes.find(one => one.props?.key === 'face-band-board')
  expect(face?.hover).toEqual({ backgroundColor: C.accentTint2, borderColor: C.clear })
  expect(face?.props?.backgroundColor).toBe(C.accentTint)
  expect(nodes.filter(one => one.props?.display !== undefined || one.hover?.display !== undefined)).toEqual([])
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.filter(one => one.props.position === 'absolute').map(one => one.key ?? '')).toEqual([''])
  expect((await textsOf(ui)).filter(one => one === 'Open board')).toHaveLength(1)
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(3)
  expect(await hitsOf(ui)).toHaveLength(1)
  run.open(true)
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  expect(await scopesOf(ui)).toEqual(['face-band-board'])
  expect(await hitsOf(ui)).toHaveLength(1)
  expect((await textsOf(ui)).filter(one => one === 'Open board')).toHaveLength(0)
  expect((await textsOf(ui)).filter(one => one === 'Hide board')).toHaveLength(1)
  await ui.unmount()
})

test('a listed pane that the person hid is not open: Open board shows again', async ($, on) => {
  const run = await band($, on, WORKING, true)
  const ui = await mount($)
  expect((await textsOf(ui)).filter(one => one === 'Open board')).toHaveLength(0)
  expect((await textsOf(ui)).filter(one => one === 'Hide board')).toHaveLength(1)
  await ui.unmount()
  run.hide()
  const hidden = await mount($)
  expect((await textsOf(hidden)).filter(one => one === 'Open board')).toHaveLength(1)
  await hidden.unmount()
})

test('without a Client: one native Button per face, each press runs its action', async ($, on) => {
  const pressed: string[] = []
  const current = boardOf(NEEDS)
  on('ui.render', { component: 'Pane', requestId: PROBE }, ($, event) => {
    const live = liveOf()
    const progress = progressOf(current, live)
    if (!progress) throw new Error('no band')
    const table = $.ui.resolve(event)
    const { Box, Button, Text } = table
    const view = bandViewOf(event.props.bodyColumns, current, progress, false, IDLE, {
      board: () => pressed.push('board'),
      chat: (id, name) => pressed.push(`chat ${id} ${name}`),
    }, live)
    return event.surface !== 'terminal' && 'Svg' in table ? Band({ Box, Text, Button, Svg: guardSvg(table.Svg, Text) }, { view }) : TextBand({ Box, Text, Button }, { view, columns: event.props.bodyColumns })
  })
  const ui = await $.ui.mount({ plugin: 'master-session', component: 'Pane', requestId: PROBE, surface: 'vscode', props: { title: 'band', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 6 }, view: {} } })
  expect(await ui.findAll({ type: 'Client' })).toEqual([])
  expect(await buttonsOf(ui)).toEqual([['band-chat', 'Open chat']])
  await ui.press({ key: 'band-chat', plugin: 'test' })
  expect(pressed).toEqual(['chat local_e env-e2e-test'])
  await ui.unmount()
})

const WIDTHS = [
  { px: 760, counts: true, percent: true, board: 'Open board' },
  { px: 606, counts: true, percent: true, board: 'Open board' },
  { px: 598, counts: true, percent: true, board: 'Board' },
  { px: 400, counts: true, percent: true, board: 'Board' },
  { px: 342, counts: true, percent: true, board: 'Board' },
  { px: 330, counts: false, percent: false, board: '' },
  { px: 200, counts: false, percent: false, board: '' },
] as const

for (const point of WIDTHS) {
  test(`${point.px} px: ${point.counts ? 'counts and the elapsed' : 'no counts, no elapsed'}, ${point.percent ? 'the percent' : 'no percent'}, the bar always at 48 or more, the button ${point.board || 'icon only'}`, async ($, on) => {
    const crew = crewOf($, on)
    await band($, on, WORKING)
    await crew.subagent('docs')
    const ui = await mount($, columnsFor(point.px))
    const width = point.px
    const view = viewOf(WORKING, { agents: [agentOf('docs', 'running')], workflows: [], at: 0 }, columnsFor(width)).view
    expect([view.showCounts, view.hasPercent]).toEqual([point.counts, point.percent])
    expect(!!(await countsIn(ui))).toBe(point.counts)
    expect(!!(await percentIn(ui))).toBe(point.percent)
    const texts = await textsOf(ui)
    expect(texts.includes('<1m')).toBe(point.counts)
    if (point.board) expect(texts.at(-1)).toBe(point.board)
    else {
      expect(texts.some(one => /board/i.test(one))).toBe(false)
      expect(await iconsOf(ui)).toEqual(['Open board'])
      expect(view.action?.isIconOnly).toBe(true)
      expect(view.actionHeight).toBe(24)
    }
    expect(await barWidthOf(ui)).toBeGreaterThanOrEqual(BAR_MIN)
    await ui.unmount()
  })
}

test('narrow needs you and all done keep the bar at 48 or more: the pill truncates before the bar shrinks, the check stays', () => {
  for (const px of [500, 300, 200]) {
    const columns = columnsFor(px)
    expect(viewOf(NEEDS, IDLE, columns).view.barWidth).toBeGreaterThanOrEqual(BAR_MIN)
    const done = viewOf(DONE, IDLE, columns).view
    expect([done.barWidth >= BAR_MIN, done.isAllDone, done.showCounts]).toEqual([true, true, false])
  }
  const tight = viewOf(NEEDS, IDLE, columnsFor(300)).view
  expect([tight.barWidth, tight.action, tight.actionWidth, tight.pillText.endsWith('…') || tight.pillText === 'Session needs you']).toEqual([expect.any(Number), undefined, 0, true])
  expect(viewOf(NEEDS, IDLE, columnsFor(400)).view.action).toEqual(expect.objectContaining({ name: 'chat', isIconOnly: true, label: 'Open chat' }))
})

test('a pill truncated to fit leaves the row inside the band width', () => {
  for (let px = 240; px <= 500; px += 4) {
    const view = viewOf(NEEDS, IDLE, columnsFor(px)).view
    const width = columnsFor(px) * CH - 16
    const sides = [PILL_WIDTH + widthOf(view.pillText, { isBold: true }), view.actionWidth].filter(Boolean)
    const row = view.padLeft + view.padRight + 2 + sides.reduce((sum, one) => sum + one, 0) + sides.length * view.gap + view.barWidth
    expect(row).toBeLessThanOrEqual(width + 0.5)
  }
})

test('the bar takes the room the button leaves: with the pane open the Hide board button keeps the bar within the label width difference, and follows bodyColumns', async ($, on) => {
  const run = await band($, on, WORKING)
  const ui = await mount($)
  const closed = await barWidthOf(ui)
  run.open(true)
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  expect(Math.abs((await barWidthOf(ui)) - closed)).toBeLessThanOrEqual(10)
  await ui.unmount()
  const at100 = await mount($, 100)
  const wide = await barWidthOf(at100)
  await at100.unmount()
  const at120 = await mount($, 120)
  expect((await barWidthOf(at120)) - wide).toBe(Math.round(20 * CH))
  await at120.unmount()
})

test('terminal: one bar of block characters, the percent, the counts with their numbers in semibold, and the same pressable action', async ($, on) => {
  const crew = crewOf($, on)
  const { opened } = await band($, on, WORKING)
  await crew.subagent('docs')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await textsOf(ui)
  expect(texts.slice(0, 2)).toEqual(['64%', expect.stringMatching(/^█+░*$/)])
  expect(texts.slice(2)).toEqual(['1/5', '1', '5', '◷ <1m'])
  expect((await ui.findAll({ type: 'Text' })).filter(one => /^\d+$/.test(one.text)).every(one => one.props.weight === 'semibold')).toBe(true)
  const count = (await ui.findAll({ type: 'Text' })).find(one => one.text === '1/5')
  expect([count?.props.weight, count?.props.dimColor]).toEqual(['semibold', undefined])
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Open board']])
  expect((await ui.findAll({ type: 'Text' })).filter(one => /^[█░]+$/.test(one.text))).toHaveLength(1)
  await ui.press({ key: 'band-board' })
  expect(opened).toEqual(['master-session'])
  await ui.unmount()
})

test('terminal: with the pane open the button reads Hide board and a press closes the pane', async ($, on) => {
  const run = await band($, on, WORKING, true)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Hide board']])
  await ui.press({ key: 'band-board' })
  await run.clock.settle()
  expect(run.closed).toEqual(['master-session'])
  expect(run.opened).toEqual([])
  await ui.unmount()
})

test('terminal: all done is the check and a full bar with "All N done" only when nothing runs; needs you is the dot and the pill, with no Open chat for a session this one did not start', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, DONE)
  await crew.subagent('docs')
  const busy = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await textsOf(busy))[0]).toBe('80%')
  expect((await textsOf(busy)).some(one => one.includes('All'))).toBe(false)
  await busy.unmount()
  await crew.finish('docs')
  const done = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await textsOf(done)
  expect(texts[0]).toBe('✓ All 5 done')
  expect(texts[1]).toMatch(/^█+$/)
  expect(texts.slice(2)).toEqual(['◷ <1m'])
  await done.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(NEEDS) })
  const needs = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const ask = await textsOf(needs)
  expect(ask[0]).toBe('● Session · env-e2e-test needs you · commit blocked')
  expect(ask.some(one => one.includes('working'))).toBe(false)
  expect(await buttonsOf(needs)).toEqual([])
  await needs.unmount()
})

test('with no worker sessions, running subagents still show the band: 0%, the subagent count, and Open board', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, [], false, [])
  expect(bandProgressWith(boardOf([]), liveOf([], []), IDLE)).toBeUndefined()
  expect(bandProgressWith(boardOf([]), liveOf([], []), inRun({ agents: [agentOf('a', 'done')], workflows: [], at: 0 }))).toBeUndefined()
  expect(bandProgressWith(boardOf([]), liveOf([], []), inRun({ agents: [agentOf('a', 'running')], workflows: [], at: 0 }))?.total).toBe(0)
  expect(bandProgressWith(boardOf(WORKING), liveOf([], WORKING), IDLE)?.total).toBe(4)
  await crew.subagent('docs')
  await crew.subagent('review')
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['0%', '0/2', '0', '2', '<1m', 'Open board'])
  expect(String((await stripOf(ui))?.props.source)).toContain('linearGradient')
  await ui.unmount()
})

test('geometry: one row 48 high with gap 12, percent 36, pill 34 with 0 12 0 8, check 18, button 32 with gap 4, the bar Svg 6 high', async ($, on) => {
  await band($, on, WORKING)
  const ui = await mount($)
  const bar = (await ui.findAll({ type: 'Box' })).find(box => box.props.borderStyle === 'round' && box.props.backgroundColor === C.surface)
  expect([bar?.props.height, bar?.props.gap, bar?.props.paddingLeft, bar?.props.paddingRight]).toEqual([tall(48), across(12), across(16), across(8)])
  expect((await ui.findAll({ type: 'Box' })).some(box => box.props.width === across(36) && JSON.stringify(box.children).includes('80%'))).toBe(true)
  expect((await stripOf(ui))?.props.height).toBe(6)
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.flexDirection === 'column' && box.props.justifyContent === 'center' && box.props.flexGrow === 1)).toEqual([])
  expect((await ui.find({ key: 'face-band-board' }))?.props.height).toBe(tall(32))
  await ui.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(NEEDS) })
  const needs = await mount($)
  const pill = (await needs.findAll({ type: 'Box' })).find(box => box.props.borderColor === C.red)
  expect([pill?.props.height, pill?.props.paddingLeft, pill?.props.paddingRight, pill?.props.backgroundColor]).toEqual([tall(34), across(8), across(12), C.redTint])
  await needs.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(DONE) })
  const done = await mount($)
  const check = (await done.findAll({ type: 'Svg' })).find(one => one.props.alt === 'check')
  expect([check?.props.width, check?.props.height]).toEqual([18, 18])
  await done.unmount()
})

test('the needs-you pill names any kind: a session with Open chat; a worker’s subagent with its parent, this chat’s subagent or workflow agent with no Open chat', () => {
  const asking = WORKING.map(one => (one.id === 'local_b' ? { ...one, state: 'needs-you' as const, needsYou: 'Allow Bash: rm -rf dist' } : one))
  const remote = viewOf(asking, CREW({ remote: true }))
  expect([remote.view.pillText, remote.view.alt]).toEqual(['Code reviewer, in QA verifier, needs you · Allow Bash', 'Master session: Code reviewer, in QA verifier, needs you, Allow Bash'])
  expect(remote.view.action).toBeUndefined()
  expect(viewOf(asking, CREW({ remote: true }), columnsFor(400)).view.pillText).toBe('Code reviewer needs you')
  const own = viewOf(WORKING, CREW({ own: true }))
  expect([own.view.pillText, own.view.action]).toEqual(['Code reviewer, in QA verifier, needs you · Allow Bash', undefined])
  const flow = viewOf(WORKING, CREW({ flow: true }))
  expect([flow.view.pillText, flow.view.action, flow.view.tone]).toEqual(['scan 1, in review-changes, needs you · Allow Edit', undefined, 'red'])
  const session = viewOf(NEEDS, CREW())
  expect([session.view.pillText, session.view.action?.label]).toEqual(['Session · env-e2e-test needs you · commit blocked', 'Open chat'])
})

test('a worker’s records-only run counts as one more unit in the percent and in the count', () => {
  const crew = CREW()
  const workflows: WorkflowRecord[] = [...crew.workflows, { id: 'wf_9', toolUseId: '', name: 'remote-review', phases: ['A', 'B', 'C'], startedAt: 5, parentSessionId: 'local_c' }, { id: 'wf_8', toolUseId: '', phases: ['X', 'Y'], startedAt: 6, parentSessionId: 'local_a' }]
  const { view } = viewOf(WORKING, { ...crew, workflows })
  expect([view.percent, countsText(view.parts)]).toEqual([33, '1/11'])
  const without = viewOf(WORKING, { ...crew, workflows: workflows.filter(one => one.id !== 'wf_8') }).view
  expect([without.percent, countsText(without.parts)]).toEqual([37, '1/10'])
})

test('a plain session that runs a subagent, with no board of its own and no workers, gets no band', async ($, on) => {
  const crew = crewOf($, on)
  const register = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const scoped = (event: string, ...rest: unknown[]) => {
    if (event !== 'mcp.call') return register(event, ...rest)
    const inner = rest[0] as McpHook
    return register(event, (context: unknown, call: { tool: string }) => (call.tool === 'list_sessions' ? text([]) : inner(context, call)))
  }
  on('ui.render', { component: 'AbovePrompt' }, ($, event) => {
    const { Text } = $.ui.resolve(event)
    return <Text>no band</Text>
  })
  const { clock } = world(scoped as unknown as On)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  await crew.subagent('docs')
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['no band'])
  await ui.unmount()
})

test('a workflow with no agents stops drawing the band after 120 s, as the pane hides it', async ($, on) => {
  const crew = crewOf($, on)
  on('ui.render', { component: 'AbovePrompt' }, ($, event) => {
    const { Text } = $.ui.resolve(event)
    return <Text>no band</Text>
  })
  const { clock } = await band($, on, [])
  await crew.workflow(0)
  const before = await mount($)
  expect(await textsOf(before)).toEqual(['0%', '0/1', '0', '1', '<1m', 'Open board'])
  await before.unmount()
  await clock.advance(121_000)
  await clock.settle()
  const after = await mount($)
  expect(await textsOf(after)).toEqual(['no band'])
  await after.unmount()
})

test('subagents that finished stay in the percent: 2 of 3 done read 66% now and after three minutes', async ($, on) => {
  const crew = crewOf($, on)
  const { clock } = await band($, on, [])
  for (const name of ['a', 'b', 'c']) await crew.subagent(name)
  await crew.finish('a')
  await crew.finish('b')
  const before = await mount($)
  expect(await percentIn(before)).toBe('66%')
  await before.unmount()
  await clock.advance(180_000)
  await clock.settle()
  const after = await mount($)
  expect([await percentIn(after), (await textsOf(after))[1]]).toEqual(['66%', '2/3'])
  await after.unmount()
  await crew.finish('c')
})

test('the band draws every linked worker on a stale board and leaves the archived one out: 2 of 4 published gives 4 units, and the pane draws the same 4 rows', async ($, on) => {
  await band($, on, WORKING.slice(0, 2), false, WORKING.map((one, index) => linkedOf(one.id, one.name, index !== 3)).concat(linkedOf('local_z', 'gone', false, true)))
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['35%', '0/4', '0', '4', '<1m', 'Open board'])
  expect((await stripOf(ui))?.props.alt).toBe('Master session: 35 percent, 0 of 4 done. <1m elapsed.')
  await ui.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const rows = (await pane.findAll({ type: 'Box' })).flatMap(box => box.key?.match(/^row-(local_\w+)$/)?.slice(1) ?? [])
  await pane.unmount()
  expect(rows.sort()).toEqual(['local_a', 'local_b', 'local_c', 'local_d'])
})

test('band presses route by Client key: band-hit-board and -chat; the pane’s hit- keys are not the band’s', () => {
  expect(bandAction('band-hit-board')).toBe('board')
  expect(bandAction('band-hit-chat')).toBe('chat')
  expect(bandAction('band-hit-summary')).toBeUndefined()
  expect(bandAction('hit-tile-local_a')).toBeUndefined()
})

test('archived sessions are out of the work set: 21 archived and 1 working session at 50% read 50%', () => {
  const archived: BoardSession[] = Array.from({ length: 21 }, (_, index) => ({ id: `local_old${index}`, name: `old${index}`, state: 'done', progress: 'step 5 of 5 — x' }))
  const live = liveOf(archived.map(one => one.id), [...archived, { id: 'local_x', name: 'x', state: 'working' }])
  const board = boardOf([...archived, { id: 'local_x', name: 'x', state: 'working', progress: 'step 1 of 2 — x' }])
  const units = bandUnitsOf(progressOf(board, live)?.segments ?? [], board, IDLE, live)
  expect([units.length, percentOf(units)]).toEqual([1, 50])
})

test('a running unit at 0% still shows: one subagent running and nothing finished reads 0% with a 16 wide fill and the slider', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING.map(one => ({ ...one, state: 'waiting' as const, progress: 'step 0 of 5 — x' })))
  await crew.subagent('docs')
  const ui = await mount($)
  expect(await percentIn(ui)).toBe('0%')
  const source = String((await stripOf(ui))?.props.source)
  expect(source).toContain('M3.0,0h10.0a3,3 0 0 1 0,6h-10.0a3,3 0 0 1 0,-6Z" style="fill:var(--green)"')
  expect(source).toContain('linearGradient')
  await ui.unmount()
  expect(strip({ width: 200, overall: 0, tone: 'grey', isSliding: false })).not.toContain('var(--grey)"/><')
})

const FIVE: BoardSession[] = [
  { id: 'local_w', name: 'working-one', state: 'working', progress: 'step 2 of 4 — x', now: 'editing' },
  { id: 'local_a', name: 'waiting-one', state: 'waiting', progress: 'step 1 of 4 — x', now: 'waiting for the go' },
  { id: 'local_r', name: 'ready-one', state: 'done', progress: 'step 4 of 4 — x', sha: 'abc1234' },
  { id: 'local_i', name: 'idle-one', state: 'waiting', progress: 'step 1 of 4 — x' },
  { id: 'local_f', name: 'failed-one', state: 'waiting', progress: 'step 2 of 4 — x', now: 'tests failed' },
]

const fiveUnits = (sessions: BoardSession[], idle: string[] = ['local_i']) => {
  const live = liveOf([], sessions, idle)
  return bandUnitsOf(progressOf(boardOf(sessions), live)?.segments ?? [], boardOf(sessions), IDLE, live)
}

test('unit state follows the pane: a working session that is not live is idle and waits, a ready session (done with a sha) is not finished; five sessions have none finished', () => {
  const units = fiveUnits(FIVE)
  expect(units.map(one => [one.isRunning, one.isFinished])).toEqual([
    [false, false],
    [false, false],
    [false, false],
    [true, false],
    [false, false],
  ])
  const notLive = fiveUnits([{ ...FIVE[0]!, id: 'local_n' }], ['local_n'])
  expect(notLive[0]?.isRunning).toBe(false)
})

test('a ready session never makes "All N done": it holds the percent at 99 and the fill grey', () => {
  const only = [FIVE[2]!]
  const { view } = viewOf(only, IDLE)
  expect([view.isAllDone, view.percent, view.tone, view.isRunning]).toEqual([false, 99, 'grey', false])
  const verified = viewOf([{ ...FIVE[2]!, verified: 'tests green' }], IDLE).view
  expect([verified.isAllDone, verified.percent]).toEqual([true, 100])
})

test('a worker’s records-only workflow older than 120 s adds no unit and leaves the percent and counts alone, while a fresh one does', () => {
  const ghost = { id: 'wf_ghost', toolUseId: 't', name: 'ghost', phases: [], startedAt: 1, parentSessionId: 'local_b' }
  const seen = (at: number) => viewOf(WORKING, { agents: [], workflows: [ghost], at }).view
  const none = viewOf(WORKING, IDLE).view
  const old = seen(121_001)
  expect([old.percent, countsText(old.parts)]).toEqual([none.percent, countsText(none.parts)])
  expect(seen(60_000).percent).toBeLessThan(none.percent)
})

test('a finished session counts 1 whatever its fill', () => {
  const units = bandUnitsOf([{ id: 'local_d', state: 'done', fill: 0.4 }], boardOf([WORKING[3]!]), IDLE, liveOf([], [WORKING[3]!]))
  expect([units[0]?.value, units[0]?.isFinished]).toEqual([1, true])
})

test('the pill names the unit that asked first by its since, not by position', () => {
  const ask = (text: string, since: number) => ({ text, since })
  const crew = (first: number, second: number) => ({
    agents: [agentOf('o1', 'running', { name: 'Reviewer', type: 'master-session:reviewer', asking: ask('late', second) }), agentOf('o2', 'running', { name: 'Designer', type: 'master-session:designer', asking: ask('early', first) })],
    workflows: [], at: 0,
  })
  expect(viewOf(WORKING, crew(1, 5)).view.pillText).toBe('Designer needs you · early')
  expect(viewOf(WORKING, crew(5, 1)).view.pillText).toBe('Code reviewer needs you · late')
})

test('a board row named after a subagent of this chat is no session: no needs-you pill from it and no Open chat', () => {
  const plain = viewOf(WORKING, CREW())
  const named = viewOf([...WORKING, { id: 'o2', name: 'reviewer', state: 'needs-you', needsYou: 'Allow Bash: ls' }], CREW())
  expect([named.view.pillText, named.view.action?.label, named.view.alt]).toEqual([plain.view.pillText, plain.view.action?.label, plain.view.alt])
})

test('Open chat hides when the prompt is already in this chat or a subagent asks, and opens the asking session’s chat otherwise', () => {
  const own = viewOf([{ id: SELF, name: 'master', state: 'needs-you', needsYou: 'ok?', progress: 'step 1 of 2 — x' }, ...WORKING], IDLE)
  expect([own.view.pillText.includes('needs you'), own.view.action]).toEqual([true, undefined])
  const crew = CREW({ remote: true })
  expect(askingChatOf(boardOf(WORKING), liveOf([], WORKING), crew, [])).toBeUndefined()
  expect(askingChatOf(boardOf(WORKING), liveOf([], WORKING), CREW({ own: true }), [])).toBeUndefined()
  expect(askingChatOf(boardOf(NEEDS), liveOf(), IDLE, [])).toEqual({ id: 'local_e', name: 'env-e2e-test' })
  expect(askingChatOf(boardOf(WORKING), liveOf([], WORKING), IDLE, [])).toBeUndefined()
})

test('Open chat shows only for a worker this session started, the one open_session_in accepts', () => {
  const foreign: Live = { ...liveOf(), sessions: liveOf().sessions.map(one => ({ ...one, startedBy: 'someone-else' })) }
  expect(askingChatOf(boardOf(NEEDS), foreign, IDLE, [])).toBeUndefined()
  const units = bandUnitsOf(progressOf(boardOf(NEEDS), foreign)?.segments ?? [], boardOf(NEEDS), IDLE, foreign)
  expect(units.some(one => one.asker?.chat)).toBe(false)
})

test('a refused Open chat toasts a plain line that points at the sidebar, not the engine text', async ($, on) => {
  const register = on as unknown as (event: string, ...rest: unknown[]) => unknown
  const refusing = (event: string, ...rest: unknown[]) =>
    event === 'mcp.call'
      ? register(event, (context: unknown, call: { tool: string }) =>
          call.tool === 'open_session_in' ? { value: { content: [{ type: 'text', text: 'Refused: tell the model to ask the user' }], isError: true } } : (rest[0] as McpHook)(context, call),
        )
      : register(event, ...rest)
  const { toasts } = await band($, refusing as unknown as On, NEEDS, true, [linkedOf('local_e', 'env-e2e-test', true)])
  const ui = await mount($, 100)
  await click(ui, 'band-hit-chat', 1, 0)
  expect(toasts.at(-1)).toBe("Couldn't open env-e2e-test here. Open it from the sidebar.")
  await ui.unmount()
})

test('below 600 px the pill reads "<Persona> needs you" and Open chat is icon only; wide it reads the whole line', () => {
  const wide = viewOf(NEEDS, IDLE, columnsFor(900)).view
  const narrow = viewOf(NEEDS, IDLE, columnsFor(590)).view
  expect([wide.pillText, wide.action?.isIconOnly]).toEqual(['Session · env-e2e-test needs you · commit blocked', false])
  expect([narrow.pillText, narrow.action?.isIconOnly]).toEqual(['Session needs you', true])
})

test('accessible names: the narrow "Board" button is "Open board", the icon-only Open chat is "Open chat"', async ($, on) => {
  await band($, on, WORKING)
  const board = await mount($, columnsFor(500))
  expect(await textsOf(board)).toContain('Board')
  expect(await iconsOf(board)).toContain('Open board')
  await board.unmount()
  expect(viewOf(WORKING, IDLE, columnsFor(500)).view.action).toEqual(expect.objectContaining({ label: 'Board', accessibleName: 'Open board' }))
  expect(viewOf(NEEDS, IDLE, columnsFor(500)).view.action).toEqual(expect.objectContaining({ label: 'Open chat', accessibleName: 'Open chat', isIconOnly: true }))
})

test('terminal bar follows the bar: at least one cell while running, never full before everything is done', async ($, on) => {
  await band($, on, [{ ...WORKING[1]!, progress: 'step 0 of 5 — x' }])
  const running = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const bar = (await textsOf(running)).find(one => /^[█░]+$/.test(one)) ?? ''
  expect([bar.startsWith('█'), bar.includes('░')]).toEqual([true, true])
  await running.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish([{ ...WORKING[1]!, state: 'working', progress: 'step 5 of 5 — x' }]) })
  const nearly = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const full = (await textsOf(nearly)).find(one => /^[█░]+$/.test(one)) ?? ''
  expect(full.includes('░')).toBe(true)
  await nearly.unmount()
})

test('terminal bar shows at least one cell once there is progress, even when nothing runs', async ($, on) => {
  await band($, on, [{ ...WORKING[1]!, state: 'waiting', progress: 'step 1 of 50 — x' }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const bar = (await textsOf(ui)).find(one => /^[█░]+$/.test(one)) ?? ''
  expect(bar.startsWith('█')).toBe(true)
  await ui.unmount()
})

test('without a Client the narrow Board button is still named Open board', async ($, on) => {
  const current = boardOf(WORKING)
  on('ui.render', { component: 'Pane', requestId: PROBE }, ($, event) => {
    const live = liveOf([], WORKING)
    const progress = progressOf(current, live)
    if (!progress) throw new Error('no band')
    const table = $.ui.resolve(event)
    const { Box, Button, Text } = table
    const view = bandViewOf(columnsFor(500), current, progress, false, IDLE, { board: () => undefined, chat: () => undefined }, live)
    return 'Svg' in table ? Band({ Box, Text, Button, Svg: guardSvg(table.Svg, Text) }, { view }) : <Text>none</Text>
  })
  const ui = await $.ui.mount({ plugin: 'master-session', component: 'Pane', requestId: PROBE, surface: 'vscode', props: { title: 'band', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 6 }, view: {} } })
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Open board']])
  await ui.unmount()
})

const barProps = (view: ReturnType<typeof viewOf>['view']): Record<string, unknown> | undefined => {
  const seen: Record<string, unknown>[] = []
  const keys: unknown[] = []
  const stub = (props: Record<string, unknown>) => props.children ?? null
  const Box = (props: Record<string, unknown>) => {
    if (typeof props.key === 'string' && props.key.startsWith('bar-')) keys.push(props.key)
    return stub(props)
  }
  const Svg = (props: Record<string, unknown>) => {
    if (String(props.source).includes('width="4096"')) seen.push(props)
    return null
  }
  const ui = { Box, Text: stub, Button: stub, Svg } as unknown as Parameters<typeof Band>[0]
  Band(ui, { view })
  return seen[0] ? { ...seen[0], key: keys[0] } : undefined
}

test('the bar frame is sized to the bar and keyed by width and run state: stable across a percent-only change, new when the band stops running', () => {
  const first = viewOf(WORKING, IDLE)
  const bar = barProps(first.view)
  expect(bar?.width).toBeUndefined()
  expect(bar?.key).toBe(`bar-${first.view.barWidth}-run`)
  const moved = viewOf(WORKING.map(one => (one.id === 'local_b' ? { ...one, progress: 'step 4 of 5 — pane' } : one)), IDLE)
  expect(moved.view.overall).not.toBe(first.view.overall)
  expect(barProps(moved.view)?.key).toBe(bar?.key)
  const still = viewOf(WORKING.map(one => ({ ...one, state: 'waiting' as const })), IDLE)
  expect(still.view.isRunning).toBe(false)
  expect(barProps(still.view)?.key).toBe(`bar-${still.view.barWidth}-still`)
})

test('the first agent started with the pane closed draws the bar on the band’s first frame, and a data change redraws it with no pane open', async ($, on) => {
  const crew = crewOf($, on)
  const { clock } = await band($, on, WORKING)
  const ui = await mount($)
  const before = String((await stripOf(ui))?.props.alt)
  await crew.subagent('docs')
  await clock.settle()
  const drawn = await stripOf(ui)
  expect(String(drawn?.props.alt)).not.toBe(before)
  expect(String(drawn?.props.alt)).toContain('1 of 5 done')
  expect(String(drawn?.props.source)).toContain('linearGradient')
  expect(drawn?.props.width).toBeUndefined()
  expect((await ui.findAll({ type: 'Box' })).map(one => one.key).filter(one => one?.startsWith('bar-'))).toEqual([`bar-${await barWidthOf(ui)}-run`])
  await ui.unmount()
  const fresh = await mount($)
  expect(String((await stripOf(fresh))?.props.source)).toContain('linearGradient')
  await fresh.unmount()
})

const crowd = (total: number, finished: number): BoardSession[] =>
  Array.from({ length: total }, (_, index) => ({ id: `local_${index}`, name: `worker-${index}`, state: index < finished ? ('done' as const) : ('working' as const), progress: 'step 1 of 2 — go' }))

for (const [finished = 0, total = 0] of [[3, 7], [23, 31]]) {
  for (const px of [300, 600, 900]) {
    test(`${finished}/${total} at ${px} px: the bar box grows into its slot and the svg has no width, only a stretching viewBox`, () => {
      const { view } = viewOf(crowd(total, finished), { agents: [], workflows: [], at: 0 }, columnsFor(px))
      const boxes: Record<string, unknown>[] = []
      const svgs: Record<string, unknown>[] = []
      const Box = (props: Record<string, unknown>) => {
        boxes.push(props)
        return props.children ?? null
      }
      const Svg = (props: Record<string, unknown>) => {
        svgs.push(props)
        return null
      }
      const stub = (props: Record<string, unknown>) => props.children ?? null
      Band({ Box, Text: stub, Button: stub, Svg } as unknown as Parameters<typeof Band>[0], { view })
      const bar = boxes.find(one => String(one.key).startsWith('bar-'))
      expect([bar?.flexGrow, bar?.flexShrink, bar?.width, bar?.minWidth]).toEqual([1, 1, 0, 0])
      const drawn = svgs.find(one => String(one.source).includes('width="4096"'))
      expect(drawn?.width).toBeUndefined()
      const source = String(drawn?.source)
      expect(source).toContain('width="4096"')
      expect(source).toContain(`viewBox="0 0 ${view.barWidth} 6" preserveAspectRatio="none"`)
    })
  }
}

const MIN = 60_000

const piece = (name: string, state: PlanPiece['state'], progress?: string): PlanPiece => ({ name, state, ...(progress ? { progress } : {}) })

const SEVEN = [piece('a', 'done'), piece('b', 'done'), piece('c', 'done'), piece('d', 'working', 'step 1 of 2 — x'), piece('e', 'working', 'step 1 of 2 — x'), piece('f', 'queued'), piece('g', 'queued')]

const ALL_SEVEN = SEVEN.map(one => piece(one.name, 'done'))

const RUNNING = { agents: [agentOf('s1', 'running')], workflows: [] as WorkflowRecord[] }

const planView = (px: number, options: { isPaneOpen?: boolean; minutes?: number; sessions?: BoardSession[]; plan?: PlanPiece[]; crew?: Pick<AgentCounts, 'agents' | 'workflows'> } = {}) => {
  const sessions = options.sessions ?? WORKING
  const current: Board = { ...boardOf(sessions), plan: options.plan ?? SEVEN, since: 0 }
  const live = liveOf([], sessions)
  const progress = bandProgressWith(current, live, inRun({ ...(options.crew ?? RUNNING), at: 0 }))
  if (!progress) throw new Error('no band')
  const crew = inRun({ ...(options.crew ?? RUNNING), at: (options.minutes ?? 48) * MIN })
  return bandViewOf(columnsFor(px), current, progress, !!options.isPaneOpen, crew, NO_ACT, live)
}

const SPENT = ['Implementer', 'Row details', 'QA verifier', 'Read', 'Bash', 'rowfit', 'more', 'working', 'waiting', 'Nothing running']

test('AC48 and AC49 the band is one row: 57%, the bar, 3/7, 48m, Open board, and nothing about what runs', async ($, on) => {
  const crew = crewOf($, on)
  const run = await band($, on, WORKING)
  await $.tool.call({ tool: BOARD_TOOL, ...publish(WORKING), plan: SEVEN })
  await crew.subagent('docs')
  await run.clock.advance(48 * MIN)
  const ui = await mount($)
  const texts = await textsOf(ui)
  expect(texts).toEqual(['57%', '3/7', '3', '7', '48m', 'Open board'])
  const all = JSON.stringify([texts, await iconsOf(ui), (await stripOf(ui))?.props.alt])
  for (const word of SPENT) expect(all).not.toContain(word)
  const boxes = await ui.findAll({ type: 'Box' })
  expect(boxes.filter(one => one.props.flexDirection === 'column' && !String(one.key).startsWith('bar-'))).toEqual([])
  expect((await stripOf(ui))?.props.alt).toBe('Master session: 57 percent, 3 of 7 done. 48m elapsed.')
  await ui.unmount()
})

test('AC50 the bar takes the room between the percent and the count: only its length changes between 760 and 600 px', () => {
  const rowOf = (px: number) => {
    const view = planView(px)
    const row = view.padLeft + view.padRight + 2 + PERCENT + countsWidthOf(view.parts) + view.elapsedWidth + view.actionWidth + 4 * view.gap + view.barWidth
    return { row, width: columnsFor(px) * CH - 16, bar: view.barWidth, label: view.action?.label }
  }
  const wide = rowOf(760)
  const edge = rowOf(606)
  expect([Math.abs(wide.row - wide.width) <= 1, Math.abs(edge.row - edge.width) <= 1, wide.label, edge.label]).toEqual([true, true, 'Open board', 'Open board'])
  expect(wide.bar).toBeGreaterThan(edge.bar)
})

test('AC51 AC52 and AC63 with the pane open the button reads Hide board, Board below 600 px keeps the elapsed, and the accessible name stays whole', () => {
  const open = planView(760, { isPaneOpen: true })
  expect([open.action?.label, open.action?.accessibleName, open.percent, countsText(open.parts), open.elapsed]).toEqual(['Hide board', 'Hide board', 57, '3/7', '48m'])
  const mid = planView(390)
  expect([mid.action?.label, mid.action?.accessibleName, mid.hasElapsed, mid.showCounts, mid.hasPercent]).toEqual(['Board', 'Open board', true, true, true])
  const midOpen = planView(390, { isPaneOpen: true })
  expect([midOpen.action?.label, midOpen.action?.accessibleName]).toEqual(['Board', 'Hide board'])
  const edge = planView(342)
  expect([edge.hasElapsed, edge.action?.isIconOnly]).toEqual([true, false])
})

test('AC53 and AC54 below 340 px the bar and an icon-only board button, or the pill and the bar when someone asks', () => {
  const small = planView(300)
  expect([small.hasPercent, small.showCounts, small.hasElapsed, small.hasAllDone, small.action?.name, small.action?.isIconOnly, small.action?.accessibleName, small.actionHeight, small.barWidth >= BAR_MIN]).toEqual([false, false, false, false, 'board', true, 'Open board', 24, true])
  expect(planView(300, { isPaneOpen: true }).action?.accessibleName).toBe('Hide board')
  const asking = planView(300, { sessions: NEEDS })
  expect([asking.pillText, asking.action, asking.hasElapsed, asking.showCounts, asking.tone]).toEqual(['Session needs you', undefined, false, false, 'red'])
})

test('AC56 idle: nothing runs and the plan is not done reads 57% 3/7, a grey still bar, 48m and Open board, with no running or waiting words', () => {
  const sessions = WORKING.map(one => ({ ...one, state: 'waiting' as const }))
  const idle = planView(760, { sessions, crew: { agents: [], workflows: [] } })
  expect([idle.percent, countsText(idle.parts), idle.tone, idle.isRunning, idle.elapsed, idle.action?.label, idle.alt]).toEqual([57, '3/7', 'grey', false, '48m', 'Open board', 'Master session: 57 percent, 3 of 7 done. 48m elapsed.'])
  expect(strip({ width: idle.barWidth, overall: idle.overall, tone: idle.tone, isSliding: idle.isRunning })).not.toContain('linearGradient')
})

test('AC57 all done: the check, All 7 done, 1h 38m and Open board, with no 7/7 and no latest event', () => {
  const done = planView(760, { sessions: DONE, plan: ALL_SEVEN, minutes: 98, crew: { agents: [], workflows: [] } })
  expect([done.hasAllDone, done.allDone, done.parts, done.showCounts, done.elapsed, done.action?.label, done.alt, done.percent]).toEqual([true, 'All 7 done', [], false, '1h 38m', 'Open board', 'Master session: all 7 done. 1h 38m elapsed.', 100])
  const small = planView(300, { sessions: DONE, plan: ALL_SEVEN, minutes: 98, crew: { agents: [], workflows: [] } })
  expect([small.hasAllDone, small.action?.isIconOnly]).toEqual([false, true])
})

test('AC61 the accessible text is the same at 760, 390 and 300 px', () => {
  const alts = [760, 390, 300].map(px => planView(px).alt)
  expect(new Set(alts)).toEqual(new Set(['Master session: 57 percent, 3 of 7 done. 48m elapsed.']))
})

test('AC59 the terminal draws one row: 57%, the bar, 3/7, ◷ 48m and Open board', async ($, on) => {
  const crew = crewOf($, on)
  const run = await band($, on, WORKING)
  await $.tool.call({ tool: BOARD_TOOL, ...publish(WORKING), plan: SEVEN })
  await crew.subagent('docs')
  await run.clock.advance(48 * MIN)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await textsOf(ui)).toEqual(['57%', expect.stringMatching(/^█+░+$/), '3/7', '3', '7', '◷ 48m'])
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Open board']])
  expect((await ui.findAll({ type: 'Box' })).filter(one => one.props.flexDirection === 'column')).toEqual([])
  await ui.unmount()
})

test('the count width measures the slash in the bold face it is drawn in', () => {
  const [one, slash, four] = countsOf(1, 4)
  expect(countsWidthOf([slash!])).toBe(textWidth('/', 13, { isBold: true }))
  expect(countsWidthOf([one!, slash!, four!])).toBeGreaterThan(countsWidthOf([one!, four!]))
})

test('AC60 the terminal below 340 px draws the bar and the board glyph, and with an ask the pill and the bar', async ($, on) => {
  const run = await band($, on, WORKING)
  await $.tool.call({ tool: BOARD_TOOL, ...publish(WORKING), plan: SEVEN })
  const small = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: columnsFor(300) } })
  expect(await textsOf(small)).toEqual([expect.stringMatching(/^█+░+$/)])
  expect(await buttonsOf(small)).toEqual([['band-board', '◫']])
  await small.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(NEEDS), plan: SEVEN })
  await run.clock.settle()
  const asking = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: columnsFor(300) } })
  expect(await textsOf(asking)).toEqual([expect.stringMatching(/^● Session needs you/), expect.stringMatching(/^[█░]+$/)])
  expect(await buttonsOf(asking)).toEqual([])
  await asking.unmount()
})

test('askToolOf names a tool only for "Allow <tool>" or "Allow <tool>: detail"; any other Allow text names none, so no path or args show', () => {
  for (const reason of ['Allow Read(~/secret)', 'Allow Bash(git push)', 'Allow  Bash', 'Allow\tBash', 'Allow the push to master?']) expect(askToolOf(reason)).toBeUndefined()
  expect([askToolOf('Allow Bash'), askToolOf('Allow mcp__x__y: detail'), askToolOf('commit blocked'), askToolOf(undefined)]).toEqual(['Allow Bash', 'Allow mcp__x__y', 'commit blocked', undefined])
  const asking = WORKING.map(one => (one.id === 'local_b' ? { ...one, state: 'needs-you' as const, needsYou: 'Allow Read(~/secret)' } : one))
  expect(viewOf(asking, IDLE).view.summary).not.toContain('secret')
})

test('one band build runs rowsInRun once: the progress, the view and the asking chat share the run set', () => {
  let reads = 0
  const worker = { id: 'local_w', name: 'w', title: 'w', cwd: '/', isRunning: true, isArchived: false, lastActivityAt: 0, startedBy: SELF, get createdAt() { reads += 1; return 1 } }
  const base = liveOf([], WORKING)
  const live: Live = { ...base, sessions: [...base.sessions, worker] }
  const current = boardOf(WORKING)
  const set = bandSetOf(current, IDLE, live, [], true)
  expect(reads).toBe(1)
  const progress = bandProgressWith(current, live, IDLE, set)
  if (!progress) throw new Error('no band')
  bandViewOf(100, current, progress, false, IDLE, NO_ACT, live, [], set)
  expect(reads).toBe(1)
  reads = 0
  askingChatOf(current, live, IDLE, [])
  expect(reads).toBe(1)
})
