import type { EngineInterface } from 'claude-code'

import { agentCountsOf, bandItemsOf } from '../lib/band'
import { displayNameOf, nameText } from '../lib/list'
import { PANE } from '../lib/constants'
import { getAgents, getLive, getRepos, getWorkflows, saveBoard } from '../state/atoms'
import { detected, halt, roleOf } from './recorder'
import { boardOf, homeOf, isMaster, isPaneOpen, isWorker } from './sources'
import { boardPath, reportPath, writeTombstone } from './status'

const NOTHING = 'This session is not a master session: nothing to stop.'
const STOPPED = 'Stopped: this session is no longer a master session. The band and pane are off; workers, branches and worktrees are untouched. Run /master-session:start to make it a master again.'
const LOOP =
  '(to the model, hidden) The user ran /master-session:stop: this session is no longer a master session. Stop its heartbeat now (ScheduleWakeup with stop: true, or delete its /loop job), run no more master-session ticks and do not call mcp__master-session__board. Do not stop, message or archive any worker.'
const QUIET =
  "(to the model, hidden) The user ran /master-session:stop: this session no longer reports to a master session. Do not call mcp__master-session__report; carry on with the user's requests."

async function runningNames($: EngineInterface) {
  const { board } = await boardOf($)
  const items = bandItemsOf(board, agentCountsOf(await getAgents($), await getWorkflows($), await $.clock.now()), await getLive($), await getRepos($))
  return items.flatMap(item => (item.group !== 'working' ? [] : [nameText(displayNameOf(item))]))
}

export async function stopMode($: EngineInterface, isForced: boolean) {
  await detected()
  const isOwner = await isMaster($)
  if (!isOwner && !(await isWorker($))) return { text: NOTHING }
  const names = isOwner ? await runningNames($) : []
  if (names.length && !isForced) return { text: `${names.length} still running: ${names.join(', ')}. Stopping leaves them running, with nothing watching them. Run /master-session:stop force to stop anyway.` }
  const { parent, self: known } = roleOf()
  const self = (await getLive($)).self || known
  await halt($)
  await saveBoard($, () => null)
  const isRetired = !self || (await writeTombstone($, isOwner ? boardPath(homeOf(), self) : reportPath(homeOf(), self), self, await $.clock.now()).then(() => true, () => false))
  const failed = isRetired ? '' : ` The ${isOwner ? 'board' : 'report'} file could not be retired; ${isOwner ? 'workers started now may still report here' : "the master may still read this session's last report"}.`
  if (await isPaneOpen($)) await $.ui.close({ id: PANE }).catch(() => undefined)
  $.ui.invalidate('ui.render')
  return isOwner ? { text: STOPPED + failed, context: [LOOP] } : { text: `Stopped: this session no longer reports to master session ${parent}. A new worker brief makes it report again.${failed}`, context: [QUIET] }
}
