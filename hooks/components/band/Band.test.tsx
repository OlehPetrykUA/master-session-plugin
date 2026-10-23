import { expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { AgentRecord, Board, BoardSession, Live, WorkflowRecord } from '../../../types'

import { BAR_MIN, PILL_WIDTH, askingChatOf, countsOf, bandAction, bandProgress, bandProgressWith, bandUnitsOf, bandViewOf, countsText, overallOf, percentOf } from '../../lib/band'
import type { AgentCounts } from '../../lib/band'
import { CH, COLUMN, across, tall, widthOf } from '../../lib/layout'
import { BAND, BOARD_TOOL, PANE, SELF, SPAWN, click, started, text, warmUp, world } from '../../testing/world'
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
  const run = await started($, scoped as unknown as On, publish(sessions))
  return { ...run, open: (value: boolean) => (isOpen = value), hide: () => (isHidden = true) }
}

const mount = ($: Engine, bodyColumns = 100) => $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns } })

const IDLE = { agents: [], workflows: [] }

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


const wideColumns = Math.ceil((900 + 16) / COLUMN)

const columnsFor = (width: number) => Math.ceil((width + 16) / COLUMN)

type Found = { findAll: (query: { type?: string }) => Promise<FoundElement[]>; find: (query: { key?: string }) => Promise<FoundElement | undefined> }

const textsOf = async (ui: Found) => (await ui.findAll({ type: 'Text' })).map(one => one.text.replace(/[  ]/g, '').trim())

const buttonsOf = async (ui: Found) => (await ui.findAll({ type: 'Button' })).map(one => [one.key, String(one.props.label)])

const hitsOf = async (ui: Found) => (await ui.findAll({ type: 'Client' })).map(one => [one.key, one.props.module, one.props.props])

const stripOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).find(one => one.props.isInteractive === true)

const barWidthOf = async (ui: Found) => Number(String((await stripOf(ui))?.props.source).match(/viewBox="0 0 ([\d.]+) 10"/)?.[1])

const faceOf = async (ui: Found) => (await ui.findAll({ type: 'Box' })).filter(one => one.key?.startsWith('face-band-'))

const iconsOf = async (ui: Found) => (await ui.findAll({ type: 'Svg' })).filter(one => one.props.isInteractive !== true).map(one => String(one.props.alt))

const percentIn = async (ui: Found) => (await textsOf(ui)).find(one => /^\d+%$/.test(one))

const countsIn = async (ui: Found) => (await ui.findAll({ type: 'Text' })).find(one => one.props.color === 'inactive' && /working/.test(one.text))

const scopesOf = async (ui: Found) => (await faceOf(ui)).map(one => one.key)

warmUp()

const crewValues = (crew: AgentCounts, sessions: BoardSession[] = WORKING, archived: string[] = []) => {
  const live = liveOf(archived, sessions)
  return bandUnitsOf(bandProgress(boardOf(sessions), live)?.segments ?? [], boardOf(sessions), crew, live)
}

const agentOf = (id: string, state: AgentRecord['state'], extra: Partial<AgentRecord> = {}): AgentRecord => ({ id, type: 'general-purpose', description: id, state, startedAt: 1, ...extra })

const CREW = (asking: { own?: boolean; remote?: boolean; flow?: boolean } = {}) => {
  const ask = { text: 'Allow Bash: rm -rf dist', since: 1 }
  return {
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
  }
}


const viewOf = (sessions: BoardSession[], crew: AgentCounts, columns = 100) => {
  const current = boardOf(sessions)
  const live = liveOf([], sessions)
  const progress = bandProgress(current, live)
  if (!progress) throw new Error('no band')
  const chats: string[] = []
  const view = bandViewOf(columns, current, progress, false, crew, { board: () => chats.push('board'), chat: (id, name) => chats.push(`${id} ${name}`) }, live)
  return { view, chats }
}


test('no band with no board and no worker of mine, with an empty board and no workers, or with every worker archived; archived ones drop out', () => {
  const outsider = { id: 'local_x', name: 'outsider', title: '', cwd: '/', isRunning: true, isArchived: false, lastActivityAt: 0 }
  expect(bandProgress(null, { ...liveOf([], []), sessions: [outsider] })).toBeUndefined()
  expect(bandProgress(boardOf([]), liveOf([], []))).toBeUndefined()
  expect(bandProgress(boardOf(WORKING), liveOf(WORKING.map(one => one.id), WORKING))).toBeUndefined()
  expect(bandProgress(boardOf(NEEDS), liveOf(['local_b']))?.segments.map(one => one.id)).toEqual(['local_e', 'local_a', 'local_c', 'local_d'])
  expect(bandProgress(boardOf(WORKING), liveOf([], WORKING))?.segments.map(one => one.fill)).toEqual([0.8, 0.6, 0.8, 1])
})



