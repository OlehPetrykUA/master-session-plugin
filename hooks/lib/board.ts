import type { Board, BoardSession, Live, SessionState } from '../../types'

export const ORDER: readonly SessionState[] = ['needs-you', 'waiting', 'working', 'done']

const BY_ICON: Record<string, SessionState> = { '🔴': 'needs-you', '🟡': 'waiting', '🟢': 'working', '✅': 'done' }

const FIELDS = ['title', 'persona', 'now', 'next', 'progress', 'time', 'done', 'verified', 'git', 'location', 'risk', 'needsYou', 'sha', 'cwd'] as const

type Field = (typeof FIELDS)[number]

const LISTS = ['activity', 'commits', 'tests', 'files'] as const

const BY_MARK: Record<string, Field> = {
  '⏱': 'time',
  '📍': 'progress',
  '✔': 'done',
  '▸': 'now',
  '🔍': 'verified',
  '🌿': 'git',
  '⚠': 'risk',
  '→': 'next',
  '❓': 'needsYou',
}

const LINK = /\[([^\]]+)\]\(#(local_[\w-]+)\)/

const textOf = (value: unknown) => (typeof value === 'string' && value.trim() && value.trim() !== '—' ? value.trim() : undefined)

const stringsOf = (value: unknown) => (Array.isArray(value) ? value.flatMap(one => textOf(one) ?? []) : [])

const firstOf = (value: string) => [...value][0] ?? ''

export const stateOf = (value: unknown): SessionState | undefined => {
  const word = textOf(value)
  if (!word) return undefined
  return ORDER.find(state => state === word) ?? BY_ICON[firstOf(word)]
}

export function boardFromJson(raw: unknown, source: Board['source'] = 'file'): Board | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.sessions)) return null
  const sessions = data.sessions.flatMap((one): BoardSession[] => {
    if (!one || typeof one !== 'object') return []
    const row = one as Record<string, unknown>
    const id = textOf(row.id)
    const state = stateOf(row.state)
    if (!id || !state) return []
    const fields = Object.fromEntries(FIELDS.flatMap(key => (textOf(row[key]) ? [[key, textOf(row[key])]] : [])))
    const lists = Object.fromEntries(LISTS.flatMap(key => (stringsOf(row[key]).length ? [[key, stringsOf(row[key])]] : [])))
    return [{ ...fields, ...lists, id, name: textOf(row.name) ?? id, state, worktrees: stringsOf(row.worktrees) }]
  })
  const passed = typeof data.testsPassed === 'number' && Number.isFinite(data.testsPassed) ? data.testsPassed : undefined
  return {
    tick: textOf(data.tick),
    sessions,
    needsYou: stringsOf(data.needsYou),
    repos: stringsOf(data.repos),
    testsPassed: passed,
    testsNote: textOf(data.testsNote),
    since: typeof data.since === 'number' && Number.isFinite(data.since) ? data.since : undefined,
    source,
  }
}

const cellsOf = (line: string) =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

export function boardFromChat(message: string): Board | null {
  const tick = message.match(/🕐 \*\*Tick ([0-9:]+)\*\*/)?.[1]
  if (!tick) return null
  const sessions = new Map<string, BoardSession>()
  const needsYou: string[] = []
  const repos: string[] = []
  let current: BoardSession | undefined
  let isNeeds = false
  const upsert = (id: string, name: string, state: SessionState) => {
    const known = sessions.get(id) ?? { id, name, state }
    sessions.set(id, { ...known, name, state })
    return sessions.get(id) as BoardSession
  }
  for (const line of message.split('\n').map(raw => raw.trim())) {
    const head = line.match(/^####\s+(\S+)\s+\[([^\]]+)\]\(#(local_[\w-]+)\)(?:\s+—\s+(.*))?$/)
    const headState = head && stateOf(head[1])
    if (head && headState) {
      current = upsert(head[3] as string, head[2] as string, headState)
      if (head[4]) current.title = head[4]
      continue
    }
    if (line.startsWith('🙋')) {
      isNeeds = true
      needsYou.push(...line.replace(/^🙋\s*\*\*Needs you:\*\*/, '').split(/(?:^|\s)\d+\.\s+/).map(one => one.trim()).filter(Boolean))
      continue
    }
    const item = isNeeds && line.match(/^\d+\.\s+(.*)$/)
    if (item) {
      needsYou.push(item[1] as string)
      continue
    }
    isNeeds = isNeeds && !line
    if (!line.startsWith('|')) {
      if (line.startsWith('#')) current = undefined
      continue
    }
    const cells = cellsOf(line)
    const link = cells[1]?.match(LINK)
    const rowState = stateOf(cells[0])
    if (link && rowState && cells.length >= 4) {
      const row = upsert(link[2] as string, link[1] as string, rowState)
      row.now = textOf(cells[2]) ?? row.now
      row.next = textOf(cells[3]) ?? row.next
      if (rowState === 'done') row.sha = row.now?.match(/\b[0-9a-f]{7,40}\b/)?.[0] ?? row.sha
      continue
    }
    const field = cells.length === 2 ? BY_MARK[firstOf(cells[0] ?? '')] : undefined
    if (current && field && textOf(cells[1])) {
      current[field] = textOf(cells[1])
      continue
    }
    if (!link && cells.length >= 6 && (cells[0] === '✅' || firstOf(cells[0] ?? '') === '⚠')) repos.push(cells[1] as string)
  }
  return { tick, sessions: [...sessions.values()], needsYou, repos, source: 'chat' }
}

export function stepOf(progress: string | undefined) {
  const match = progress?.match(/step (\d+) of (\d+)\s*[—:-]?\s*(.*)$/i)
  if (!match) return undefined
  const total = Number(match[2])
  return { done: Math.min(Number(match[1]), total), total, label: (match[3] ?? '').trim() }
}

export type Progress = {
  segments: { id: string; state: SessionState; fill: number }[]
  total: number
}

export function progressOf(board: Board | null, live: Live): Progress {
  const gone = new Set(live.sessions.filter(one => one.isArchived).map(one => one.id))
  const segments = (board?.sessions ?? [])
    .filter(one => !gone.has(one.id))
    .map(one => {
      const step = stepOf(one.progress)
      const share = step && step.total ? step.done / step.total : 0
      const fill = one.state === 'done' ? 1 : share
      return { id: one.id, state: one.state, fill }
    })
  const total = segments.length
  return { segments, total }
}
