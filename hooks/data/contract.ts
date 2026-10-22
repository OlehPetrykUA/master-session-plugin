import type { Board, BoardSession, EndReason, Live, LiveSession, Report, ReportAgent, SessionState, Step } from '../../types'

import { ORDER, stateOf } from '../lib/board'
import { compactOf } from '../lib/format'

export const REPORT_TOOL = 'mcp__master-session__report'
export const REPORTS_TOOL = 'mcp__master-session__reports'
export const ASK_MARK = '[master-session:ask]'
export const QUIET_MS = 10 * 60_000
export const FRESH_MS = 10 * 60_000
export const ANSWER_MS = 2 * 60_000
export const BOARD_MAX_AGE_MS = 30 * 60_000
export const REPORT_CAP = 16_384
export const SVG_CAP = 131_072

const TEXT_CAP = 300
const ACTIVITY_CAP = 20
const COMMITS_CAP = 20
const TESTS_CAP = 20
const FILES_CAP = 50

export type { EndReason, Report, Step }

export type Intent = Partial<Pick<Report, 'state' | 'persona' | 'progress' | 'now' | 'next' | 'needsYou' | 'risk'>> & { activity: string[]; files: string[] }

export type Merged = BoardSession & { reportAt?: number; ageMinutes?: number; isVerified: boolean; isQuiet: boolean; note?: string }

export type MergedBoard = Omit<Board, 'sessions'> & { sessions: Merged[] }

export type Published = Board & { at?: number }

export type Ask = { from: string; at: number }

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: ['working', 'waiting', 'needs-you', 'done'] },
    persona: { type: 'string', description: 'the persona your brief names, e.g. Implementer' },
    progress: { type: 'string', description: 'step N of M — label' },
    now: { type: 'string' },
    next: { type: 'string' },
    needsYou: { type: 'string', description: 'what you need from the master or the user' },
    risk: { type: 'string' },
    activity: { type: 'array', items: { type: 'string' } },
    commits: { type: 'array', items: { type: 'string' } },
    tests: { type: 'array', items: { type: 'string' } },
    files: { type: 'array', items: { type: 'string' } },
  },
}

export const REPORT_SPEC = {
  name: 'report',
  description:
    'Reports this worker session’s status to its master session’s pane. Call it at every step boundary, on a blocker and when done, with only what changed. Commits, test runs, edits and waits are recorded automatically.',
  inputSchema: REPORT_SCHEMA,
  isDeferred: false,
} as const

export const REPORTS_SPEC = {
  name: 'reports',
  description: 'Lists the latest status report of each worker session of this master: state, step, now, next, needs-you, and how old the report is.',
  inputSchema: { type: 'object', properties: {} },
} as const

const textOf = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, TEXT_CAP) : undefined)

const textsOf = (value: unknown) => (Array.isArray(value) ? value.flatMap(one => textOf(one) ?? []) : [])

const listOf = <T>(value: unknown, isItem: (item: Record<string, unknown>) => boolean) =>
  Array.isArray(value) ? (value.filter(item => item && typeof item === 'object' && isItem(item as Record<string, unknown>)) as T[]) : []

const progressText = (step: Step) => `step ${step.step} of ${step.of}${step.label ? ` — ${step.label}` : ''}`

export function parseStep(text: string): Step | undefined {
  const match = text.match(/^\s*step\s+(\d+)\s+of\s+(\d+)\s*(?:[—–:-]\s*(.*))?$/i)
  if (!match) return undefined
  const step = Number(match[1])
  const of = Number(match[2])
  return of > 0 && step <= of ? { step, of, label: (match[3] ?? '').trim() } : undefined
}

const AGENT_STATES = new Set(['running', 'done', 'failed'])

const isReportAgent = (item: Record<string, unknown>) =>
  typeof item.id === 'string' && typeof item.type === 'string' && typeof item.description === 'string' && AGENT_STATES.has(String(item.state)) && Number.isFinite(item.startedAt)

