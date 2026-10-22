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
  isPaneOpen,
  openAsking,
  openPane,
  openSession,
  openSummary,
  publishBoard,
  refreshAll,
  refreshBoard,
  refreshFile,
  refreshReports,
  refreshShared,
  startSources,
  whoAmI,
} from './data/sources'
import { addFault, clearFaults, clearPresses, hasFaults, nextRetryMs, runPress } from './data/presses'
import { recordTurnEnd, recorder, startRecorder } from './data/recorder'
import { bandAction, bandProgress, bandViewOf } from './lib/band'
import { boardFromJson } from './lib/board'
import { AIM_MS, BOARD_SCHEMA, LANDING_MS, BOARD_TOOL, FILE_MS, INFO, LIVE_MS, OPENED, PANE, SCROLL_SCHEMA, SECTIONS, SKILL } from './lib/constants'
import { messageOf } from './lib/format'
import { scrollMessage, scrollRowOf } from './lib/sections'
import { paneViewOf, pinOf, sectionsOf } from './lib/view'
import { getLive, saveBoard } from './state/atoms'

let columns = 0
let pending: { row: number; at: number } | undefined
let shown = { offset: 0, renders: 0 }
let isResyncing = false
let aimedRow: number | undefined

function lastShown() {
  return shown
}

async function scrollToRow($: EngineInterface, row: number) {
  pending = { row, at: await $.clock.now() }
  await $.ui.scroll({ in: PANE, to: 'start', block: 'start' }).catch(() => undefined)
}

export const register: Register = on => {
  recorder(on)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    startSources(String((await $.env.get('HOME')) ?? ''))
    await startRecorder($)
    await $.tool.register({
      name: 'open',
      description: 'Opens the master session pane beside the chat. Use it when the user asks to see the sessions board or the status pane.',
      inputSchema: { type: 'object', properties: {} },
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
    void whoAmI($)
      .catch(() => undefined)
      .then(() => refreshBoard($))
      .then(() => refreshShared($))
      .then(() => refreshAll($))
      .catch(() => undefined)
    $.clock.every(FILE_MS, () => void refreshFile($).then(() => refreshShared($)).then(() => refreshReports($)).catch(() => undefined))
    $.clock.every(LIVE_MS, () => void refreshAll($).catch(() => undefined))
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await recordTurnEnd($, e)
    void refreshBoard($).catch(() => undefined)
    return done
  })

  on('command.run', { command: INFO }, async ($, e) => {
    if (e.args.trim() === 'ask') return { text: await askAll($) }
    await openPane($)
    return { text: OPENED }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: SKILL }, async ($, e, next) => {
    if (e.args.trim() === 'status') {
      await openPane($)
      return { text: OPENED }
    }
    await openPane($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('skill.prompt', { skill: SKILL }, async ($, e, next) => {
    const note = `\n\nStatus pane: on. Publish every board with the ${BOARD_TOOL} tool (load it with ToolSearch select:${BOARD_TOOL}) as section 3 describes. In chat, post only 🔴 needs-you lines and the final summary.`
    return next({ ...e, text: e.text + note })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__master-session__open' }, async $ => {
    const isPlaced = await openPane($)
    return {
      result: isPlaced
        ? 'The master session pane is open beside the chat.'
        : 'The pane is open, but no attached surface draws it: post the board in chat.',
    }
  }).catch(() => ({ deny: 'The master session pane could not be opened: post the board in chat.' }))

  on('tool.call', { tool: 'mcp__master-session__board' }, async ($, e) => {
    const next = boardFromJson(e, 'tool')
    if (!next) return { deny: 'The board needs a sessions array whose items carry id and state.' }
    const at = await $.clock.now()
    await saveBoard($, prev => ({ ...next, since: prev?.since ?? at, at }))
    await publishBoard($, next, at).catch(() => undefined)
    void refreshAll($, true).catch(() => undefined)
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
    if (addFault(e.element)) $.clock.after(nextRetryMs(), () => (clearFaults(), $.ui.invalidate('ui.render')))
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
    await (action === 'board' ? openPane($) : action === 'summary' ? openSummary($) : openAsking($))
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, event, next) => {
    const { board: current, from } = await boardOf($)
    const progress = bandProgress(current, await getLive($))
    if (event.props.hasSurvey || !current || !progress) return next(event)
    const table = $.ui.resolve(event)
    const bandColumns = event.props.bodyColumns || 100
    const isOpen = await isPaneOpen($)
    const { Box, Button, Text } = table
    const Svg = event.surface !== 'terminal' && 'Svg' in table ? guardSvg(table.Svg, Text) : undefined
    const Client = event.surface === 'desktop' && 'Client' in table && !hasFaults() ? table.Client : undefined
    const view = bandViewOf(bandColumns, current, progress, from, isOpen, {
      board: () => void openPane($),
      summary: () => void openSummary($),
      chat: (id, name) => void openSession($, id, name),
    })
    return Svg ? Band({ Box, Text, Button, Svg, Client }, { view, progress }) : TextBand({ Box, Text, Button }, { view, progress, columns: bandColumns })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
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