test('unit values: a session is steps done over total and 1 when done, a subagent 0 until it finishes (done or failed) then 1, a run is its agents finished over its agents', () => {
  const sessions = crewValues(IDLE).filter(one => one.kind === 'session')
  expect(sessions.map(one => [one.id, one.value, one.isFinished])).toEqual([
    ['local_a', 0.8, false],
    ['local_b', 0.6, false],
    ['local_c', 0.8, false],
    ['local_d', 1, true],
  ])
  const crew = { agents: [agentOf('s1', 'running'), agentOf('s2', 'done'), agentOf('s3', 'failed'), agentOf('n1', 'running', { parentAgentId: 's1' })], workflows: [] }
  expect(crewValues(crew, []).map(one => [one.id, one.kind, one.value, one.isRunning])).toEqual([
    ['s1', 'subagent', 0, true],
    ['n1', 'subagent', 0, true],
    ['s2', 'subagent', 1, false],
    ['s3', 'subagent', 1, false],
  ])
  const run = (states: AgentRecord['state'][]) => ({ agents: states.map((state, index) => agentOf(`w${index}`, state, { type: 'workflow-subagent', run: { id: 'wf_1', index } })), workflows: [] })
  const valueOf = (states: AgentRecord['state'][]) => crewValues(run(states), []).find(one => one.kind === 'workflow')
  expect([valueOf(['done', 'running', 'running'])?.value, valueOf(['done', 'failed', 'running', 'running'])?.value, valueOf(['running'])?.value]).toEqual([1 / 3, 0.5, 0])
  expect([valueOf(['done', 'failed']), valueOf(['done', 'failed'])?.isFinished]).toEqual([expect.objectContaining({ value: 1, isRunning: false }), true])
})

test('overall is the mean of the unit values and the percent its floor: 2 of 3 steps is 66, a finished session at 5 of 5 that still works is 99, and 100 needs every unit finished', () => {
  const only = (progress: string, state: BoardSession['state'] = 'working') => crewValues(IDLE, [{ id: 'local_a', name: 'a', state, progress }])
  expect(percentOf(only('step 2 of 3 — x'))).toBe(66)
  expect(percentOf(only('step 5 of 5 — x'))).toBe(99)
  expect(percentOf(only('step 5 of 5 — x', 'done'))).toBe(100)
  const units = crewValues({ agents: [agentOf('s1', 'running')], workflows: [] })
  expect(Math.abs(overallOf(units) - 3.2 / 5)).toBeLessThan(1e-9)
  expect(percentOf(units)).toBe(64)
  expect(percentOf([])).toBe(0)
  const tenths = crewValues(IDLE, Array.from({ length: 100 }, (_, index) => ({ id: `local_${index}`, name: `n${index}`, state: 'working' as const, progress: `step ${index < 29 ? 1 : 0} of 1 — x` })))
  expect(Math.abs(overallOf(tenths) - 0.29)).toBeLessThan(1e-9)
  expect(percentOf(tenths)).toBe(29)
})

test('finishing never lowers the overall: a subagent and a run agent stay counted as 1', () => {
  const before = { agents: [agentOf('s1', 'running'), agentOf('w0', 'done', { run: { id: 'wf_1', index: 0 } }), agentOf('w1', 'running', { run: { id: 'wf_1', index: 1 } })], workflows: [] }
  const mid = percentOf(crewValues(before))
  const after = { agents: before.agents.map(one => (one.id === 's1' ? { ...one, state: 'done' as const } : one)), workflows: [] }
  expect(percentOf(crewValues(after))).toBeGreaterThanOrEqual(mid)
  const ended = { agents: after.agents.map(one => ({ ...one, state: 'done' as const })), workflows: [] }
  expect(percentOf(crewValues(ended))).toBeGreaterThanOrEqual(percentOf(crewValues(after)))
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
    workflows: [],
  }
  expect(crewValues(crew).map(one => [one.id, one.kind])).toEqual([
    ['o1', 'subagent'],
    ['local_a', 'session'],
    ['local_b', 'session'],
    ['r1', 'subagent'],
    ['local_c', 'session'],
    ['wf_9', 'workflow'],
    ['local_d', 'session'],
    ['g1', 'subagent'],
    ['wf_1', 'workflow'],
  ])
})

