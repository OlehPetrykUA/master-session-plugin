import type { EngineInterface, On, ToolCallInput, TurnCompleteInput } from 'claude-code'

import { asked, reportAgentsOf, reportRunsOf } from '../lib/agents'
import { expandHome, parseStatus } from '../lib/git'
import { getAgents, getBoard, getLive, getWorkflows, saveAgents } from '../state/atoms'
import { FRESH_MS, REPORTS_SPEC, REPORTS_TOOL, REPORT_SPEC, REPORT_TOOL, applyIntent, askOf, freshReport, parseIntent, reportsView, stamped, withFiles } from './contract'
import type { Report } from './contract'
import type { ReportAgent, ReportRun, SessionState } from '../../types'
import { boardPath, parentFromBoards, readBoard, readReport, readReports, writeReport } from './status'

type Held = { text: string; tool: string; state: SessionState; needsYou?: string; by?: string }

const MAIN = ''

export type Role = { role: 'worker' | 'master' | ''; self: string; parent: string; engineId: string }

const NO_ROLE: Role = { role: '', self: '', parent: '', engineId: '' }
const COMMIT_LINE = /^\[[^\]\s]+(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.+)$/m
const REPO = /(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)|\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/
const NUDGE = `Status check from your master session: call ${REPORT_TOOL} at your next step boundary. No chat reply.`
const ASKING = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input'])
const ANSWERED = new Set(['elicitation_complete', 'elicitation_response'])
const QUESTION_TOOL = 'AskUserQuestion'
const FAILED: Record<string, string> = {
  [REPORT_TOOL]: 'The status report could not be saved: report in chat instead.',
  [REPORTS_TOOL]: 'The worker reports could not be read.',
}

let home = ''
let role = NO_ROLE
let current: Report | undefined
let detecting: Promise<void> | undefined
let isBriefed = false
let gitCwd = ''
let held = new Map<string, Held>()
let outbox: ReportAgent[] = []
let runsOut: ReportRun[] = []
let syncing: Promise<void> = Promise.resolve()

export const roleOf = () => role

export const commitOf = (command: string, output: string) => {
  const match = /\bgit\b/.test(command) && /\bcommit\b/.test(command) ? output.match(COMMIT_LINE) : null
  return match ? { sha: match[1] ?? '', subject: (match[2] ?? '').trim() } : undefined
}

type Parsed = { text: string; bad: number }

type Family = 'pass' | 'passed' | 'validate' | 'tsc' | 'persona'

type Check = { pattern: RegExp; tool: (match: RegExpMatchArray) => string; exit: (match: RegExpMatchArray) => string; family?: Family }

const LABEL_CAP = 60

const lastNumber = (output: string, pattern: RegExp) => [...output.matchAll(pattern)].map(match => Number(match[1])).at(-1)

const tally = (output: string, passed: RegExp, failed: RegExp, word: [string, string]): Parsed | undefined => {
  const good = lastNumber(output, passed)
  const bad = lastNumber(output, failed) ?? 0
  if (good === undefined && !bad) return undefined
  return { text: [`${good ?? 0} ${word[0]}`, bad ? `${bad} ${word[1]}` : ''].filter(Boolean).join(' · '), bad }
}

const PARSE: Record<Family, (output: string) => Parsed | undefined> = {
  pass: output => tally(output, /^\s*(\d+) pass\s*$/gm, /^\s*(\d+) fail\s*$/gm, ['pass', 'fail']),
  passed: output => tally(output, /\b(\d+) passed\b/g, /\b(\d+) failed\b/g, ['passed', 'failed']),
  validate: output => (/Validation passed/.test(output) ? { text: 'passed', bad: 0 } : /Validation failed|✘/.test(output) ? { text: 'failed', bad: 1 } : undefined),
  tsc: output => {
    const errors = output.match(/\berror TS\d+/g)?.length ?? 0
    return errors ? { text: `${errors} error${errors === 1 ? '' : 's'}`, bad: errors } : undefined
  },
  persona: output => {
    const good = output.match(/^ok\s/gm)?.length ?? 0
    const bad = output.match(/^FAIL\s/gm)?.length ?? 0
    return good || bad ? { text: [`${good} ok`, bad ? `${bad} fail` : ''].filter(Boolean).join(' · '), bad } : undefined
  },
}

