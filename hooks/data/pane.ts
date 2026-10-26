import type { EngineInterface } from 'claude-code'

import type { PaneData } from '../components/types'
import { archivedOf, familyOf, rowsOf } from '../lib/rows'
import { runSummaryOf } from '../lib/totals'
import { UNDO_MS } from '../lib/constants'
import { messageOf } from '../lib/format'
import { getAgents, getArchiveView, getAsked, getCleared, getClearing, getConfirming, getExpanded, getFilter, getLive, getNarrativeNote, getNarrativeOpen, getRefreshing, getReports, getRepos, getTasks, getUndone, getWorkflows, setArchiveView, setConfirming, setExpanded, setFilter, setNarrativeOpen } from '../state/atoms'
import { runningViewOf } from './running'
import { archive, askAll, clearDone, boardOf, homeOf, openSession, refreshAll, stopSession, unarchive, undoArchive } from './sources'

export async function paneData($: EngineInterface, columns: number, offset = 0, bodyRows = 0, isAligned = false): Promise<PaneData> {
  const { board: own } = await boardOf($)
  const note = await getNarrativeNote($)
  const current = own && note.text && note.boardAt === own.at ? { ...own, narrative: note.text, narrativeAt: note.at } : own
  const live = await getLive($)
  const trees = await getRepos($)
  const rows = rowsOf(current, live)
  const archived = archivedOf(live)
  const agents = await getAgents($)
  const workflows = await getWorkflows($)
  const at = await $.clock.now()
  const asked = await getAsked($)
  const isAnswered = !!asked && (await getReports($)).some(one => one.modelAt > asked.at)
  const undone = await getUndone($)
  const settle = (task: Promise<unknown>) => void task.catch((error: unknown) => $.ui.toast(messageOf(error)))
  return {
    board: current,
    live,
    trees,
    rows,
    archived,
    agents,
    workflows,
    running: runningViewOf(await getReports($), live),
    tasks: await getTasks($),
    totals: runSummaryOf({ rows, sessions: familyOf(live), agents, workflows, board: current, trees, at }),
    chosen: await getFilter($),
    open: await getExpanded($),
    asking: await getConfirming($),
    archiveView: await getArchiveView($),
    asked: isAnswered ? null : asked,
    undone: undone && at - undone.at < UNDO_MS ? undone : null,
    cleared: await getCleared($),
    isClearing: await getClearing($),
    isRefreshing: await getRefreshing($),
    isNarrativeOpen: await getNarrativeOpen($),
    at,
    home: homeOf(),
    columns,
    offset,
    bodyRows,
    isAligned,
    actions: {
      refresh: () => settle(refreshAll($, true)),
      archiveView: value => setArchiveView($, value),
      filter: id => setFilter($, id),
      toggle: id => setExpanded($, open => (open.includes(id) ? [] : [id])),
      collapse: id => setExpanded($, open => open.filter(one => one !== id)),
      confirm: what => setConfirming($, what),
      clear: (rows, skipped) => settle(clearDone($, rows, skipped)),
      archive: (targets, all, confirmed) => settle(archive($, targets, all, confirmed)),
      undo: () => settle(undoArchive($)),
      stop: (id, name) => settle(stopSession($, id, name)),
      unarchive: one => settle(unarchive($, one)),
      open: (id, name) => settle(openSession($, id, name)),
      narrative: () => settle(setNarrativeOpen($, open => !open)),
      ask: () => settle(askAll($).then(text => $.ui.toast(text))),
    },
  }
}