test('fill tone: red when anyone needs you, else green while anything runs, else grey; green and full when all done', () => {
  const view = (sessions: BoardSession[], crew: AgentCounts = IDLE) => viewOf(sessions, crew).view
  const waiting = WORKING.map(one => ({ ...one, state: 'waiting' as const }))
  expect([view(NEEDS).tone, view(WORKING).tone, view(waiting).tone, view(DONE).tone]).toEqual(['red', 'green', 'grey', 'green'])
  expect(view(NEEDS, { agents: [agentOf('s1', 'running')], workflows: [] }).tone).toBe('red')
  expect(view(waiting, { agents: [agentOf('s1', 'running')], workflows: [] }).tone).toBe('green')
  expect(view(waiting, { agents: [agentOf('s1', 'done')], workflows: [] }).tone).toBe('grey')
  expect([view(DONE).isAllDone, view(DONE).isRunning, view(DONE).overall]).toEqual([true, false, 1])
})


test('the user’s case: every session done and 2 subagents running reads 66% and running, with the slider, never "All N done"', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, DONE)
  await crew.subagent('docs')
  await crew.subagent('review')
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['66%', '0 working · 0 waiting · 2 subagents', '0', '0', '2', 'Open board'])
  const source = String((await stripOf(ui))?.props.source)
  expect(source).toContain('animateTransform')
  expect(source).toContain('fill:var(--green)')
  expect((await stripOf(ui))?.props.alt).toBe('Master session: 66 percent, 0 working, 0 waiting, 2 subagents')
  await crew.finish('docs')
  await crew.finish('review')
  await ui.unmount()
  const done = await mount($)
  expect(await textsOf(done)).toEqual(['All 6 done', '6', 'Open board'])
  expect(String((await stripOf(done))?.props.source)).not.toContain('animateTransform')
  await done.unmount()
})

test('the slider: a white band 0 → .55 → 0 of max(16, 30% of the fill), clipped to the fill, 2.4 s linear and repeating while anything runs; none when nothing runs; still at 35% under reduced motion', () => {
  const running = strip({ width: 200, overall: 0.5, tone: 'green', isSliding: true })
  expect(running).toContain('<animateTransform attributeName="transform" type="translate" from="-30.0 0" to="100.0 0" dur="2.4s" calcMode="linear" repeatCount="indefinite"/>')
  expect(running).toContain('stop-opacity="0"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>')
  expect(running).toContain('<g clip-path="url(#c)">')
  expect(running).toContain('<clipPath id="c"><path d="M5.0,0h90.0a5,5 0 0 1 0,10h-90.0a5,5 0 0 1 0,-10Z"/></clipPath>')
  expect(running).toContain('<rect class="s" x="35.0" y="0" width="30.0" height="10" fill="url(#k)"/>')
  expect(running).toContain('@media (prefers-reduced-motion: reduce){.m{display:none}.s{display:inline}}')
  expect(running).toContain('.s{display:none}')
  expect(glowOf(100)).toBe(30)
  expect(glowOf(40)).toBe(16)
  expect(strip({ width: 200, overall: 0.05, tone: 'green', isSliding: true })).toContain('width="16.0" height="10" fill="url(#k)"><animateTransform')
  const still = strip({ width: 200, overall: 0.5, tone: 'green', isSliding: false })
  expect(still).not.toContain('animate')
  expect(still).not.toContain('linearGradient')
  expect(still).not.toContain('class="s"')
})

