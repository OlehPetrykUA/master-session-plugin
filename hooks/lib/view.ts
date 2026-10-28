import type { Chip } from '../components/FilterChips'
import { markWidthOf } from '../components/FilterChips'
import type { HeaderButton } from '../components/Header'
import type { PaneData } from '../components/types'
import type { IconName } from '../theme/icons'
import type { Tone } from '../theme/tokens'
import { compactOf, shortOf, updatedOf } from './format'
import { CH, LH, bodyWidthOf, liftOf } from './layout'
import { familyOf } from './rows'
import { NARRATIVE_MAX_ROWS, NARRATIVE_ROWS, NARRATIVE_STALE_MS } from './constants'
import { ARCHIVED_PEEK, ageOf, blocksOf, clockOf, countsOfItems, groupsOf, isAllDone, openIdOf, rowsOf, shortNameOf } from './list'
import type { Context } from './list'
import { pauseButtonOf, pauseStatusOf } from './pause'
import { processesPxOf, processesViewOf } from './processes'
import { NARROW_PX, contentHeightOf, dotExtraOf, headerRowsOf, sectionTopsOf, tileInnerOf } from './sections'
import type { SectionInput } from './sections'

export const noticeOf = (error: string) => `Can’t read sessions: ${error}`

export const ASK_WIDE = 'Ask for updates'
export const ASK_WIDE_PX = 460

const newestOf = (data: PaneData) => Math.max(data.live.at, data.board?.at ?? 0, ...data.agents.map(one => Math.max(one.endedAt ?? one.startedAt, one.asking?.since ?? 0)), ...data.workflows.map(one => one.startedAt))

export function statusOf(data: PaneData, isDone: boolean): { text: string; icon: IconName; tone: Tone } {
  const paused = pauseStatusOf(data.pause, data.board)
  if (paused) return paused
  if (data.live.error) return { text: 'live data unavailable', icon: 'offline', tone: 'muted' }
  if (data.isRefreshing) return { text: 'refreshing…', icon: 'clock', tone: 'muted' }
  if (data.asked) return { text: `asked ${data.asked.count} worker${data.asked.count === 1 ? '' : 's'} · ${ageOf(data.at - data.asked.at)}`, icon: 'chat', tone: 'muted' }
  if (isDone) return { text: `finished ${data.board?.tick || clockOf(data.at)}`, icon: 'done', tone: 'muted' }
  return { text: data.live.at ? updatedOf(data.at - newestOf(data)) : 'loading', icon: 'clock', tone: 'muted' }
}

export function narrativeOf(data: PaneData) {
  const text = data.board?.narrative
  const at = data.board?.narrativeAt ?? data.board?.at
  if (!text || at === undefined) return undefined
  const ms = data.at - at
  const room = bodyWidthOf(data.columns)
  const full = rowsOf(text, room, 13, NARRATIVE_MAX_ROWS)
  const hasMore = full.length > NARRATIVE_ROWS
  const isStale = ms >= NARRATIVE_STALE_MS
  return {
    text,
    rows: hasMore && !data.isNarrativeOpen ? rowsOf(text, room, 13, NARRATIVE_ROWS) : full,
    hasMore,
    isOpen: data.isNarrativeOpen,
    isStale,
    age: `written ${ms < 60_000 ? 'just now' : `${compactOf(ms)} ago`}${isStale ? ' · stale' : ''}`,
  }
}

