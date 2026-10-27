import type { EngineInterface, Timer } from 'claude-code'

import { runningTimeOf } from '../components/detail/format'
import { FILE_MS, LIVE_MS, TICK_MS } from '../lib/constants'
import { elapsedOfItem, openIdOf, runAgentsOf } from '../lib/list'
import type { RowItem } from '../lib/list'
import { statusSentenceOf } from '../lib/status'
import { paneViewOf } from '../lib/view'
import { refreshAgents } from './agents'
import { bandStale, forgetBand } from './band'
import { skipWhileBusy } from './flight'
import { refreshNarrative } from './narrative'
import { paneData } from './pane'
import { readProcesses, stoppingLabelOf } from './processes'
import { isActive, isOff } from './recorder'
import { isMaster, isPaneOpen, refreshAll, refreshReports } from './sources'

let always: Timer | undefined
let whileOpen: Timer[] = []
let columns = 0
let lastLabels = ''

export const setColumns = (value: number) => {
  columns = value
}

export const resetLabels = () => {
  lastLabels = ''
  forgetBand()
}

async function tickTimes($: EngineInterface) {
  if (!isActive() || !(await isMaster($)) || !(await isPaneOpen($))) return
  void refreshNarrative($).catch(() => undefined)
  const data = await paneData($, columns || 48)
  const view = paneViewOf(data)
  const shown = view.groups.flatMap(group => group.items).flatMap(item => (item.kind === 'workflow' && openIdOf(item, data.open) ? [item, ...runAgentsOf(item.run, data.agents)] : [item]))
  const labelOf = (item: RowItem) => [elapsedOfItem(item, data.at), ...(openIdOf(item, data.open) ? [statusSentenceOf(item, view.context, data.home).text, runningTimeOf(item, data.at)] : [])].join('~')
  const isBand = await bandStale($)
  const labels = [...shown.map(labelOf), view.status.text, view.blocks.find(block => block.key === 'duration')?.value, view.narrative?.age, view.narrative?.text, stoppingLabelOf(data.at)].join('|')
  if (labels === lastLabels && !isBand) return
  lastLabels = labels
  $.ui.invalidate('ui.render')
}

let isFiling = false

async function filesOf($: EngineInterface) {
  if (!isActive() || isFiling) return
  isFiling = true
  try {
    if (await isMaster($)) await refreshReports($).catch(() => undefined)
    await refreshAgents($).catch(() => undefined)
  } finally {
    isFiling = false
  }
}

export function stopOpenTimers() {
  for (const timer of whileOpen) timer.cancel()
  whileOpen = []
}

export function stopTimers() {
  always?.cancel()
  always = undefined
  stopOpenTimers()
}

export function startOpenTimers($: EngineInterface) {
  if (whileOpen.length || !isActive() || isOff()) return
  whileOpen = [
    $.clock.every(TICK_MS, skipWhileBusy(() => tickTimes($))),
    $.clock.every(
      FILE_MS,
      skipWhileBusy(async () => {
        await filesOf($)
        await readProcesses($)
      }),
    ),
  ]
  void readProcesses($).catch(() => undefined)
}

export function syncTimers($: EngineInterface) {
  if (!isActive() || isOff()) return stopTimers()
  try {
    always ??= $.clock.every(
      LIVE_MS,
      skipWhileBusy(async () => {
        await filesOf($)
        if (await isMaster($)) {
          await refreshAll($)
          if (!whileOpen.length && (await bandStale($))) $.ui.invalidate('ui.render')
        }
        syncTimers($)
      }),
    )
    void isPaneOpen($)
      .then(isOpen => (isOpen ? startOpenTimers($) : stopOpenTimers()))
      .catch(() => undefined)
  } catch {
    return
  }
}