test('the bar is one capsule 10 high: the track at full width, the fill overall × width and at least 10 once above 0, none at 0, full when all done, in one tone var', () => {
  const capsule = (width: number) => `M5.0,0h${(width - 10).toFixed(1)}a5,5 0 0 1 0,10h${(10 - width).toFixed(1)}a5,5 0 0 1 0,-10Z`
  const fillOnly = (source: string, tone: string) => source.match(new RegExp(`<path d="([^"]*)" style="fill:var\\(--${tone}\\)"/>`))?.[1]
  const source = strip({ width: 300, overall: 0.25, tone: 'green', isSliding: false })
  expect(source).toContain('height="10" viewBox="0 0 300 10"')
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
  expect(bar?.props.alt).toBe('Master session: 80 percent, 2 working, 1 waiting')
  expect(bar?.props.isInteractive).toBe(true)
  expect(await textsOf(ui)).toEqual(['80%', '2 working · 1 waiting', '2', '1', 'Open board'])
  expect(await buttonsOf(ui)).toEqual([])
  const [hit] = await hitsOf(ui)
  const columns = (hit?.[2] as { columns: number }).columns
  expect(hit).toEqual(['band-hit-board', 'hooks/components/press.tsx', { id: 'band-hit-board', columns, rows: 2 }])
  expect(columns * CH).toBeGreaterThanOrEqual(Number((await ui.find({ key: 'face-band-board' }))?.props.width) * CH)
  await click(ui, 'band-hit-board', columns - 1, 1)
  expect(opened).toEqual(['master-session'])
  await ui.unmount()
})

test('counts: numbers 600 C.text tabular, words and separators C.muted, the same style for every part; working and waiting always, subagents and workflows only above 0', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING)
  const styleOf = async (ui: Found) => {
    const counts = await countsIn(ui)
    const numbers = (await ui.findAll({ type: 'Text' })).filter(one => one.props.weight === 'semibold' && /^\d+$/.test(one.text))
    return { text: counts?.text, parent: [counts?.props.color, counts?.props.weight], numbers: numbers.map(one => [one.text, one.props.color, one.props.weight, one.props.tabular]) }
  }
  const none = await mount($)
  expect(await styleOf(none)).toEqual({ text: '2 working · 1 waiting', parent: ['inactive', undefined], numbers: [['2', 'text', 'semibold', true], ['1', 'text', 'semibold', true]] })
  await none.unmount()
  await crew.subagent('docs')
  await crew.subagent('review')
  await crew.workflow(3)
  const all = await mount($)
  const found = await styleOf(all)
  expect(found.text).toBe('2 working · 1 waiting · 2 subagents · 1 workflow')
  expect(found.parent).toEqual(['inactive', undefined])
  expect(found.numbers).toEqual(['2', '1', '2', '1'].map(value => [value, 'text', 'semibold', true]))
  expect((await stripOf(all))?.props.alt).toBe('Master session: 45 percent, 2 working, 1 waiting, 2 subagents, 1 workflow')
  const colors = (await all.findAll({ type: 'Text' })).filter(one => one.text !== 'Open board' && !/%$/.test(one.text)).map(one => one.props.color)
  expect(new Set(colors)).toEqual(new Set(['inactive', 'text']))
  await all.unmount()
  await crew.finish('docs')
  await crew.finish('review')
  for (const index of [0, 1, 2]) await crew.finish(`wf_1-${index}`)
  const after = await mount($)
  expect((await styleOf(after)).text).toBe('2 working · 1 waiting')
  await after.unmount()
  expect(countsText([{ text: '1', isNumber: true }, { text: ' subagent', isNumber: false }])).toBe('1 subagent')
})

test('needs you: the pill first, then the red bar, then Open chat; no percent and no counts; Open chat opens that worker', async ($, on) => {
  const { calls } = await band($, on, NEEDS, true)
  const ui = await mount($, 100)
  const bar = await stripOf(ui)
  expect(bar?.props.alt).toBe('Master session: Session · env-e2e-test needs you, commit blocked')
  expect(String(bar?.props.source)).toContain('fill:var(--red)')
  expect(await textsOf(ui)).toEqual(['Session · env-e2e-test needs you · commit blocked', 'Open chat'])
  expect(await percentIn(ui)).toBeUndefined()
  expect(await countsIn(ui)).toBeUndefined()
  expect(await iconsOf(ui)).toEqual(['session', 'Open chat'])
  const order = (await ui.findAll({})).filter(one => one.type === 'Svg' || one.key === 'face-band-chat' || one.props.borderColor === 'error').map(one => (one.type === 'Svg' ? (one.props.isInteractive ? 'bar' : one.props.alt) : one.props.borderColor === 'error' ? 'pill' : 'chat'))
  expect(order).toEqual(['pill', 'session', 'bar', 'chat', 'Open chat'])
  expect((await hitsOf(ui)).map(one => one[0])).toEqual(['band-hit-chat'])
  await click(ui, 'band-hit-chat', 1, 0)
  expect(calls.filter(one => one.tool === 'open_session_in').map(one => one.args.session_id)).toEqual(['local_e'])
  await ui.unmount()
  const narrow = await mount($, columnsFor(330))
  expect(await textsOf(narrow)).toEqual(['Session needs you'])
  expect(await iconsOf(narrow)).toEqual(['session', 'Open chat'])
  expect((await hitsOf(narrow)).map(one => one[0])).toEqual(['band-hit-chat'])
  await narrow.unmount()
})

