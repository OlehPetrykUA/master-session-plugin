import type { Chip } from '../components/FilterChips'
import type { PaneData } from '../components/types'
import { TITLE } from './constants'
import { shortOf, updatedOf } from './format'
import { ASK, LH, liftOf } from './layout'
import { contentHeightOf, headerRowsOf, sectionTopsOf } from './sections'
import type { SectionInput } from './sections'

export function paneViewOf(data: PaneData) {
  const isAllDone = data.rows.length > 0 && data.rows.every(row => row.state === 'done' || row.state === 'needs-you') && data.rows.some(row => row.state === 'done')
  const isSummary = isAllDone && !data.isBoardForced && data.chosen !== 'archived'
  const status = data.from
    ? `from ${data.from}`
    : isSummary
      ? data.board?.tick
        ? `finished ${data.board.tick}`
        : 'finished'
      : data.live.error
        ? 'live data unavailable'
        : data.live.at
          ? updatedOf(data.at - data.live.at)
          : 'loading'
  const shown = data.chosen === 'all' || data.chosen === 'archived' ? data.rows : data.rows.filter(row => row.state === data.chosen)
  const chips: Chip[] = [
    { id: 'all', label: 'All', count: data.rows.length, icon: 'all' },
    { id: 'needs-you', label: 'Needs you', count: data.counts['needs-you'], tone: 'red' },
    { id: 'waiting', label: 'Waiting', count: data.counts.waiting, tone: 'amber' },
    { id: 'working', label: 'Working', count: data.counts.working, tone: 'green' },
    { id: 'done', label: 'Done', count: data.counts.done, tone: 'grey' },
    { id: 'archived', label: 'Archived', count: data.archived.length, icon: 'archive' },
  ]
  return { isAllDone, isSummary, status, shown, focused: shown.filter(row => data.open.includes(row.id)), chips }
}

export function headerOf(data: PaneData, view: ReturnType<typeof paneViewOf>) {
  const toggle = view.isAllDone ? (view.isSummary ? 'Board' : 'Summary') : ''
  const hasAsk = !data.from && !view.isSummary
  return { title: view.isSummary ? 'Run summary' : TITLE, status: view.status, labels: [toggle, hasAsk ? ASK : '', 'Refresh'].filter(Boolean) }
}

function sectionInputOf(data: PaneData, view: ReturnType<typeof paneViewOf>): SectionInput {
  return {
    columns: data.columns,
    repos: data.trees.map(repo => shortOf(repo.name)),
    header: headerOf(data, view),
    chips: view.isSummary ? null : view.chips.map(chip => ({ label: chip.label, count: chip.count, hasMark: !!(chip.tone || chip.icon), markWidth: chip.tone ? 7 : 14 })),
    hasError: !!data.live.error,
    body: data.chosen === 'archived' ? (data.archived.length ? 'archived' : 'none') : view.isSummary ? 'summary' : 'tiles',
    hasExpanded: view.focused.length > 0,
  }
}

export function sectionsOf(data: PaneData) {
  return sectionTopsOf(sectionInputOf(data, paneViewOf(data)))
}

export function pinOf(data: PaneData, view = paneViewOf(data)) {
  const input = sectionInputOf(data, view)
  const headerRows = headerRowsOf(data.columns, input.repos, input.header)
  const lift = data.offset === 0 || data.isAligned ? liftOf(data.offset) : liftOf(data.offset - 0.5)
  const contentHeight = contentHeightOf(input, input.body === 'archived' ? (data.asking ? 0 : data.archived.length) : Math.ceil(view.shown.length / 2))
  if (contentHeight === undefined) return { headerRows, lift, endRow: undefined }
  const maxLift = Math.max(0, contentHeight - data.bodyRows * LH)
  const endRow = Math.round(maxLift / LH)
  return { headerRows, lift: data.offset >= endRow ? maxLift : Math.min(lift, maxLift), endRow }
}
