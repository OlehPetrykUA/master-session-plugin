import type { EngineInterface } from 'claude-code'

import { FAULT_RETRY_MAX_MS, FAULT_RETRY_MS } from '../lib/constants'

const handlers = new Map<string, () => void>()
const faults = new Set<string>()
let retries = 0
let calm = 0

export function bindPress(id: string, onPress: () => void) {
  handlers.set(id, onPress)
}

export function runPress(id: string) {
  const onPress = handlers.get(id)
  if (onPress) onPress()
  return !!onPress
}

export function clearPresses() {
  handlers.clear()
}

function addFault(id: string) {
  const isFirst = !faults.size
  faults.add(id)
  return isFirst
}

export function hasFaults() {
  return faults.size > 0
}

export function clearFaults() {
  faults.clear()
}

function nextRetryMs() {
  return Math.min(FAULT_RETRY_MS * 2 ** retries++, FAULT_RETRY_MAX_MS)
}

export function recoverFault($: Pick<EngineInterface, 'clock' | 'ui'>, element: string) {
  if (!addFault(element)) return
  $.clock.after(nextRetryMs(), () => {
    clearFaults()
    $.ui.invalidate('ui.render')
    const mine = ++calm
    $.clock.after(FAULT_RETRY_MAX_MS, () => {
      if (mine === calm && !hasFaults()) retries = 0
    })
  })
}