test('all done: the check, the full green bar with no slider, "All N done" counting every unit, and Open board hidden while the pane is open', async ($, on) => {
  const run = await band($, on, DONE)
  const ui = await mount($)
  const bar = await stripOf(ui)
  expect(bar?.props.alt).toBe('Master session: all 4 done')
  expect(String(bar?.props.source)).toContain('fill:var(--green)')
  expect(String(bar?.props.source)).not.toContain('animate')
  expect(await textsOf(ui)).toEqual(['All 4 done', '4', 'Open board'])
  expect(await iconsOf(ui)).toEqual(['check', 'Open board'])
  expect(await percentIn(ui)).toBeUndefined()
  run.open(true)
  await click(ui, 'band-hit-board', 2, 1)
  await run.clock.settle()
  expect(run.opened).toEqual(['master-session'])
  expect(await textsOf(ui)).toEqual(['All 4 done', '4'])
  await ui.unmount()
})

test('exactly one Open board while the pane is closed, restyled in place on hover, never a second face; none while the pane is open', async ($, on) => {
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
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(2)
  expect(await hitsOf(ui)).toHaveLength(1)
  run.open(true)
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  expect(await scopesOf(ui)).toEqual([])
  expect(await hitsOf(ui)).toEqual([])
  expect((await textsOf(ui)).filter(one => one === 'Open board')).toHaveLength(0)
  await ui.unmount()
})

test('a listed pane that the person hid is not open: Open board shows again', async ($, on) => {
  const run = await band($, on, WORKING, true)
  const ui = await mount($)
  expect((await textsOf(ui)).filter(one => one === 'Open board')).toHaveLength(0)
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
    const progress = bandProgress(current, liveOf())
    if (!progress) throw new Error('no band')
    const table = $.ui.resolve(event)
    const { Box, Button, Text } = table
    const view = bandViewOf(event.props.bodyColumns, current, progress, false, IDLE, {
      board: () => pressed.push('board'),
      chat: (id, name) => pressed.push(`chat ${id} ${name}`),
    })
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
  { px: 598, counts: false, percent: true, board: 'Board' },
  { px: 400, counts: false, percent: true, board: 'Board' },
  { px: 342, counts: false, percent: true, board: 'Board' },
  { px: 330, counts: false, percent: false, board: 'Board' },
  { px: 200, counts: false, percent: false, board: 'Board' },
] as const

for (const point of WIDTHS) {
  test(`${point.px} px: ${point.counts ? 'counts' : 'no counts'}, ${point.percent ? 'the percent' : 'no percent'}, the bar always at 48 or more, the button ${point.board}`, async ($, on) => {
    const crew = crewOf($, on)
    await band($, on, WORKING)
    await crew.subagent('docs')
    const ui = await mount($, columnsFor(point.px))
    const width = point.px
    const view = viewOf(WORKING, { agents: [agentOf('docs', 'running')], workflows: [] }, columnsFor(width)).view
    expect([view.showCounts, view.hasPercent]).toEqual([point.counts, point.percent])
    expect(!!(await countsIn(ui))).toBe(point.counts)
    expect(!!(await percentIn(ui))).toBe(point.percent)
    expect((await textsOf(ui)).at(-1)).toBe(point.board)
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
  expect([tight.barWidth, tight.action?.isIconOnly, tight.actionWidth, tight.pillText.endsWith('…') || tight.pillText === 'Session needs you']).toEqual([expect.any(Number), true, 32, true])
})

test('a pill truncated to fit leaves the row inside the band width', () => {
  for (let px = 240; px <= 500; px += 4) {
    const view = viewOf(NEEDS, IDLE, columnsFor(px)).view
    const width = columnsFor(px) * COLUMN - 16
    const sides = [PILL_WIDTH + widthOf(view.pillText, { isBold: true }), view.actionWidth].filter(Boolean)
    const row = view.padLeft + view.padRight + 2 + sides.reduce((sum, one) => sum + one, 0) + sides.length * view.gap + view.barWidth
    expect(row).toBeLessThanOrEqual(width + 0.5)
  }
})

test('the bar takes the room the button leaves: with the pane open it grows by the button and its gap, and follows bodyColumns', async ($, on) => {
  const run = await band($, on, WORKING)
  const ui = await mount($)
  const closed = await barWidthOf(ui)
  const faceWidth = Number((await ui.find({ key: 'face-band-board' }))?.props.width) * CH
  run.open(true)
  await click(ui, 'band-hit-board', 1, 1)
  await run.clock.settle()
  expect(Math.abs((await barWidthOf(ui)) - (closed + faceWidth + 12))).toBeLessThanOrEqual(10)
  await ui.unmount()
  const at100 = await mount($, 100)
  const wide = await barWidthOf(at100)
  await at100.unmount()
  const at120 = await mount($, 120)
  expect((await barWidthOf(at120)) - wide).toBe(Math.round(20 * COLUMN))
  await at120.unmount()
})

test('terminal: one bar of block characters, the percent, the counts with their numbers in semibold, and the same pressable action', async ($, on) => {
  const crew = crewOf($, on)
  const { opened } = await band($, on, WORKING)
  await crew.subagent('docs')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await textsOf(ui)
  expect(texts.slice(0, 2)).toEqual(['64%', expect.stringMatching(/^█+░*$/)])
  expect(texts.slice(2)).toEqual(['2 working · 1 waiting · 1 subagent', '2', '1', '1'])
  expect((await ui.findAll({ type: 'Text' })).filter(one => /^\d+$/.test(one.text)).every(one => one.props.weight === 'semibold')).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).find(one => one.text.startsWith('2 working'))?.props.dimColor).toBe(true)
  expect(await buttonsOf(ui)).toEqual([['band-board', 'Open board']])
  expect((await ui.findAll({ type: 'Text' })).filter(one => /^[█░]+$/.test(one.text))).toHaveLength(1)
  await ui.press({ key: 'band-board' })
  expect(opened).toEqual(['master-session'])
  await ui.unmount()
})

