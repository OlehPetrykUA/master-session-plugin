import type { EngineInterface } from 'claude-code'

import type { Board } from '../../types'
import { cleanNarrativeOf } from '../lib/board'
import { NARRATIVE_CAP } from '../lib/constants'
import { getAgents, getNarrativeNote, getWorkflows, setNarrativeNote } from '../state/atoms'
import { isActive, isOff } from './recorder'
import { boardOf, isPaneOpen } from './sources'

export const NARRATIVE_REFRESH_MS = 60_000

const ROWS = 30
const FIELD = 200

const RULES = `You write the status line a user reads at the top of a pane of coding sessions. Reply with 2 to 4 plain sentences, at most ${NARRATIVE_CAP} characters: what is happening now, what comes next, and what needs the user, ending with "Nothing needs you." when nothing does. Use worker names, never ids. No markdown, lists, links or emoji. Reply with the sentences only.`

let isFlying = false

const cut = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, FIELD)

async function factsOf($: EngineInterface, board: Board) {
  const agents = await getAgents($)
  const workflows = await getWorkflows($)
  const rows = board.sessions.slice(0, ROWS).map(one => ({
    name: cut(one.name),
    persona: cut(one.persona),
    state: one.state,
    progress: cut(one.progress),
    now: cut(one.now),
    next: cut(one.next),
    needsYou: cut(one.needsYou),
    done: cut(one.done),
    verified: cut(one.verified),
    sha: cut(one.sha),
  }))
  const live = {
    agents: agents.slice(-ROWS).map(one => ({ type: cut(one.type), description: cut(one.description), state: one.state })),
    workflows: workflows.slice(-ROWS).map(one => ({ name: cut(one.name), phases: one.phases?.length ?? 0 })),
  }
  return { rows, live, agents, workflows }
}

const signOf = (facts: Awaited<ReturnType<typeof factsOf>>) =>
  JSON.stringify([facts.rows.map(one => [one.name, one.state, one.needsYou, one.sha, one.verified, one.done]), facts.agents.map(one => [one.id, one.state]), facts.workflows.map(one => one.id)])

const promptOf = (last: string, facts: Awaited<ReturnType<typeof factsOf>>) =>
  `Last narrative: ${last}\n\nSessions (JSON): ${JSON.stringify(facts.rows)}\n\nLive agents and workflows (JSON): ${JSON.stringify(facts.live)}\n\nWrite the new narrative.`

export async function refreshNarrative($: EngineInterface) {
  if (isFlying || isOff() || !isActive() || !(await isPaneOpen($))) return
  const { board } = await boardOf($)
  if (!board?.narrative || board.at === undefined) return
  const facts = await factsOf($, board)
  const sign = signOf(facts)
  const note = await getNarrativeNote($)
  if (note.boardAt !== board.at) {
    await setNarrativeNote($, () => ({ text: '', at: 0, boardAt: board.at as number, sign, calledAt: note.calledAt }))
    return
  }
  const at = await $.clock.now()
  if (sign === note.sign || at - note.calledAt < NARRATIVE_REFRESH_MS) return
  isFlying = true
  try {
    await setNarrativeNote($, value => ({ ...value, calledAt: at }))
    const reply = await $.model.complete({ model: 'haiku', effort: 'low', maxTokens: 220, timeoutMs: 20_000, system: RULES, prompt: promptOf(note.text || board.narrative, facts) })
    const text = reply.isAnswered ? cleanNarrativeOf(reply.text) : undefined
    if (!text) return
    const written = await $.clock.now()
    await setNarrativeNote($, value => ({ ...value, text, sign, at: written }))
  } finally {
    isFlying = false
  }
}
