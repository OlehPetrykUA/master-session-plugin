import type { EngineInterface } from 'claude-code'

import type { PaneData } from '../components/types'
import { archivedOf, countsOf, rowsOf } from '../lib/rows'
import { runSummaryOf } from '../lib/totals'
import { getAgents, getWorkflows, getConfirming, getExpanded, getFilter, getLive, getRepos, getSummaryHidden, setConfirming, setExpanded, setFilter, setSummaryHidden } from '../state/atoms'
import { archive, askAll, boardOf, homeOf, openSession, refreshAll, unarchive } from './sources'

export async function paneData($: EngineInterface, columns: number, offset = 0, bodyRows = 0, isAligned = false): Promise<PaneData> {
  const { board: current, from } = await boardOf($)
  const live = await getLive($)
  const trees = await getRepos($)
  const rows = rowsOf(current, live)
  const counts = countsOf(rows, trees)
  const archived = archivedOf(live)
  const agents = await getAgents($)
  const workflows = await getWorkflows($)
  const at = await $.clock.now()
  return {
    board: current,
    from,
    live,
    trees,
    rows,
    archived,
    agents,
    workflows,
    totals: runSummaryOf({ rows, counts, archived: archived.length, agents, workflows, board: current, trees, at }),
    counts,
    chosen: await getFilter($),
    open: await getExpanded($),
    asking: await getConfirming($),
    isBoardForced: await getSummaryHidden($),
    at,
    home: homeOf(),
    columns,
    offset,
    bodyRows,
    isAligned,
    actions: {
      refresh: () => void refreshAll($, true),
      showBoard: isBoard => setSummaryHidden($, isBoard),
      filter: id => setFilter($, id),
      toggle: id => setExpanded($, open => (open.includes(id) ? [] : [id])),
      collapse: id => setExpanded($, open => open.filter(one => one !== id)),
      confirm: what => setConfirming($, what),
      archive: targets => void archive($, targets),
      unarchive: one => void unarchive($, one),
      open: (id, name) => void openSession($, id, name),
      ask: () => void askAll($).then(text => $.ui.toast(text)),
    },
  }
}