test('terminal: all done is the check and a full bar with "All N done" only when nothing runs; needs you is the dot, the pill and Open chat', async ($, on) => {
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
  expect(texts[0]).toBe('✓')
  expect(texts[1]).toMatch(/^█+$/)
  expect(texts.slice(2)).toEqual(['All 5 done', '5'])
  await done.unmount()
  await $.tool.call({ tool: BOARD_TOOL, ...publish(NEEDS) })
  const needs = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const ask = await textsOf(needs)
  expect(ask[0]).toBe('● Session · env-e2e-test needs you · commit blocked')
  expect(ask.some(one => one.includes('working'))).toBe(false)
  expect(await buttonsOf(needs)).toEqual([['band-chat', 'Open chat']])
  await needs.unmount()
})

test('with no worker sessions, running subagents still show the band: 0%, the subagent count, and Open board', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, [], false, [])
  expect(bandProgressWith(boardOf([]), liveOf([], []), IDLE)).toBeUndefined()
  expect(bandProgressWith(boardOf([]), liveOf([], []), { agents: [agentOf('a', 'done')], workflows: [] })).toBeUndefined()
  expect(bandProgressWith(boardOf([]), liveOf([], []), { agents: [agentOf('a', 'running')], workflows: [] })?.total).toBe(0)
  expect(bandProgressWith(boardOf(WORKING), liveOf([], WORKING), IDLE)?.total).toBe(4)
  await crew.subagent('docs')
  await crew.subagent('review')
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['0%', '0 working · 0 waiting · 2 subagents', '0', '0', '2', 'Open board'])
  expect(String((await stripOf(ui))?.props.source)).toContain('animateTransform')
  await ui.unmount()
})

