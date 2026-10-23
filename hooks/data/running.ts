import type { ToolCallInput } from 'claude-code'

import type { Live, Report, Running } from '../../types'

import { tildeOf } from '../lib/list'

export const MAIN = ''

const TEXT_MAX = 160

const READ_MAX = 2_000

const DETAIL = new Map([['Read', 'file_path'], ['Edit', 'file_path'], ['Write', 'file_path'], ['NotebookEdit', 'notebook_path'], ['WebFetch', 'url']])

const HIDDEN = new Set(['Agent', 'Workflow', 'AskUserQuestion'])

const SLOW = new Set(['Bash', 'BashOutput', 'WebFetch', 'WebSearch'])

export const isShown = (tool: string) => !HIDDEN.has(tool) && !tool.startsWith('mcp__master-session__')

export const isSlow = (tool: string) => SLOW.has(tool) || tool.startsWith('mcp__')

export const capOf = (text: string) => {
  const chars = Array.from(text)
  return chars.length > TEXT_MAX ? `${chars.slice(0, TEXT_MAX).join('')}…` : text
}

export const hostOf = (url: string) => {
  const host = /^https?:\/\/(?:[^/?#@]*@)?([A-Za-z0-9.-]+)(?::\d+)?(?:[/?#]|$)/i.exec(url.replace(/\\/g, '/'))?.[1]
  return host && capOf(host)
}

export function textOf(tool: string, input: unknown, home: string) {
  const key = DETAIL.get(tool)
  const value = typeof input === 'object' && input && key ? (input as Record<string, unknown>)[key] : undefined
  if (typeof value !== 'string') return undefined
  if (tool === 'WebFetch') return hostOf(value)
  const line = tildeOf(value.slice(0, READ_MAX), home).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return line ? capOf(line) : undefined
}

export const runOf = (e: ToolCallInput, home: string, since: number): Running => {
  const text = textOf(String(e.tool), e, home)
  return text === undefined ? { tool: String(e.tool), since } : { tool: String(e.tool), text, since }
}

let calls = new Map<string, { id: string; run: Running }[]>()

export const resetRunning = () => {
  calls = new Map()
}

export const beginCall = (loop: string, id: string, run: Running) => {
  calls.set(loop, [...(calls.get(loop) ?? []).filter(one => one.id !== id), { id, run }])
}

export const endCall = (loop: string, id: string) => {
  const rest = (calls.get(loop) ?? []).filter(one => one.id !== id)
  if (rest.length) calls.set(loop, rest)
  else calls.delete(loop)
}

export const dropLoop = (loop: string) => {
  calls.delete(loop)
}

export const runningOf = (loop: string) => calls.get(loop)?.at(-1)?.run

export function runningViewOf(reports: readonly Report[], live: Live): Record<string, Running> {
  const view: Record<string, Running> = {}
  for (const report of reports) {
    if (!report.run.isRunning || !live.sessions.some(one => one.id === report.session && one.isRunning)) continue
    if (report.running) view[report.session] = report.running
    for (const agent of report.agents ?? []) {
      if (agent.state === 'running' && agent.running) view[agent.id] = agent.running
    }
  }
  for (const loop of calls.keys()) {
    const run = runningOf(loop)
    if (loop !== MAIN && run) view[loop] = run
  }
  return view
}