const CLAUDE = String.raw`(?:""\s+|\S*claude\s+)?`

const CHECKS: Check[] = [
  { pattern: new RegExp(`^${CLAUDE}plugin\\s+test\\b`), tool: () => 'plugin test', exit: () => 'plugin test', family: 'pass' },
  { pattern: new RegExp(`^${CLAUDE}plugin\\s+validate\\b`), tool: () => 'validate', exit: () => '(?:plugin )?validate', family: 'validate' },
  { pattern: /^(?:\S*\/)?tsc(?=\s|$)(?!\s+(?:-v|--version|-h|--help)\b)/, tool: () => 'tsc', exit: () => 'tsc', family: 'tsc' },
  { pattern: /^(?:(?:sh|bash)\s+|\.\/|\/)\S*persona\.test\.sh\b/, tool: () => 'persona.test', exit: () => 'persona(?:\\.test)?', family: 'persona' },
  { pattern: /^bun(?:\s+run)?\s+test\b/, tool: () => 'bun test', exit: () => 'bun test', family: 'pass' },
  { pattern: /^(npm|pnpm|yarn)(?:\s+run)?\s+test\b/, tool: match => `${match[1]} test`, exit: match => `${match[1]} test`, family: 'passed' },
  { pattern: /^(?:\S*\/)?(pytest|vitest|jest|mocha|bats)\b/, tool: match => match[1] ?? '', exit: match => match[1] ?? '', family: 'passed' },
  { pattern: /^(go|cargo)\s+test\b/, tool: match => `${match[1]} test`, exit: match => `${match[1]} test` },
  { pattern: /^(?:(?:python3?|sh|bash)\s+|\.\/|\/)\S*?\b(test_\w+\.(?:py|sh))\b/, tool: match => match[1] ?? '', exit: match => (match[1] ?? '').replace('.', '\\.'), family: 'passed' },
]

const LAUNCHER = /^(?:\w+=\S*\s+|time\s+|npx(?:\s+-\S+)*\s+|bunx\s+|bun\s+x\s+|pnpm\s+(?:exec|dlx)\s+|(?:uv|poetry)\s+run\s+|python3?\s+-m\s+)/

const unlaunched = (segment: string): string => {
  const next = segment.replace(LAUNCHER, '')
  return next === segment ? segment : unlaunched(next)
}