const isStep = (value: unknown): value is Step => {
  const step = value as Partial<Step> | undefined
  return !!step && Number.isInteger(step.step) && Number.isInteger(step.of) && (step.of ?? 0) > 0 && (step.step ?? 0) >= 0 && (step.step ?? 0) <= (step.of ?? 0)
}

export function parseIntent(raw: unknown): { intent: Intent; error?: undefined } | { error: string; intent?: undefined } {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const word = textOf(data.state)
  const state = stateOf(word)
  if (word && !state) return { error: `state must be one of ${ORDER.join(', ')}` }
  const steps = textOf(data.progress)
  const progress = steps ? parseStep(steps) : undefined
  if (steps && !progress) return { error: 'progress must read "step N of M — label", with M above 0 and N at most M' }
  const claims = [...textsOf(data.commits).map(one => `commit ${one}`), ...textsOf(data.tests).map(one => `tests ${one}`)]
  return {
    intent: {
      state,
      persona: textOf(data.persona),
      progress,
      now: textOf(data.now),
      next: textOf(data.next),
      needsYou: textOf(data.needsYou),
      risk: textOf(data.risk),
      activity: [...textsOf(data.activity), ...claims],
      files: textsOf(data.files),
    },
  }
}

export const freshReport = (session: string, parent: string, engineId: string, at: number): Report => ({
  v: 1,
  kind: 'status',
  session,
  engineId,
  parent,
  seq: 0,
  at,
  run: { isRunning: false },
  modelAt: 0,
  state: 'working',
  activity: [],
  commits: [],
  tests: [],
  files: [],
})

export const capped = (report: Report): Report => ({
  ...report,
  activity: report.activity.slice(-ACTIVITY_CAP),
  commits: report.commits.slice(-COMMITS_CAP),
  tests: report.tests.slice(-TESTS_CAP),
  files: report.files.slice(-FILES_CAP),
})

export const withFiles = (files: readonly string[], added: readonly string[]) => [...files.filter(file => !added.includes(file)), ...new Set(added)]

export function applyIntent(report: Report, intent: Intent, now: number): Report {
  const state = intent.state ?? report.state
  const isStillAsking = state === 'needs-you' && (intent.state === undefined || intent.state === 'needs-you')
  return capped({
    ...report,
    modelAt: now,
    state,
    persona: intent.persona ?? report.persona,
    progress: intent.progress ?? report.progress,
    now: intent.now ?? report.now,
    next: intent.next ?? report.next,
    needsYou: intent.needsYou ?? (isStillAsking ? report.needsYou : undefined),
    risk: intent.risk ?? report.risk,
    activity: [...report.activity, ...intent.activity.map(text => ({ at: now, text }))],
    files: withFiles(report.files, intent.files),
  })
}

export const stamped = (report: Report, now: number): Report => ({ ...report, seq: report.seq + 1, at: now })

export function parseReport(raw: unknown): Report | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  const state = stateOf(data.state)
  const isValid = data.v === 1 && data.kind === 'status' && !!textOf(data.session) && Number.isFinite(data.seq) && Number.isFinite(data.at)
  if (!isValid || !state) return undefined
  const run = data.run && typeof data.run === 'object' ? (data.run as Report['run']) : { isRunning: false }
  return {
    ...(data as Partial<Report>),
    v: 1,
    kind: 'status',
    session: String(data.session),
    engineId: textOf(data.engineId) ?? '',
    parent: textOf(data.parent) ?? '',
    seq: Number(data.seq),
    at: Number(data.at),
    run: { ...run, isRunning: run.isRunning === true },
    modelAt: Number(data.modelAt) || 0,
    state,
    persona: textOf(data.persona),
    progress: isStep(data.progress) ? data.progress : undefined,
    now: textOf(data.now),
    next: textOf(data.next),
    needsYou: textOf(data.needsYou),
    risk: textOf(data.risk),
    activity: listOf(data.activity, item => typeof item.text === 'string'),
    commits: listOf(data.commits, item => typeof item.sha === 'string'),
    tests: listOf(data.tests, item => typeof item.cmd === 'string'),
    files: textsOf(data.files),
    waits: listOf<NonNullable<Report['waits']>>([data.waits], item => Number.isFinite(item.since))[0],
    git: listOf<NonNullable<Report['git']>>([data.git], item => typeof item.branch === 'string' && Number.isFinite(item.dirty))[0],
    agents: listOf<ReportAgent>(data.agents, isReportAgent),
  }
}

