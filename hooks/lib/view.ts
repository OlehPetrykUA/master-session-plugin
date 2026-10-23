import type { Chip } from '../components/FilterChips'
import { markWidthOf } from '../components/FilterChips'
import type { HeaderButton } from '../components/Header'
import type { PaneData } from '../components/types'
import type { IconName } from '../theme/icons'
import type { Tone } from '../theme/tokens'
import { shortOf, updatedOf } from './format'
import { COLUMN, LH, liftOf } from './layout'
import { familyOf } from './rows'
import { ARCHIVED_PEEK, ageOf, blocksOf, clockOf, countsOfItems, groupsOf, isAllDone, itemsOf, openIdOf } from './list'
import { NARROW_PX, contentHeightOf, headerRowsOf, sectionTopsOf } from './sections'
import type { SectionInput } from './sections'

export const noticeOf = (error: string) => `Can’t read sessions: ${error}`

export const ASK_WIDE = 'Ask for updates'
export const ASK_WIDE_PX = 460

export function statusOf(data: PaneData, isDone: boolean): { text: string; icon: IconName; tone: Tone } {
  if (data.live.error) return { text: 'live data unavailable', icon: 'offline', tone: 'muted' }
  if (data.isRefreshing) return { text: 'refreshing…', icon: 'clock', tone: 'muted' }
  if (data.asked) return { text: `asked ${data.asked.count} worker${data.asked.count === 1 ? '' : 's'} · ${ageOf(data.at - data.asked.at)}`, icon: 'chat', tone: 'muted' }
  if (isDone) return { text: `finished ${data.board?.tick || clockOf(data.at)}`, icon: 'done', tone: 'muted' }
  return { text: data.live.at ? updatedOf(data.at - data.live.at) : 'loading', icon: 'clock', tone: 'muted' }
}

export function paneViewOf(data: PaneData) {
  const items = itemsOf(data.rows, data.agents, data.workflows, { trees: data.trees, sessions: familyOf(data.live) })
  const counts = countsOfItems(items, data.archived.length)
  const groups = groupsOf(items, data.archived, data.chosen, data.archiveView, data.undone?.group)
  const isDone = isAllDone(items)
  const isNarrow = data.columns * COLUMN < NARROW_PX
  const chips: Chip[] = [
    { id: 'all', label: 'All', count: counts.all, icon: 'all' },
    { id: 'needs-you', label: 'Needs you', count: counts['needs-you'], tone: 'red' },
    { id: 'working', label: 'Working', count: counts.working, tone: 'green' },
    { id: 'waiting', label: 'Waiting', count: counts.waiting, tone: 'amber' },
    { id: 'done', label: 'Done', count: counts.done, tone: 'grey' },
    { id: 'archived', label: 'Archived', count: counts.archived, icon: 'archive' },
  ]
  const isEmpty = data.chosen === 'all' ? !items.length : !counts[data.chosen]
  return {
    items,
    counts,
    groups,
    isDone,
    isNarrow,
    isEmpty,
    chips,
    status: statusOf(data, isDone),
    blocks: blocksOf(data.totals, data.rows.length > 0 || items.length > 0, isDone ? data.board?.tick || clockOf(data.at) : undefined),
    perRow: isNarrow ? 3 : 4,
    hasMore: data.chosen === 'all' && data.archiveView === 'open' && data.archived.length > ARCHIVED_PEEK,
  }
}

export type PaneView = ReturnType<typeof paneViewOf>

export function headerButtonsOf(data: PaneData, onAsk: () => void, onRefresh: () => void): HeaderButton[] {
  const ask: HeaderButton[] = data.asked
    ? [{ id: 'ask', icon: 'check', label: 'Asked', onPress: onAsk, isQuiet: true }]
    : [{ id: 'ask', icon: 'chat', label: data.columns * COLUMN >= ASK_WIDE_PX ? ASK_WIDE : 'Ask', onPress: onAsk }]
  return [...ask, { id: 'refresh', icon: 'refresh', label: 'Refresh', onPress: onRefresh, isPressed: data.isRefreshing }]
}

function sectionInputOf(data: PaneData, view: PaneView): SectionInput {
  return {
    columns: data.columns,
    repos: data.trees.map(repo => shortOf(repo.name)),
    isNarrow: view.isNarrow,
    notice: data.live.error ? noticeOf(data.live.error) : '',
    status: view.status.text,
    buttons: headerButtonsOf(data, () => undefined, () => undefined).map(button => button.label),
    blockRows: Math.ceil(view.blocks.length / view.perRow),
    chips: view.chips.map(chip => ({ label: chip.label, count: chip.count, hasMark: !!markWidthOf(chip), markWidth: markWidthOf(chip) })),
    groups: view.groups
      .filter(group => group.id === 'archived' || group.items.length)
      .map(group => ({ rows: group.id === 'archived' ? (group.isOpen ? (data.chosen === 'archived' || data.archiveView === 'all' ? group.archived.length : Math.min(ARCHIVED_PEEK, group.archived.length)) : 0) : group.items.length, isArchived: group.id === 'archived' })),
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
