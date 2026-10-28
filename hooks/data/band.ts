import type { EngineInterface } from 'claude-code'

import { agentCountsOf, bandProgressWith, inRunOf, bandSignatureOf, bandViewOf } from '../lib/band'
import type { BandView } from '../lib/band'
import { getAgents, getCleared, getLive, getRepos, getWorkflows } from '../state/atoms'
import { boardOf, isPaneOpen } from './sources'

type Actions = Parameters<typeof bandViewOf>[5]

export async function bandData($: EngineInterface, columns: number, act: Actions) {
  const { board: current } = await boardOf($)
  const agents = inRunOf(current, agentCountsOf(await getAgents($), await getWorkflows($), await $.clock.now(), await getCleared($)))
  const live = await getLive($)
  const progress = bandProgressWith(current, live, agents)
  if (!progress) return undefined
  return bandViewOf(columns, current, progress, await isPaneOpen($), agents, act, live, await getRepos($))
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
