import type { Pause } from '../../types'

import { PERCENT } from '../theme/band'
import { BAR_MIN } from './band'
import type { BandView } from './band'
import { textWidth } from './layout'

export type PauseLead = { word: 'Pausing' | 'Paused' | 'Resuming'; tone: 'text' | 'amber' }

export type PausedBandView = BandView & { pauseLead?: PauseLead }

const WORD = { pausing: 'Pausing', paused: 'Paused', resuming: 'Resuming' } as const

export function bandPauseOf(view: BandView, pause: Pause): PausedBandView {
  if (pause.state === 'running' || !view.hasPercent) return view
  const word = WORD[pause.state]
  const isPausing = pause.state === 'pausing'
  const summary = `Master session: ${word.toLowerCase()}, ${view.parts[0]?.text} of ${view.parts[2]?.text} done.`
  return {
    ...view,
    hasPercent: false,
    pauseLead: { word, tone: pause.state === 'paused' ? 'amber' : 'text' },
    tone: isPausing ? view.tone : 'grey',
    isRunning: isPausing ? view.isRunning : false,
    barWidth: Math.max(BAR_MIN, view.barWidth - (textWidth(word, 15, { isBold: true }) - PERCENT)),
    summary,
    alt: `${summary} ${view.elapsed} elapsed.`,
  }
}
