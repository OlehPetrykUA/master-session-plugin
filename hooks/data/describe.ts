import type { EngineInterface } from 'claude-code'

import type { AgentRecord, TaskText, WorkflowRecord } from '../../types'

import { getAgents, getWorkflows, saveAgents, saveTasks, saveWorkflows } from '../state/atoms'
import { isActive, roleOf, syncAgents } from './recorder'

export const PLACEHOLDER = '(withheld: this workflow run does not share its script)'

export const MODEL = 'haiku'
export const MAX_TOKENS = 200
export const TIMEOUT_MS = 30_000
export const LIMIT = 2
export const STORED_MAX = 600
export const SOURCE_MAX = 6_000

export const INSTRUCTION =
  'Describe this task for the person who started it, in 1 to 3 plain English sentences: what it is asked to do, on what, and what it hands back. Write it as you would tell a colleague. Leave out roles, personas, report formats, protocols, rules, tool names, ids and shas, and never include credentials, keys, tokens, passwords or commands. Plain text only, no markdown, no quotes from the task.'

export const STRICT = 'Use no identifiers, numbers, paths, quotes or commands.'

export type Kind = 'subagent' | 'workflow agent' | 'workflow' | 'side chat'

export type Target = { type: 'agent' | 'run' | 'session'; id: string }

export type Job = { target: Target; kind: Kind; name: string; source: string }

type Outcome = { ok: true; text: string } | { ok: false; isGuard: boolean }

let queue: { job: Job; at: number }[] = []
let active = 0
let epoch = 0
const claimed = new Set<string>()

