import type { EngineInterface } from 'claude-code'

import { agentCountsOf, bandProgressWith, bandSignatureOf, bandViewOf } from '../lib/band'
import type { BandView } from '../lib/band'
import { getAgents, getLive, getReports, getRepos, getWorkflows } from '../state/atoms'
import { runningViewOf } from './running'
import { boardOf, isPaneOpen } from './sources'

type Actions = Parameters<typeof bandViewOf>[5]

export async function bandData($: EngineInterface, columns: number, act: Actions) {
  const { board: current } = await boardOf($)
  const agents = agentCountsOf(await getAgents($), await getWorkflows($), await $.clock.now())
  const live = await getLive($)
  const progress = bandProgressWith(current, live, agents)
  if (!progress) return undefined
  return bandViewOf(columns, current, progress, await isPaneOpen($), agents, act, live, await getRepos($), runningViewOf(await getReports($), live))
}

const WIDE = 120

const NO_ACT = { board: () => undefined, chat: () => undefined }

let drawn: string | undefined

export const forgetBand = () => {
  drawn = undefined
}

export const markBand = (view: BandView) => {
  drawn = bandSignatureOf(view)
}

export async function bandStale($: EngineInterface) {
  const view = await bandData($, WIDE, NO_ACT)
  const now = view ? bandSignatureOf(view) : ''
  const isStale = drawn !== undefined && drawn !== now
  drawn = now
  return isStale
}
