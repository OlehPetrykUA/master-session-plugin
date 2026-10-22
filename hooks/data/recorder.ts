import type { EngineInterface, On, ToolCallInput, TurnCompleteInput } from 'claude-code'

import { expandHome, parseStatus } from '../lib/git'
import { FRESH_MS, REPORTS_SPEC, REPORTS_TOOL, REPORT_SPEC, REPORT_TOOL, applyIntent, askOf, freshReport, parseIntent, reportsView, stamped, withFiles } from './contract'
import type { Report } from './contract'
import { parentFromBoards, readBoard, readReport, readReports, writeReport } from './status'

export type Role = { role: 'worker' | 'master' | ''; self: string; parent: string; engineId: string }

const NO_ROLE: Role = { role: '', self: '', parent: '', engineId: '' }
const COMMIT_LINE = /^\[[^\]\s]+(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.+)$/m
const TEST_RUNNER = /\b(?:pytest|jest|vitest|mocha|bats|go test|cargo test|(?:npm|pnpm|yarn|bun)(?: run)? test|plugin test|tsc|test_\w+\.(?:py|sh))\b/
const REPO = /(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)|\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/
const NUDGE = `Status check from your master session: call ${REPORT_TOOL} at your next step boundary. No chat reply.`
const FAILED: Record<string, string> = {
  [REPORT_TOOL]: 'The status report could not be saved: report in chat instead.',
  [REPORTS_TOOL]: 'The worker reports could not be read.',
}

let home = ''
let role = NO_ROLE
let current: Report | undefined
let detecting: Promise<void> | undefined
let gitCwd = ''

export const roleOf = () => role

export const commitOf = (command: string, output: string) => {
  const match = /\bgit\b/.test(command) && /\bcommit\b/.test(command) ? output.match(COMMIT_LINE) : null
  return match ? { sha: match[1] ?? '', subject: (match[2] ?? '').trim() } : undefined
}

export const isTestCommand = (command: string) => TEST_RUNNER.test(command)

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
  current = stamped(next, now)
  await writeReport($, home, current)
}

async function detect($: EngineInterface) {
  const me = await callJson($, 'ccd_session_mgmt', 'get_session', { session_id: 'self' }).catch(() => ({}) as Record<string, unknown>)
  const self = typeof me.sessionId === 'string' ? me.sessionId : ''
  if (!self) return
  const parent = typeof me.parentSessionId === 'string' && me.parentSessionId ? me.parentSessionId : await parentFromBoards($, home, self)
  const engineId = await $.session.id()
  role = { role: parent ? 'worker' : 'master', self, parent, engineId }
  if (!parent) {
    await $.tool.register(REPORTS_SPEC)
    return
  }
  const now = await $.clock.now()
  const known = await readReport($, home, self)
  await $.tool.register(REPORT_SPEC)
  await save($, { ...(known ?? freshReport(self, parent, engineId, now)), parent, engineId }, now)
}

function detected($: EngineInterface) {
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
  const isTest = isTestCommand(e.command)
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
      tests: isTest ? [...before.tests, { cmd: e.command.slice(0, 200), ok: !out.isError, summary: summaryOf(output), at: now }] : before.tests,
      activity: commit ? [...before.activity, { at: now, text: `committed ${commit.sha}` }] : before.activity,
      git: git ?? before.git,
    },
    now,
  )
}

async function turnStarted($: EngineInterface) {
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
  const live = { self: role.self, title: '', sessions: [], error: '', at: now }
  return { result: JSON.stringify(reportsView(shared?.board ?? null, await readReports($, home), live, now)) }
}

export async function startRecorder($: EngineInterface) {
  home = String((await $.env.get('HOME')) ?? '')
  role = NO_ROLE
  current = undefined
  detecting = undefined
  gitCwd = ''
  void detected($)
}

export async function recordTurnEnd($: EngineInterface, e: TurnCompleteInput) {
  if (e.agentId === undefined) await turnEnded($, e).catch(() => undefined)
}

export function recorder(on: On) {
  on('tool.call', async ($, e, next) => {
    if (String(e.tool) === REPORT_TOOL) return reported($, e)
    if (String(e.tool) === REPORTS_TOOL) return listed($)
    const out = await next(e)
    if (current && out.deny === undefined) await recordTool($, e, out).catch(() => undefined)
    return out
  }).catch(($, e, next) => {
    const failed = FAILED[String(e.tool)]
    return failed ? { deny: failed } : next(e)
  })

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId === undefined) await detected($).then(() => turnStarted($)).catch(() => undefined)
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