const WORD_BAD = /[\d`\\=:@$";|&<>{}[\]]/

const isLetter = (char: string | undefined) => !!char && /\p{L}/u.test(char)

const hasLooseQuote = (word: string) => [...word].some((char, index) => char === "'" && !(isLetter(word[index - 1]) && isLetter(word[index + 1])))

const stripped = (word: string) => word.replace(/^\(/, '').replace(/[.,;:!?)]$/, '')

const core = (word: string) => word.replace(/^[^\p{L}\p{N}-]+|[^\p{L}\p{N}]+$/gu, '')

const isShaped = (word: string, source: string) => !!word && source.includes(word) && (WORD_BAD.test(word) || word.startsWith('-') || hasLooseQuote(word))

export const isUnsafe = (reply: string, source: string) =>
  reply
    .split(' ')
    .some(word => isShaped(stripped(word), source) || isShaped(core(word), source))

export const normalized = (reply: string) => reply.replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()

export const capped = (text: string) => (text.length > STORED_MAX ? `${text.slice(0, STORED_MAX)}…` : text)

export const cleaned = (reply: string) => capped(normalized(reply))

const promptOf = (job: Job) => `Kind: ${job.kind}\nShort name: ${job.name}\n\nThe task as it was given:\n${job.source}`

async function attempt($: EngineInterface, job: Job, isStrict: boolean): Promise<Outcome> {
  const asked = $.model
    .complete({ model: MODEL, effort: 'low', maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS, system: isStrict ? `${INSTRUCTION} ${STRICT}` : INSTRUCTION, prompt: promptOf(job) })
    .catch(() => undefined)
  const result = await Promise.race([asked, $.clock.sleep(TIMEOUT_MS).then(() => undefined)])
  if (!result?.isAnswered) return { ok: false, isGuard: false }
  const text = normalized(result.text)
  if (!text) return { ok: false, isGuard: false }
  return isUnsafe(text, job.source) ? { ok: false, isGuard: true } : { ok: true, text: capped(text) }
}

const taskOf = (outcome: Outcome, target: Target): TaskText | undefined => (outcome.ok ? { state: 'done', text: outcome.text } : target.type === 'agent' ? { state: 'failed' } : undefined)

async function store($: EngineInterface, target: Target, task: TaskText | undefined) {
  const set = <T extends { id: string; task?: TaskText }>(items: T[]) => items.map(one => (one.id === target.id && one.task?.state === 'pending' ? { ...one, task } : one))
  if (target.type === 'agent') await saveAgents($, agents => set(agents as (AgentRecord & { id: string })[]))
  if (target.type === 'run') await saveWorkflows($, runs => set(runs as (WorkflowRecord & { id: string })[]))
  if (target.type === 'session') await saveTasks($, tasks => (tasks[target.id]?.state !== 'pending' ? tasks : task ? { ...tasks, [target.id]: task } : Object.fromEntries(Object.entries(tasks).filter(([key]) => key !== target.id))))
  await syncAgents($)
  $.ui.invalidate('ui.render')
}

const WEAK = 'pass|pw|tokens?|secrets?|auth|authorization|credentials?|key'

const ENV = 'PASS|PW|TOKEN|SECRET|KEY|AUTH'

const NOT_SECRET_CONSTANT = '(?!(?<![A-Za-z0-9_])(?:KEY_PREFIX|KEY_PATTERN|KEY_SEPARATOR|PRIMARY_KEY|SORT_KEY|CACHE_KEY|GROUP_KEY)(?![A-Z0-9_]))'

const anyCase = (word: string) => word.replace(/[a-z]/gi, char => `[${char.toLowerCase()}${char.toUpperCase()}]`)

const MYSQL_LIKE = ['mysql', 'mysqldump', 'mariadb'].map(anyCase).join('|')

const CUES = [
  /password|passwd|passphrase|pwd|apikey|api[ _-]key|private[ _-]key|access[ _-]key|bearer|identified\s+by/i,
  new RegExp(`(?<![a-z0-9])(?:${WEAK})["']?\\s*[:=]\\s*\\S`, 'i'),
  /[a-z](?:Pass|Pw|Tokens?|Secrets?|Auth|Key|Credentials?)["']?\s*[:=]\s*\S/,
  /(?<![A-Za-z0-9])(?:pass|pw|tokens?|secrets?|auth|key|credentials?)[A-Z][A-Za-z0-9]*["']?\s*[:=]\s*\S/,
  new RegExp(`[A-Z0-9_]*(?:${ENV})[A-Z0-9_]*=`),
  new RegExp(`(?<![A-Z0-9_])${NOT_SECRET_CONSTANT}(?:[A-Z0-9]+_(?:${ENV})|(?:${ENV})_[A-Z0-9_]+)(?![A-Z0-9_])`),
  new RegExp(`(?<![a-z0-9-])--(?:${WEAK})(?![a-z0-9])`, 'i'),
  /(?<![A-Za-z0-9])(?:gh[pousr]_|github_pat_|glpat-|xox[abpr]-|AKIA|ASIA|hvs\.)[A-Za-z0-9]/,
  /(?<![A-Za-z0-9])npm_(?!(?:package_version|config_registry|lifecycle_event)(?![A-Za-z0-9_]))[A-Za-z0-9]/,
  /(?<![A-Za-z0-9])sk-(?!learn(?![\w-]|\.\w))[A-Za-z0-9]/,
  /(?:^|[\s"'])-(?:p(?!(?:rune|rint[0f]?|ath|erm|thread|l|edantic|ipe)(?![A-Za-z0-9]))|P)[A-Za-z0-9]/,
  new RegExp(`\\b(?:${MYSQL_LIKE})\\b[^\\n]*?\\s(?:-p\\s+\\S|-p[A-Za-z0-9]|-P\\s+(?!\\d+(?:\\s|$))\\S)`),
  /\b(?:sshpass|sqlcmd|mongosh?|ssh-keygen|zip|unzip|mosquitto_pub|(?:^|[\w-]+\s+)login)\b[^\n]*?\s-p\s+\S/i,
  /\bredis-cli\b[^\n]*?\s-a\s+\S/,
  /(?:^|\s)(?:-u\s*|--user[=\s]\s*)[^\s:]+:\S/,
  /\bldap\w*\b[^\n]*?\s-w\s+\S/i,
  /-U\s+[^\s%]+%\S/,
  /:\/\/[^\s/@]+@/,
  /hooks\.slack\.com\/services\//i,
  /\bgh\s+secret\b|\bvault\s+login\s+\S/i,
  /\|\s*sudo\s+-S\b|\bsudo\s+-S\s*<<</,
]

export const hasCue = (text: string) => CUES.some(cue => cue.test(text))

async function run($: EngineInterface, job: Job): Promise<Outcome> {
  if (hasCue(job.source) || hasCue(job.name)) return { ok: false, isGuard: false }
  const first = await attempt($, job, false)
  return first.ok || !first.isGuard ? first : attempt($, job, true)
}

function pump($: EngineInterface) {
  while (active < LIMIT && queue.length) {
    const next = queue.shift()
    if (!next) break
    active += 1
    const { job, at } = next
    void run($, job)
      .then(outcome => (at === epoch ? store($, job.target, taskOf(outcome, job.target)) : undefined))
      .catch(() => undefined)
      .finally(() => {
        if (at !== epoch) return
        active -= 1
        pump($)
      })
  }
}

async function pending($: EngineInterface, target: Target) {
  const mark = <T extends { id: string; task?: TaskText }>(items: T[]) => items.map(one => (one.id === target.id ? { ...one, task: { state: 'pending' as const } } : one))
  if (target.type === 'agent') await saveAgents($, agents => mark(agents))
  if (target.type === 'run') await saveWorkflows($, runs => mark(runs))
  if (target.type === 'session') await saveTasks($, tasks => ({ ...tasks, [target.id]: { state: 'pending' } }))
}

async function isFresh($: EngineInterface, target: Target) {
  if (target.type === 'agent') return (await getAgents($)).some(one => one.id === target.id && !one.parentSessionId && !one.task)
  if (target.type === 'run') return (await getWorkflows($)).some(one => one.id === target.id && !one.parentSessionId && !one.task)
  return true
}

export const isMasterRole = () => isActive() && roleOf().role !== 'worker'

export async function describe($: EngineInterface, job: Job) {
  const key = `${job.target.type}:${job.target.id}`
  if (claimed.has(key)) return
  claimed.add(key)
  try {
    if (!isActive() || !job.source.trim() || !(await isFresh($, job.target))) return
    await pending($, job.target)
    queue.push({ job, at: epoch })
    pump($)
  } finally {
    claimed.delete(key)
  }
}

export async function settleTasks($: EngineInterface) {
  epoch += 1
  queue = []
  active = 0
  const drop = <T extends { task?: TaskText }>(items: T[]) => items.map(one => (one.task?.state === 'pending' ? { ...one, task: undefined } : one))
  await saveAgents($, agents => drop(agents))
  await saveWorkflows($, runs => drop(runs))
  await saveTasks($, tasks => Object.fromEntries(Object.entries(tasks).filter(([, task]) => task.state !== 'pending')))
}
