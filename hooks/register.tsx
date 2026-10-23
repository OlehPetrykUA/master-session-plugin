import type { EngineInterface, Register } from 'claude-code'

import { Band } from './components/band/Band'
import { TextBand } from './components/band/TextBand'
import { Pane } from './components/Pane'
import { guardSvg } from './components/guard'
import { TextPane } from './components/TextPane'
import { paneData } from './data/pane'
import {
  askAll,
  boardOf,
  isMaster,
  isPaneOpen,
  openAsking,
  markMaster,
  openPane,
  openSession,
  refreshAll,
  refreshBoard,
  refreshReports,
  workerNote,
  republishBoard,
  startSources,
} from './data/sources'
import { clearPresses, hasFaults, recoverFault, runPress } from './data/presses'
import { recordAgentEnd, recordSpawn, recordWorkflow, refreshAgents } from './data/agents'
import { skipWhileBusy } from './data/flight'
import { briefed, claim, engage, inPlan, isActive, recordTurnEnd, recorder, startRecorder } from './data/recorder'
import { workflowRunsOf } from './lib/agents'
import { agentCountsOf, bandAction, bandProgressWith, bandViewOf } from './lib/band'
import { boardFromJson } from './lib/board'
import { AIM_MS, BOARD_SCHEMA, LANDING_MS, BOARD_TOOL, FILE_MS, INFO, LIVE_MS, OPENED, OPEN_SCHEMA, PANE, SCROLL_SCHEMA, SECTIONS, SKILL, TICK_MS, TICK_SLOW_MS } from './lib/constants'
import { messageOf } from './lib/format'
import { openIdOf } from './lib/list'
import { scrollMessage, scrollRowOf } from './lib/sections'
import { paneViewOf, pinOf, sectionsOf } from './lib/view'
import { getAgents, getLive, getRepos, getWorkflows, saveBoard, setExpanded, setFilter } from './state/atoms'

let columns = 0
let pending: { row: number; at: number } | undefined
let shown = { offset: 0, renders: 0 }
let isResyncing = false
let aimedRow: number | undefined
let lastTick = 0

async function tickTimes($: EngineInterface) {
  if (!isActive() || !(await isMaster($)) || !(await isPaneOpen($))) return
  const now = await $.clock.now()
  const agents = await getAgents($)
  const live = await getLive($)
  const seen = [
    ...agents.filter(one => one.state === 'running'),
    ...workflowRunsOf(agents, await getWorkflows($)).filter(one => one.state === 'running'),
  ].map(one => one.startedAt)
  const sessions = live.sessions.flatMap(one => (one.isRunning && !one.isArchived && one.createdAt !== undefined ? [one.createdAt] : []))
  const isFresh = [...seen, ...sessions, ...(live.at ? [live.at] : [])].some(at => now - at <= TICK_SLOW_MS + TICK_MS)
  if (!isFresh && now - lastTick < TICK_SLOW_MS) return
  lastTick = now
  $.ui.invalidate('ui.render')
}

function lastShown() {
  return shown
}

async function scrollToRow($: EngineInterface, row: number) {
  pending = { row, at: await $.clock.now() }
  if (!(await isPaneOpen($))) return void (pending = undefined)
  await $.ui.scroll({ in: PANE, to: 'start', block: 'start' }).catch(() => undefined)
}

const wake = async ($: EngineInterface) => {
  await engage($)
  await republishBoard($).catch(() => undefined)
  void refreshBoard($, true)
    .then(() => refreshAll($))
    .catch(() => undefined)
}

