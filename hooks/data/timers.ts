import type { EngineInterface, Timer } from 'claude-code'

import { runningTimeOf } from '../components/detail/format'
import { FILE_MS, LIVE_MS, TICK_MS } from '../lib/constants'
import { elapsedOfItem, lineOf, openIdOf, runAgentsOf } from '../lib/list'
import type { RowItem } from '../lib/list'
import { paneViewOf } from '../lib/view'
import { refreshAgents } from './agents'
import { skipWhileBusy } from './flight'
import { refreshNarrative } from './narrative'
import { paneData } from './pane'
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
}

async function tickTimes($: EngineInterface) {
  if (!isActive() || !(await isMaster($)) || !(await isPaneOpen($))) return
  void refreshNarrative($).catch(() => undefined)
  const data = await paneData($, columns || 48)
  const view = paneViewOf(data)
  const shown = view.groups.flatMap(group => group.items).flatMap(item => (item.kind === 'workflow' && openIdOf(item, data.open) ? [item, ...runAgentsOf(item.run, data.agents)] : [item]))
  const labelOf = (item: RowItem) => {
    const line = lineOf(item, view.context)
    return [elapsedOfItem(item, data.at), line.cmdElapsed ? `${line.text}~${line.cmdElapsed}` : '', openIdOf(item, data.open) ? runningTimeOf(item, data.at) : ''].join('~')
  }
  const labels = [...shown.map(labelOf), view.status.text, view.blocks.find(block => block.key === 'duration')?.value, view.narrative?.age, view.narrative?.text].join('|')
  if (labels === lastLabels) return
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
  whileOpen = [$.clock.every(TICK_MS, skipWhileBusy(() => tickTimes($))), $.clock.every(FILE_MS, skipWhileBusy(() => filesOf($)))]
}

export function syncTimers($: EngineInterface) {
  if (!isActive() || isOff()) return stopTimers()
  try {
    always ??= $.clock.every(
      LIVE_MS,
      skipWhileBusy(async () => {
        await filesOf($)
        if (await isMaster($)) await refreshAll($)
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