test('geometry: bar 56 with gap 12, percent 36, pill 34 with 0 12 0 8, check 18, button 32 with gap 4, the bar Svg 10 high', async ($, on) => {
  await band($, on, WORKING)
  const ui = await mount($)
  const bar = (await ui.findAll({ type: 'Box' })).find(box => box.props.borderStyle === 'round' && box.props.backgroundColor === C.surface)
  expect([bar?.props.height, bar?.props.gap, bar?.props.paddingLeft, bar?.props.paddingRight]).toEqual([tall(56), across(12), across(16), across(8)])
  expect((await ui.findAll({ type: 'Box' })).some(box => box.props.width === across(36) && JSON.stringify(box.children).includes('80%'))).toBe(true)
  expect((await stripOf(ui))?.props.height).toBe(10)
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

test('the needs-you pill names any kind: a session, a worker’s subagent with its parent and Open chat to that worker, this chat’s subagent or workflow agent with no Open chat', () => {
  const asking = WORKING.map(one => (one.id === 'local_b' ? { ...one, state: 'needs-you' as const, needsYou: 'Allow Bash: rm -rf dist' } : one))
  const remote = viewOf(asking, CREW({ remote: true }))
  expect([remote.view.pillText, remote.view.alt]).toEqual(['Code reviewer, in QA verifier, needs you · Allow Bash: rm -rf dist', 'Master session: Code reviewer, in QA verifier, needs you, Allow Bash: rm -rf dist'])
  expect(remote.view.action?.label).toBe('Open chat')
  remote.view.action?.press()
  expect(remote.chats).toEqual(['local_b mod-ui'])
  expect(viewOf(asking, CREW({ remote: true }), columnsFor(400)).view.pillText).toBe('Code reviewer needs you')
  const own = viewOf(WORKING, CREW({ own: true }))
  expect([own.view.pillText, own.view.action]).toEqual(['Code reviewer, in QA verifier, needs you · Allow Bash: rm -rf dist', undefined])
  const flow = viewOf(WORKING, CREW({ flow: true }))
  expect([flow.view.pillText, flow.view.action, flow.view.tone]).toEqual(['scan 1, in review-changes, needs you · Allow Edit: a.ts', undefined, 'red'])
  const session = viewOf(NEEDS, CREW())
  expect([session.view.pillText, session.view.action?.label]).toEqual(['Session · env-e2e-test needs you · commit blocked', 'Open chat'])
})

test('a worker’s run keeps its phases and counts as one unit, as a unit of agents finished over agents', () => {
  const crew = CREW()
  const workflows: WorkflowRecord[] = [...crew.workflows, { id: 'wf_9', toolUseId: '', name: 'remote-review', phases: ['A', 'B', 'C'], startedAt: 5, parentSessionId: 'local_c' }, { id: 'wf_8', toolUseId: '', phases: ['X', 'Y'], startedAt: 6, parentSessionId: 'local_a' }]
  const { view } = viewOf(WORKING, { ...crew, workflows })
  expect(view.units.filter(one => one.kind === 'workflow').map(one => [one.id, one.value, one.isRunning])).toEqual([['wf_8', 0, true], ['wf_9', 0, true], ['wf_1', 0.5, true]])
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

test('the band draws every linked worker on a stale board and leaves the archived one out: 2 of 4 published gives 4 units, and the pane draws the same 4 rows', async ($, on) => {
  await band($, on, WORKING.slice(0, 2), false, WORKING.map((one, index) => linkedOf(one.id, one.name, index !== 3)).concat(linkedOf('local_z', 'gone', false, true)))
  const ui = await mount($)
  expect(await textsOf(ui)).toEqual(['35%', '2 working · 2 waiting', '2', '2', 'Open board'])
  expect((await stripOf(ui))?.props.alt).toBe('Master session: 35 percent, 2 working, 2 waiting')
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
  const units = bandUnitsOf(bandProgress(board, live)?.segments ?? [], board, IDLE, live)
  expect([units.length, percentOf(units)]).toEqual([1, 50])
})

test('a running unit at 0% still shows: one subagent running and nothing finished reads 0% with a 16 wide fill and the slider', async ($, on) => {
  const crew = crewOf($, on)
  await band($, on, WORKING.map(one => ({ ...one, state: 'waiting' as const, progress: 'step 0 of 5 — x' })))
  await crew.subagent('docs')
  const ui = await mount($)
  expect(await percentIn(ui)).toBe('0%')
  const source = String((await stripOf(ui))?.props.source)
  expect(source).toContain('M5.0,0h6.0a5,5 0 0 1 0,10h-6.0a5,5 0 0 1 0,-10Z" style="fill:var(--green)"')
  expect(source).toContain('animateTransform')
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
  return bandUnitsOf(bandProgress(boardOf(sessions), live)?.segments ?? [], boardOf(sessions), IDLE, live)
}

test('unit state follows the pane: a working session that is not live is idle and waits, a ready session (done with a sha) is not finished; five sessions read 1 working · 4 waiting', () => {
  const units = fiveUnits(FIVE)
  expect(countsText(countsOf(units, false))).toBe('1 working · 4 waiting')
  expect(units.map(one => [one.id, one.group, one.isRunning, one.isFinished])).toEqual([
    ['local_a', 'waiting', false, false],
    ['local_i', 'waiting', false, false],
    ['local_f', 'waiting', false, false],
    ['local_w', 'working', true, false],
    ['local_r', 'waiting', false, false],
  ])
  const notLive = fiveUnits([{ ...FIVE[0]!, id: 'local_n' }], ['local_n'])
  expect([notLive[0]?.group, notLive[0]?.isRunning]).toEqual(['waiting', false])
})

test('a ready session never makes "All N done": it holds the percent at 99 and the fill grey', () => {
  const only = [FIVE[2]!]
  const { view } = viewOf(only, IDLE)
  expect([view.isAllDone, view.percent, view.tone, view.isRunning]).toEqual([false, 99, 'grey', false])
  const verified = viewOf([{ ...FIVE[2]!, verified: 'tests green' }], IDLE).view
  expect([verified.isAllDone, verified.percent]).toEqual([true, 100])
})

test('a finished session counts 1 whatever its fill', () => {
  const units = bandUnitsOf([{ id: 'local_d', state: 'done', fill: 0.4 }], boardOf([WORKING[3]!]), IDLE)
  expect([units[0]?.value, units[0]?.isFinished]).toEqual([1, true])
})

test('the pill names the unit that asked first by its since, not by position', () => {
  const ask = (text: string, since: number) => ({ text, since })
  const crew = (first: number, second: number) => ({
    agents: [agentOf('o1', 'running', { name: 'Reviewer', type: 'master-session:reviewer', asking: ask('late', second) }), agentOf('o2', 'running', { name: 'Designer', type: 'master-session:designer', asking: ask('early', first) })],
    workflows: [],
  })
  expect(viewOf(WORKING, crew(1, 5)).view.pillText).toBe('Designer needs you · early')
  expect(viewOf(WORKING, crew(5, 1)).view.pillText).toBe('Code reviewer needs you · late')
})

test('Open chat hides when the prompt is already in this chat, and opens the asker’s own chat otherwise', () => {
  const own = viewOf([{ id: SELF, name: 'master', state: 'needs-you', needsYou: 'ok?', progress: 'step 1 of 2 — x' }, ...WORKING], IDLE)
  expect([own.view.pillText.includes('needs you'), own.view.action]).toEqual([true, undefined])
  const crew = CREW({ remote: true })
  const chat = askingChatOf(boardOf(WORKING), liveOf([], WORKING), crew, [])
  expect(chat).toEqual({ id: 'local_b', name: 'mod-ui' })
  expect(askingChatOf(boardOf(WORKING), liveOf([], WORKING), CREW({ own: true }), [])).toBeUndefined()
  expect(askingChatOf(boardOf(NEEDS), liveOf(), IDLE, [])).toEqual({ id: 'local_e', name: 'env-e2e-test' })
  expect(askingChatOf(boardOf(WORKING), liveOf([], WORKING), IDLE, [])).toBeUndefined()
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
    const progress = bandProgress(current, liveOf([], WORKING))
    if (!progress) throw new Error('no band')
    const table = $.ui.resolve(event)
    const { Box, Button, Text } = table
    const view = bandViewOf(columnsFor(500), current, progress, false, IDLE, { board: () => undefined, chat: () => undefined })
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
    if (props.isInteractive === true) seen.push(props)
    return null
  }
  const ui = { Box, Text: stub, Button: stub, Svg } as unknown as Parameters<typeof Band>[0]
  Band(ui, { view })
  return seen[0] ? { ...seen[0], key: keys[0] } : undefined
}

test('the bar frame is sized to the bar and keyed by width and run state: stable across a percent-only change, new when the band stops running', () => {
  const first = viewOf(WORKING, IDLE)
  const bar = barProps(first.view)
  expect(bar?.width).toBe(first.view.barWidth)
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
  expect(String(drawn?.props.alt)).toContain('1 subagent')
  expect(String(drawn?.props.source)).toContain('animateTransform')
  expect(drawn?.props.width).toBe(await barWidthOf(ui))
  expect((await ui.findAll({ type: 'Box' })).map(one => one.key).filter(one => one?.startsWith('bar-'))).toEqual([`bar-${await barWidthOf(ui)}-run`])
  await ui.unmount()
  const fresh = await mount($)
  expect(String((await stripOf(fresh))?.props.source)).toContain('animateTransform')
  await fresh.unmount()
})