export const register: Register = on => {
  recorder(on)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    startSources(String((await $.env.get('HOME')) ?? ''))
    lastTick = 0
    await startRecorder($)
    $.clock.every(
      FILE_MS,
      skipWhileBusy(async () => {
        if (isActive() && (await isMaster($))) await refreshReports($)
      }),
    )
    $.clock.every(FILE_MS, skipWhileBusy(async () => (isActive() ? refreshAgents($) : undefined)))
    $.clock.every(TICK_MS, skipWhileBusy(() => tickTimes($)))
    $.clock.every(LIVE_MS, () => void refreshAll($).catch(() => undefined))
    await $.tool.register({
      name: 'open',
      description: 'Opens the master session pane beside the chat. Use it when the user asks to see the sessions board or the status pane. expand opens one item’s card; archived: true opens the Archived list.',
      inputSchema: OPEN_SCHEMA,
    })
    await $.tool.register({
      name: 'board',
      description:
        'Publishes the master-session status board to the sidebar pane and the band above the prompt. Call it on every tick with the whole board; the pane adds live state, location and git itself.',
      inputSchema: BOARD_SCHEMA,
    })
    await $.tool.register({
      name: 'scroll',
      description: `Scrolls the open master session pane to "start", "end" or a section (${SECTIONS.join(', ')}), so each part can be checked without the mouse. Answers with the pane width in columns.`,
      inputSchema: SCROLL_SCHEMA,
    })
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await recordAgentEnd($, e).catch(() => undefined)
    await recordTurnEnd($, e)
    void refreshBoard($).catch(() => undefined)
    return done
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    await recordSpawn($, e, out).catch(() => undefined)
    return out
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const out = await next(e)
    await recordWorkflow($, e, out.result).catch(() => undefined)
    return out
  }).catch(($, e, next) => next(e))

  on('command.run', { command: INFO }, async ($, e) => {
    await wake($)
    const note = await workerNote($)
    if (note) return { text: note }
    if (e.args.trim() === 'ask') return { text: await askAll($) }
    await openPane($)
    return { text: OPENED }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: SKILL }, async ($, e, next) => {
    if (e.args.trim() === 'status') {
      await wake($)
      const note = await workerNote($)
      if (note) return { text: note }
      await markMaster($)
      await openPane($)
      return { text: OPENED }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('skill.prompt', { skill: 'master-session:worker' }, async ($, e, next) => {
    await briefed($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('skill.prompt', { skill: SKILL }, async ($, e, next) => {
    await markMaster($).catch(() => undefined)
    void wake($)
    const note = `\n\nStatus pane: on. Publish every board with the ${BOARD_TOOL} tool (load it with ToolSearch select:${BOARD_TOOL}) as section 3 describes. In chat, post only 🔴 needs-you lines and the final summary.`
    return next({ ...e, text: e.text + note })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__master-session__open' }, async ($, e) => {
    await engage($)
    const note = await workerNote($)
    if (note) return { result: note }
    const expand = typeof e.expand === 'string' ? e.expand.trim() : ''
    const isArchived = e.archived === true
    const data = await paneData($, columns || 48)
    const item = paneViewOf(data).items.find(one => openIdOf(one, [expand]) !== undefined)
    const isOldOne = data.archived.some(one => one.id === expand)
    const card = isArchived ? (isOldOne ? expand : '') : item ? expand : ''
    const isShown = !!expand && !!card
    if (isArchived || isShown) await setFilter($, isArchived ? 'archived' : 'all')
    if (isShown) await setExpanded($, () => [card])
    const isPlaced = await openPane($)
    const top = isShown ? sectionsOf(await paneData($, columns || 48))['section-expanded'] : undefined
    void scrollToRow($, top === undefined ? 0 : scrollRowOf('section-expanded', top, pinOf(data).headerRows))
    const shown = [isArchived ? 'the Archived list' : '', isShown ? `${card} expanded${item && item.id !== card ? ` in ${item.id}` : ''}` : ''].filter(Boolean).join(' with ')
    const missing = expand && !isShown ? ` ${expand} was not found among its items${isOldOne ? '; it is archived, so pass archived: true' : ''}.` : ''
    return {
      result: isPlaced
        ? `The master session pane is open beside the chat${shown ? `, showing ${shown}` : ''}.${missing}`
        : 'The pane is open, but no attached surface draws it: post the board in chat.',
    }
  }).catch(() => ({ deny: 'The master session pane could not be opened: post the board in chat.' }))

  on('tool.call', { tool: 'mcp__master-session__board' }, async ($, e) => {
    const next = boardFromJson(e, 'tool')
    const sent = Array.isArray(e.sessions) ? e.sessions.length : 0
    if (!next || next.sessions.length < sent) return { deny: 'The board needs a sessions array whose items carry id and state.' }
    claim()
    void engage($)
    const at = await $.clock.now()
    await saveBoard($, prev => ({ ...next, since: prev?.since ?? at, at }))
    await republishBoard($).catch(() => undefined)
    void refreshAll($, !inPlan()).catch(() => undefined)
    const surfaces = await $.session.surfaces()
    return {
      result: surfaces.length
        ? `Board updated: ${next.sessions.length} sessions in the pane and the band. Post only 🔴 needs-you lines in chat.`
        : 'Board updated, but no surface is attached to draw it: post the board in chat.',
    }
  }).catch(() => ({ deny: 'The board could not be published: post it in chat.' }))

  on('tool.call', { tool: 'mcp__master-session__scroll' }, async ($, e) => {
    const to = String(e.to ?? '').trim()
    if (to !== 'start' && to !== 'end' && !SECTIONS.some(one => one === to)) return { deny: `Scroll to "start", "end" or one of ${SECTIONS.join(', ')}.` }
    const data = await paneData($, columns || 48)
    const sections = sectionsOf(data)
    const section = SECTIONS.find(one => one === to)
    const found = section === undefined ? undefined : sections[section]
    const row = section === undefined || found === undefined ? undefined : scrollRowOf(section, found, pinOf(data).headerRows)
    if (to !== 'start' && to !== 'end' && row === undefined) return { deny: `Not scrolled: ${to} is not drawn in the pane now. Drawn: ${Object.keys(sections).join(', ')}.` }
    const target = row === undefined ? '' : ` (row ${row})`
    if (!(await isPaneOpen($))) return { deny: `Not scrolled${target}: the pane is hidden; open it first.` }
    pending = row === undefined ? undefined : { row, at: await $.clock.now() }
    const before = lastShown().renders
    try {
      const moved = await $.ui.scroll({ in: PANE, to: to === 'end' ? 'end' : 'start', block: 'start' })
      if (moved.deny) return { result: `Not scrolled${target}: ${moved.deny}` }
      for (let waited = 0; waited < LANDING_MS && lastShown().renders === before; waited += 50) await $.clock.sleep(50)
      return { result: scrollMessage(to, row, lastShown().offset, columns) }
    } catch (error) {
      return { deny: `Not scrolled${target}: ${messageOf(error)}` }
    }
  }).catch(() => ({ deny: 'The master session pane could not be scrolled.' }))

  on('ui.scroll', { component: 'Pane' }, async ($, e, next) => {
    const aim = pending
    if (e.requestId === PANE) aimedRow = undefined
    if (e.requestId !== PANE || e.origin.kind !== 'plugin' || !aim) return next(e)
    pending = undefined
    if ((await $.clock.now()) - aim.at > AIM_MS) return next(e)
    aimedRow = aim.row
    return next({ ...e, offset: aim.row })
  })

  on('ui.message', async ($, e, next) => {
    const press = (e.data as { press?: unknown } | undefined)?.press
    if (!e.element.startsWith('hit-') || typeof press !== 'string') return next(e)
    runPress(e.element)
    return {}
  })

  on('ui.fault', async ($, e, next) => {
    recoverFault($, e.element)
    return next(e)
  })

  on('ui.open', { id: PANE }, async ($, event, next) => {
    const opened = await next(event)
    $.ui.invalidate('ui.render')
    return opened
  })

  on('ui.close', { id: PANE }, async ($, event, next) => {
    const closed = await next(event)
    $.ui.invalidate('ui.render')
    return closed
  })

  on('ui.message', { element: /^band-hit-/ }, async ($, event, next) => {
    const action = bandAction(event.element)
    if (!action || typeof (event.data as { press?: unknown } | undefined)?.press !== 'string') return next(event)
    await (action === 'board' ? openPane($) : openAsking($))
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, event, next) => {
    if (!(await isMaster($))) return next(event)
    const { board: current } = await boardOf($)
    const agents = agentCountsOf(await getAgents($), await getWorkflows($))
    const live = await getLive($)
    const progress = bandProgressWith(current, live, agents)
    if (event.props.hasSurvey || !progress) return next(event)
    const table = $.ui.resolve(event)
    const bandColumns = event.props.bodyColumns || 100
    const isOpen = await isPaneOpen($)
    const { Box, Button, Text } = table
    const Svg = event.surface !== 'terminal' && 'Svg' in table ? guardSvg(table.Svg, Text) : undefined
    const Client = event.surface === 'desktop' && 'Client' in table && !hasFaults() ? table.Client : undefined
    const view = bandViewOf(bandColumns, current, progress, isOpen, agents, {
      board: () => void openPane($),
      chat: (id, name) => void openSession($, id, name),
    }, live, await getRepos($))
    return Svg ? Band({ Box, Text, Button, Svg, Client }, { view }) : TextBand({ Box, Text, Button }, { view, columns: bandColumns })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const note = await workerNote($)
    if (note) return <Text>{note}</Text>
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? guardSvg(table.Svg, Text) : undefined
    const Client = e.surface === 'desktop' && 'Client' in table && !hasFaults() ? table.Client : undefined
    columns = e.props.bodyColumns || 48
    if (e.surface !== 'terminal') shown = { offset: e.props.scroll?.offset ?? 0, renders: shown.renders + 1 }
    const offset = e.surface === 'terminal' ? 0 : (e.props.scroll?.offset ?? 0)
    const data = await paneData($, columns, offset, e.props.scroll?.bodyRows ?? 0, offset === aimedRow)
    const view = paneViewOf(data)
    const pin = pinOf(data, view)
    const isStale = e.surface !== 'terminal' && pin.endRow !== undefined && data.offset > pin.endRow
    const resync = isStale && !isResyncing ? pin.endRow : undefined
    isResyncing = isStale
    if (resync !== undefined) void scrollToRow($, resync)
    clearPresses()
    return Svg ? Pane({ Box, Text, Button, Svg, Client }, data, view, pin) : TextPane({ Box, Text, Button }, data, view)
  })
}