export function accept(previous: Report | undefined, raw: unknown) {
  const next = parseReport(raw)
  if (!next) return previous
  return previous && previous.session === next.session && next.seq < previous.seq ? previous : next
}

function latestOf(reports: readonly Report[]) {
  const latest = new Map<string, Report>()
  for (const report of reports) {
    const known = latest.get(report.session)
    if (!known || report.seq > known.seq || (report.seq === known.seq && report.at > known.at)) latest.set(report.session, report)
  }
  return latest
}

const gitText = (git: NonNullable<Report['git']>) =>
  [git.branch, git.dirty ? `${git.dirty} uncommitted` : 'clean', git.ahead ? `${git.ahead} ahead` : ''].filter(Boolean).join(' · ')

const testText = (test: Report['tests'][number]) => [test.cmd, test.ok ? 'passed' : 'failed', test.summary].filter(Boolean).join(' · ')

function noteOf(state: SessionState, isVerified: boolean, isIdle: boolean, isRunning: boolean, age: number | undefined) {
  if (state === 'done' && !isVerified) return 'done · unverified'
  if (isIdle) return age === undefined ? 'idle' : `idle · report ${compactOf(age)} ago`
  if (isRunning && age !== undefined && age >= QUIET_MS) return `last report ${compactOf(age)} ago`
  return undefined
}

function isStoppedOf(report: Report | undefined, live: LiveSession | undefined) {
  if (live) return !live.isRunning
  return report ? !report.run.isRunning : false
}

function mergeOne(id: string, row: BoardSession | undefined, boardAt: number, report: Report | undefined, live: LiveSession | undefined, now: number): Merged {
  const isReportNewer = !!report && (!row || report.modelAt > boardAt)
  const isLiveTurn = !!report && (!!live?.isRunning || report.run.isRunning) && report.run.since !== undefined && report.run.since > boardAt
  const isAsking = report?.state === 'needs-you'
  const picked = (isReportNewer ? (report?.state ?? row?.state) : (row?.state ?? report?.state)) ?? 'working'
  const isWoken = !isAsking && isLiveTurn && (picked === 'done' || picked === 'waiting')
  const pick = <T>(fromReport: T | undefined, fromBoard: T | undefined) => (isReportNewer || isWoken ? (fromReport ?? fromBoard) : (fromBoard ?? fromReport))
  const reported = isAsking ? 'needs-you' : isWoken ? 'working' : picked
  const isIdle = reported === 'working' && isStoppedOf(report, live)
  const state = isIdle ? 'waiting' : reported
  const needsYou = isAsking ? (report.needsYou ?? row?.needsYou) : state === 'needs-you' ? pick(report?.needsYou, row?.needsYou) : undefined
  const isVerified = !!row?.verified
  const age = report ? Math.max(0, now - report.at) : undefined
  const isQuiet = !!live?.isRunning && age !== undefined && age >= QUIET_MS
  const merged: Merged = {
    ...row,
    id,
    name: row?.name ?? (live?.name || id),
    title: row?.title ?? live?.title,
    persona: pick(report?.persona, row?.persona),
    state,
    progress: pick(report?.progress && progressText(report.progress), row?.progress),
    now: isIdle ? `idle · waiting for ${report?.waits?.on || 'the next message'}` : pick(report?.now, row?.now),
    next: pick(report?.next, row?.next),
    risk: pick(report?.risk, row?.risk),
    needsYou,
    git: row?.git ?? (report?.git && gitText(report.git)),
    sha: row?.sha ?? report?.commits.at(-1)?.sha,
    activity: report?.activity.length ? report.activity.map(one => one.text) : row?.activity,
    commits: report?.commits.length ? report.commits.map(one => `${one.sha} ${one.subject}`) : row?.commits,
    tests: report?.tests.length ? report.tests.map(testText) : row?.tests,
    files: row?.files?.length ? row.files : report?.files,
    reportAt: report?.at,
    cwd: report?.git?.path || undefined,
    ageMinutes: age === undefined ? undefined : Math.floor(age / 60_000),
    isVerified,
    isQuiet,
    note: noteOf(state, isVerified, isIdle, !!live?.isRunning, age),
  }
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as Merged
}