const segmentsOf = (command: string) =>
  command
    .replace(/(<<-?\s*['"]?(\w+)['"]?[^\n]*)\n[\s\S]*?\n\s*\2\b/g, '$1')
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""')
    .split(/&&|\|\||[;|\n()`]|\$\(/)
    .map(one => unlaunched(one.trim()))
    .filter(Boolean)

const checksOf = (command: string) => {
  const segments = segmentsOf(command)
  const seen = new Set<string>()
  return segments.flatMap((segment, index) => {
    for (const check of CHECKS) {
      const match = segment.match(check.pattern)
      if (!match) continue
      const tool = check.tool(match)
      if (seen.has(tool)) return []
      seen.add(tool)
      return [{ check, match, tool, isLast: index === segments.length - 1 }]
    }
    return []
  })
}

const overallOf = (output: string, isError: boolean) => (isError ? Number(output.match(/^Exit code (\d+)/m)?.[1] ?? 1) : 0)

export function testsOf(command: string, output: string, isError: boolean) {
  const found = checksOf(command)
  const shared = (family: Family | undefined) => found.filter(one => one.check.family === family).length > 1
  return found.flatMap(({ check, match, tool, isLast }) => {
    const line = lastNumber(output, new RegExp(`\\b${check.exit(match)} exit (\\d+)`, 'g'))
    const status = line ?? (isLast ? overallOf(output, isError) : undefined)
    const parsed = check.family && !shared(check.family) ? PARSE[check.family](output) : undefined
    if (!parsed && status === undefined) return []
    const ok = parsed ? !parsed.bad && (status === undefined || status === 0) : status === 0
    const text = parsed ? (!ok && !parsed.bad && status ? `${parsed.text} · exit ${status}` : parsed.text) : `exit ${status}`
    return [{ cmd: `${tool} · ${text}`.slice(0, LABEL_CAP), ok, summary: '' }]
  })
}

export const isTestCommand = (command: string) => checksOf(command).length > 0

const fieldOf = (input: unknown, key: string) => {
  const value = typeof input === 'object' && input ? (input as Record<string, unknown>)[key] : undefined
  return typeof value === 'string' && value ? value : undefined
}

export function promptTextOf(tool: string, input: unknown) {
  if (tool === QUESTION_TOOL) {
    const questions = typeof input === 'object' && input ? (input as { questions?: unknown }).questions : undefined
    return fieldOf(Array.isArray(questions) ? questions[0] : undefined, 'question') ?? 'Answer the question in the chat'
  }
  const detail = ['command', 'file_path', 'url', 'pattern', 'description'].map(key => fieldOf(input, key)).find(Boolean)
  return `Allow ${tool}${detail ? `: ${detail.slice(0, 160)}` : ''}`
}

export const summaryOf = (output: string) =>
  (
    output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .at(-1) ?? ''
  ).slice(0, 160)

export const repoOf = (command: string, base: string) => {
  const match = command.match(REPO)
  const path = (match?.[1] ?? match?.[2] ?? '').replace(/^["']|["']$/g, '')
  return path ? expandHome(path, base) : ''
}

async function callJson($: EngineInterface, server: string, tool: string, args: Record<string, unknown>) {
  const result = await $.mcp.call(server, tool, args)
  const body = result.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')
  if (result.isError) throw new Error(body || `${tool} failed`)
  return JSON.parse(body) as Record<string, unknown>
}

async function save($: EngineInterface, next: Report, now: number) {
  current = stamped({ ...next, agents: outbox, runs: runsOut }, now)
  await writeReport($, home, current)
}

export function syncAgents($: EngineInterface) {
  syncing = syncing.then(() => syncOnce($)).catch(() => undefined)
  return syncing
}

async function syncOnce($: EngineInterface) {
  if (!current) return
  const agents = reportAgentsOf(await getAgents($))
  const runs = reportRunsOf(await getWorkflows($))
  const now = await $.clock.now()
  if (!current || (JSON.stringify(agents) === JSON.stringify(current.agents ?? []) && JSON.stringify(runs) === JSON.stringify(current.runs ?? []))) return
  outbox = agents
  runsOut = runs
  await save($, current, now)
}

async function agentAsked($: EngineInterface, id: string, text: string, tool: string) {
  const now = await $.clock.now()
  held.set(id, { text, tool, state: 'working' })
  await saveAgents($, agents => asked(agents, id, { text, since: now }))
  await syncAgents($)
}

async function keyOf($: EngineInterface, agentId: string | undefined) {
  if (agentId === undefined) return MAIN
  const isTracked = (await getAgents($)).some(one => one.id === agentId && !one.parentSessionId && one.state === 'running')
  return isTracked ? agentId : MAIN
}

async function agentCleared($: EngineInterface, id: string) {
  held.delete(id)
  const main = held.get(MAIN)
  if (main?.by === id) await mainClosed($, main)
  await saveAgents($, agents => asked(agents, id, undefined))
  await syncAgents($)
}

async function detect($: EngineInterface) {
  const me = await callJson($, 'ccd_session_mgmt', 'get_session', { session_id: 'self' }).catch(() => ({}) as Record<string, unknown>)
  const self = typeof me.sessionId === 'string' ? me.sessionId : ''
  if (!self) return
  const isChild = typeof me.parentSessionId === 'string' && !!me.parentSessionId && me.detached !== true
  const asked = isChild ? String(me.parentSessionId) : ''
  const isMasterParent = !!asked && (isBriefed || (await $.fs.stat(boardPath(home, asked)).then(stat => stat.kind === 'file', () => false)))
  const parent = isChild ? (isMasterParent ? asked : '') : await parentFromBoards($, home, self)
  const engineId = await $.session.id()
  role = { role: parent ? 'worker' : 'master', self, parent, engineId }
  if (!parent) {
    await $.tool.register(REPORTS_SPEC)
    return
  }
  const now = await $.clock.now()
  const known = await readReport($, home, self)
  outbox = reportAgentsOf(await getAgents($))
  runsOut = reportRunsOf(await getWorkflows($))
  await $.tool.register(REPORT_SPEC)
  await save($, { ...(known ?? freshReport(self, parent, engineId, now)), parent, engineId }, now)
}

export function detected($: EngineInterface) {
  detecting ??= detect($)
    .catch(() => undefined)
    .then(() => {
      if (!role.role) detecting = undefined
    })
  return detecting
}

async function gitOf($: EngineInterface, now: number) {
  const where = gitCwd ? ['-C', gitCwd] : []
  const ran = await $.process.run(['git', '--no-optional-locks', ...where, 'status', '--porcelain=v2', '--branch'], { timeoutMs: 10_000 }).catch(() => undefined)
  if (!ran || ran.exitCode !== 0) return undefined
  const status = parseStatus(ran.stdout)
  const path = gitCwd || (await $.session.cwd().catch(() => ''))
  return { branch: ran.stdout.match(/^# branch\.head (.+)$/m)?.[1] ?? '', dirty: status.dirty, ahead: status.ahead, at: now, path }
}

async function recordTool($: EngineInterface, e: ToolCallInput, out: { isError?: boolean; text?: string }) {
  if (!current) return
  if (e.tool === 'Edit' || e.tool === 'Write') {
    if (out.isError || current.files.includes(e.file_path)) return
    return save($, { ...current, files: withFiles(current.files, [e.file_path]) }, await $.clock.now())
  }
  if (e.tool !== 'Bash') return
  const output = out.text ?? ''
  const commit = out.isError ? undefined : commitOf(e.command, output)
  const tests = testsOf(e.command, output, !!out.isError)
  const isTest = tests.length > 0
  const place = repoOf(e.command, home)
  const isMoved = !!place && place !== gitCwd
  if (!commit && !isTest && !isMoved) return
  const now = await $.clock.now()
  gitCwd = place || gitCwd
  const git = commit || isMoved ? await gitOf($, now) : undefined
  const before = current
  await save(
    $,
    {
      ...before,
      commits: commit ? [...before.commits.filter(one => one.sha !== commit.sha), { ...commit, at: now }] : before.commits,
      tests: isTest ? [...before.tests, ...tests.map(one => ({ ...one, at: now }))] : before.tests,
      activity: commit ? [...before.activity, { at: now, text: `committed ${commit.sha}` }] : before.activity,
      git: git ?? before.git,
    },
    now,
  )
}

async function promptOpened($: EngineInterface, text: string, tool: string, agentId?: string) {
  await detected($)
  const key = await keyOf($, agentId)
  if (key !== MAIN) return agentAsked($, key, text, tool)
  if (!current) return
  const now = await $.clock.now()
  const main = held.get(MAIN)
  held.set(MAIN, { text, tool, state: main?.state ?? current.state, needsYou: main ? main.needsYou : current.needsYou, by: agentId })
  if (current.state === 'needs-you' && current.needsYou === text) return
  await save($, { ...current, state: 'needs-you', needsYou: text, modelAt: now, waits: { since: now, on: 'you' } }, now)
}

async function promptClosed($: EngineInterface, tool?: string, agentId?: string, isScoped = true) {
  const key = agentId !== undefined && held.has(agentId) ? agentId : await keyOf($, agentId)
  const before = held.get(key)
  if (!before || (tool !== undefined && before.tool && before.tool !== tool)) return
  if (key !== MAIN) return agentCleared($, key)
  if (isScoped && before.by !== agentId) return
  await mainClosed($, before)
}

async function mainClosed($: EngineInterface, before: Held) {
  if (!current) return
  held.delete(MAIN)
  if (current.state !== 'needs-you' || current.needsYou !== before.text) return
  const now = await $.clock.now()
  await save($, { ...current, state: before.state, needsYou: before.needsYou, modelAt: now, waits: undefined }, now)
}

async function turnStarted($: EngineInterface) {
  held.delete(MAIN)
  if (!current) return
  const now = await $.clock.now()
  const wasAsking = current.state === 'needs-you'
  await save(
    $,
    {
      ...current,
      run: { ...current.run, isRunning: true, since: now },
      waits: undefined,
      state: wasAsking ? 'working' : current.state,
      needsYou: wasAsking ? undefined : current.needsYou,
    },
    now,
  )
}

const blockerOf = (e: TurnCompleteInput) => {
  if (e.reason === 'refusal') return ['the turn was refused', e.refusal.explanation].filter(Boolean).join(': ')
  return e.reason === 'error' ? 'the turn ended on an API error' : undefined
}

async function turnEnded($: EngineInterface, e: TurnCompleteInput) {
  if (!current) return
  const now = await $.clock.now()
  const blocker = blockerOf(e)
  const state = blocker ? 'needs-you' : current.state
  const git = await gitOf($, now)
  const before = current
  await save(
    $,
    {
      ...before,
      run: { isRunning: false, since: before.run.since, lastEnd: { at: now, reason: e.reason } },
      state,
      needsYou: blocker ?? before.needsYou,
      waits: { since: now, on: blocker ? 'you' : state === 'done' ? 'verification' : 'the next message' },
      git: git ?? before.git,
    },
    now,
  )
}

async function reported($: EngineInterface, input: unknown) {
  await detected($)
  if (!current) return { deny: 'This session has no master session: report status in chat instead.' }
  const parsed = parseIntent(input)
  if (parsed.error !== undefined) return { deny: parsed.error }
  const now = await $.clock.now()
  await save($, applyIntent(current, parsed.intent, now), now)
  return { result: `ok #${current.seq}` }
}

async function listed($: EngineInterface) {
  await detected($)
  const now = await $.clock.now()
  const shared = role.self ? await readBoard($, home, role.self, now) : undefined
  const live = await getLive($)
  return { result: JSON.stringify(reportsView(shared?.board ?? null, await readReports($, home), { ...live, self: live.self || role.self }, now)) }
}

export async function startRecorder($: EngineInterface) {
  home = String((await $.env.get('HOME')) ?? '')
  role = NO_ROLE
  current = undefined
  detecting = undefined
  isBriefed = false
  gitCwd = ''
  held = new Map()
  outbox = []
  runsOut = []
  syncing = Promise.resolve()
  void detected($)
}

export async function briefed($: EngineInterface) {
  if (await getBoard($)) return
  isBriefed = true
  if (role.role === 'worker') return
  role = NO_ROLE
  detecting = undefined
  await detected($)
}

export async function recordTurnEnd($: EngineInterface, e: TurnCompleteInput) {
  if (e.agentId !== undefined) return agentCleared($, e.agentId).catch(() => undefined)
  await promptClosed($, undefined, undefined, false).catch(() => undefined)
  await turnEnded($, e).catch(() => undefined)
}

export function recorder(on: On) {
  on('tool.call', async ($, e, next) => {
    if (String(e.tool) === REPORT_TOOL) return reported($, e)
    if (String(e.tool) === REPORTS_TOOL) return listed($)
    if (String(e.tool) === QUESTION_TOOL) await promptOpened($, promptTextOf(QUESTION_TOOL, e), QUESTION_TOOL, e.agentId).catch(() => undefined)
    const out = await next(e)
    await promptClosed($, String(e.tool), e.agentId).catch(() => undefined)
    if (current && out.deny === undefined) await recordTool($, e, out).catch(() => undefined)
    return out
  }).catch(($, e, next) => {
    const failed = FAILED[String(e.tool)]
    return failed ? { deny: failed } : next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await promptOpened($, promptTextOf(e.tool_name, e.tool_input), e.tool_name, e.agent_id).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (ASKING.has(e.notification_type) && !held.has(await keyOf($, e.agent_id))) await promptOpened($, e.message || e.title || 'Claude needs your input', '', e.agent_id).catch(() => undefined)
    if (ANSWERED.has(e.notification_type)) await promptClosed($, undefined, e.agent_id).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId === undefined) await detected($).then(() => turnStarted($)).catch(() => undefined)
    else await agentCleared($, e.agentId).catch(() => undefined)
    return started
  })

  on('session.receive', async ($, e, next) => {
    if (e.agentId !== undefined || !askOf(e.text)) return next(e)
    await detected($)
    if (!current) return next(e)
    const now = await $.clock.now()
    if (current.run.isRunning && now - current.modelAt >= FRESH_MS) return next({ ...e, text: NUDGE })
    await save($, current, now)
    return { consumed: 'answered a master-session ask from the last report' }
  }).catch(($, e, next) => next(e))
}