export function paneViewOf(data: PaneData) {
  const context: Context = { at: data.at, trees: data.trees, sessions: familyOf(data.live), agents: data.agents, rows: data.rows, running: data.running, tasks: data.tasks, self: data.live.self }
  const { items } = data
  const counts = countsOfItems(items, data.archived.length)
  const chosen = data.chosen === 'archived' && !counts.archived ? 'all' : data.chosen
  const groups = groupsOf(items, data.archived, chosen, data.archiveView, data.undone?.group)
  const isDone = isAllDone(items)
  const isNarrow = data.columns * CH < NARROW_PX
  const chips: Chip[] = [
    { id: 'all', label: 'All', count: counts.all, icon: 'all' },
    { id: 'needs-you', label: 'Needs you', count: counts['needs-you'], tone: 'red' },
    { id: 'working', label: 'Working', count: counts.working, tone: 'green' },
    { id: 'waiting', label: 'Waiting', count: counts.waiting, tone: 'amber' },
    { id: 'done', label: 'Done', count: counts.done, tone: 'grey' },
    ...(counts.archived ? [{ id: 'archived' as const, label: 'Archived', count: counts.archived, icon: 'archive' as const }] : []),
  ]
  const isEmpty = chosen === 'all' ? !items.length : !counts[chosen]
  return {
    context,
    chosen,
    items,
    counts,
    groups,
    isDone,
    isNarrow,
    isEmpty,
    chips,
    status: statusOf(data, isDone),
    narrative: narrativeOf(data),
    processes: data.processes ? processesViewOf(data.processes, Object.fromEntries(items.flatMap(item => (item.kind === 'session' ? [[item.row.id, shortNameOf(item)]] : [])))) : undefined,
    blocks: blocksOf(isDone ? { ...data.totals, duration: { ...data.totals.duration, ms: (data.board?.at ?? data.at) - data.totals.duration.since } } : data.totals, data.rows.length > 0 || items.length > 0, isDone ? data.board?.tick || clockOf(data.at) : undefined),
    perRow: isNarrow ? 3 : 4,
    hasMore: chosen === 'all' && data.archiveView === 'open' && data.archived.length > ARCHIVED_PEEK,
  }
}

export type PaneView = ReturnType<typeof paneViewOf>

export function headerButtonsOf(data: PaneData, onAsk: () => void, onRefresh: () => void): HeaderButton[] {
  const ask: HeaderButton[] = !data.rows.length
    ? []
    : data.asked
      ? [{ id: 'ask', icon: 'check', label: 'Asked', onPress: onAsk, isQuiet: true }]
      : [{ id: 'ask', icon: 'chat', label: data.columns * CH >= ASK_WIDE_PX ? ASK_WIDE : 'Ask', onPress: onAsk }]
  const pause: HeaderButton[] = data.board ? [pauseButtonOf(data.pause, data.actions.pause)] : []
  return [...pause, ...ask, { id: 'refresh', icon: 'refresh', label: 'Refresh', onPress: onRefresh, isPressed: data.isRefreshing }]
}

function sectionInputOf(data: PaneData, view: PaneView): SectionInput {
  return {
    columns: data.columns,
    repos: data.trees.map(repo => shortOf(repo.name)),
    notice: data.live.error ? noticeOf(data.live.error) : '',
    status: view.status.text,
    buttons: headerButtonsOf(data, () => undefined, () => undefined).map(button => button.label),
    narrativeRows: view.narrative?.rows.length ?? 0,
    hasNarrativeMore: view.narrative?.hasMore ?? false,
    blockRows: Math.ceil(view.blocks.length / view.perRow),
    processesPx: view.processes ? processesPxOf(view.processes, data.columns) : 0,
    blockExtra: dotExtraOf(view.blocks.find(block => block.key === 'plan'), tileInnerOf(bodyWidthOf(data.columns), view.perRow)),
    chips: view.chips.map(chip => ({ label: chip.label, count: chip.count, hasMark: !!markWidthOf(chip), markWidth: markWidthOf(chip) })),
    groups: view.groups
      .filter(group => group.id === 'archived' || group.items.length)
      .map(group => ({
        rows: group.id === 'archived' ? (group.isOpen ? (view.chosen === 'archived' || data.archiveView === 'all' ? group.archived.length : Math.min(ARCHIVED_PEEK, group.archived.length)) : 0) : group.items.length,
        extra: 0,
        isArchived: group.id === 'archived',
      })),
    hasMore: view.hasMore,
    isEmpty: view.isEmpty,
    hasExpanded:
      view.groups.some(
        group =>
          group.items.some(item => openIdOf(item, data.open) !== undefined) ||
          group.archived.some(one => data.open.includes(one.id)),
      ) ||
      !!data.asking ||
      !!data.undone,
  }
}

export function sectionsOf(data: PaneData) {
  return sectionTopsOf(sectionInputOf(data, paneViewOf(data)))
}

export function pinOf(data: PaneData, view = paneViewOf(data)) {
  const input = sectionInputOf(data, view)
  const headerRows = headerRowsOf(input)
  const lift = data.offset === 0 || data.isAligned ? liftOf(data.offset) : liftOf(data.offset - 0.5)
  const contentHeight = contentHeightOf(input)
  if (contentHeight === undefined) return { headerRows, lift, endRow: undefined }
  const maxLift = Math.max(0, contentHeight - data.bodyRows * LH)
  const endRow = Math.round(maxLift / LH)
  return { headerRows, lift: data.offset >= endRow ? maxLift : Math.min(lift, maxLift), endRow }
}