export function merge(board: Published | null, reports: readonly Report[], live: Live, now: number): MergedBoard {
  const latest = latestOf(reports)
  const rows = new Map((board?.sessions ?? []).map(row => [row.id, row]))
  const own = [...latest.values()].filter(report => live.self && report.parent === live.self && !rows.has(report.session)).map(report => report.session)
  const sessions = [...rows.keys(), ...own].map(id =>
    mergeOne(
      id,
      rows.get(id),
      board?.at ?? 0,
      latest.get(id),
      live.sessions.find(one => one.id === id),
      now,
    ),
  )
  return { ...(board ?? { needsYou: [], repos: [], source: 'file' as const }), sessions }
}

export function reportsView(board: Board | null, reports: readonly Report[], live: Live, now: number) {
  const rows = new Map(board?.sessions.map(one => [one.id, one]))
  const sessions = [...latestOf(reports).values()]
    .filter(report => rows.has(report.session) || (live.self && report.parent === live.self))
    .map(report => ({
      id: report.session,
      title: live.sessions.find(one => one.id === report.session)?.title || rows.get(report.session)?.title || rows.get(report.session)?.name || '',
      at: new Date(report.at).toISOString(),
      ageMinutes: Math.floor(Math.max(0, now - report.at) / 60_000),
      state: report.state,
      progress: report.progress && progressText(report.progress),
      now: report.now,
      next: report.next,
      needsYou: report.needsYou,
    }))
  return { sessions }
}

export function askTargets(reports: readonly Report[], live: Live, ids: readonly string[]) {
  const latest = latestOf(reports)
  return live.sessions
    .filter(one => ids.includes(one.id) && one.isRunning && !one.isArchived)
    .map(one => ({ id: one.id, engineId: latest.get(one.id)?.engineId ?? '' }))
}

export function askSummary(sent: readonly { via: string }[], idle: number) {
  if (!sent.length) return idle ? `No running workers to ask · ${idle} idle, their last state is shown` : 'No running workers to ask'
  const reached = sent.filter(one => one.via !== 'failed').length
  const missed = sent.length - reached
  return [`Asked ${reached} running worker${reached === 1 ? '' : 's'}`, missed ? `${missed} not reached` : '', idle ? `${idle} idle skipped` : ''].filter(Boolean).join(' · ')
}

export const askText = (ask: Ask) =>
  `${ASK_MARK} ${JSON.stringify({ v: 1, kind: 'ask', ...ask })} Status check from your master session: call ${REPORT_TOOL} once with your current state and step, then carry on. No chat reply.`

export function askOf(text: string): Ask | undefined {
  const start = text.indexOf(ASK_MARK)
  if (start < 0) return undefined
  const body = text.slice(start + ASK_MARK.length).match(/^\s*(\{[^}]*\})/)?.[1]
  const data = (() => {
    try {
      return body ? (JSON.parse(body) as Record<string, unknown>) : undefined
    } catch {
      return undefined
    }
  })()
  return data?.kind === 'ask' && typeof data.from === 'string' && Number.isFinite(data.at) ? { from: data.from, at: Number(data.at) } : undefined
}

export function answerOf(askedAt: number, report: Report | undefined, now: number) {
  if (report && report.at >= askedAt) return 'answered'
  return now - askedAt >= ANSWER_MS ? 'no answer' : 'asking'
}

export const isArchivable = (row: Pick<BoardSession, 'state'>, live: LiveSession | undefined) => row.state !== 'needs-you' && !!live && !live.isRunning && !live.isArchived

export const fitsSvg = (source: string) => source.length < SVG_CAP
