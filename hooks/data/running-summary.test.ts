import { expect, test } from 'claude-code/testing'

import type { Live, Report } from '../../types'

import { freshReport, parseReport } from './contract'
import { isShown, isSlow, runningViewOf, textOf } from './running'

const HOME = '/home/me'

test('AC3: a WebFetch shows its host only, Grep and Glob show nothing, an MCP tool shows nothing', () => {
  expect(textOf('WebFetch', { url: 'https://me:pw@api.x.dev:8443/v1?token=t' }, HOME)).toBe('api.x.dev')
  expect(textOf('WebFetch', { url: 'not a url' }, HOME)).toBeUndefined()
  expect(textOf('Grep', { pattern: 'TODO' }, HOME)).toBeUndefined()
  expect(textOf('Glob', { pattern: '*.ts' }, HOME)).toBeUndefined()
  expect(textOf('mcp__a__b', { query: 'q' }, HOME)).toBeUndefined()
})

test('AC3: a WebFetch host is cut at 160 code points plus "…"', () => {
  const host = textOf('WebFetch', { url: `https://${'a'.repeat(300)}.com/x` }, HOME) ?? ''
  expect(Array.from(host).length).toBe(161)
  expect(host.endsWith('…')).toBe(true)
})

test('AC3: a WebFetch host ignores credentials, a backslash before @ counts as a slash, and a Read shows its tilde path', () => {
  expect(textOf('WebFetch', { url: 'https://api.x.dev\\@Xk9wq2Lm' }, HOME)).toBe('api.x.dev')
  expect(textOf('WebFetch', { url: 'https://me:pw@api.x.dev/a' }, HOME)).toBe('api.x.dev')
  expect(textOf('WebFetch', { url: 'javascript://X' }, HOME)).toBeUndefined()
  expect(textOf('NotebookEdit', { notebook_path: '/home/me/a.ipynb', file_path: '/x' }, HOME)).toBe('~/a.ipynb')
  expect(textOf('__proto__', { command: 'x' }, HOME)).toBeUndefined()
  expect(textOf('toString', { command: 'x' }, HOME)).toBeUndefined()
  expect(textOf('Read', { file_path: '/home/me/Work/x.ts' }, HOME)).toBe('~/Work/x.ts')
  expect(textOf('WebSearch', { query: 'bun docs api_key=k37' }, HOME)).toBeUndefined()
})

test('AC22: a Read path is cut on whole code points at 160 plus "…"', () => {
  const path = `/home/me/${'a'.repeat(150)}😀${'b'.repeat(20)}`
  expect(textOf('Read', { file_path: path }, HOME)).toBe(`~/${'a'.repeat(150)}😀${'b'.repeat(7)}…`)
})

test('AC22: an MCP tool, Grep, Glob, WebSearch, TodoWrite and BashOutput carry a name and no text; Agent, Workflow, AskUserQuestion and the mod’s tools are not shown', () => {
  for (const tool of ['mcp__context7-local__query-docs', 'TodoWrite', 'Bash', 'BashOutput', 'Grep', 'Glob', 'WebSearch']) expect(textOf(tool, { query: 'q-secret', pattern: 'p-secret', command: 'x' }, HOME)).toBeUndefined()
  for (const tool of ['Agent', 'Workflow', 'AskUserQuestion', 'mcp__master-session__open', 'mcp__master-session__report']) expect(isShown(tool)).toBe(false)
  expect(isShown('mcp__context7-local__query-docs')).toBe(true)
  expect(isShown('Read')).toBe(true)
})

test('AC32: only Bash, BashOutput, WebFetch, WebSearch and mcp__ tools are on a worker’s allow-list', () => {
  for (const tool of ['Bash', 'BashOutput', 'WebFetch', 'WebSearch', 'mcp__x__y']) expect(isSlow(tool)).toBe(true)
  for (const tool of ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'TodoWrite', 'NotebookEdit', 'Agent']) expect(isSlow(tool)).toBe(false)
})

const live = (isRunning: boolean): Live => ({ self: 'm', title: '', error: '', at: 1, sessions: [{ id: 's', name: 's', title: '', cwd: '/', isRunning, isArchived: false, lastActivityAt: 0 }] })

const report = (patch: Partial<Report>): Report => ({ ...freshReport('s', 'm', 'e', 0), run: { isRunning: true }, ...patch })

test('AC19: a report’s command shows only while the live list runs the session and the report says it runs', () => {
  const running = { tool: 'Bash', text: 'ls', since: 5 }
  const agents = [{ id: 'b1', type: 't', description: 'd', state: 'running' as const, startedAt: 1, running }, { id: 'b2', type: 't', description: 'd', state: 'done' as const, startedAt: 1, running }]
  expect(runningViewOf([report({ running, agents })], live(true))).toEqual({ s: running, b1: running })
  expect(runningViewOf([report({ running, agents })], live(false))).toEqual({})
  expect(runningViewOf([report({ running, agents, run: { isRunning: false } })], live(true))).toEqual({})
})

test('AC14: a stored running value is read back with its tool, text and since only, the text cut on whole code points', () => {
  const raw = { ...freshReport('s', 'm', 'e', 0), seq: 1, running: { tool: 'Bash', text: 'x'.repeat(500), since: 7, extra: 1 } }
  expect(parseReport(raw)?.running).toEqual({ tool: 'Bash', since: 7 })
  expect(parseReport({ ...raw, running: { tool: 'WebFetch', text: `${'😀'.repeat(200)}`, since: 7 } })?.running?.text).toBe(`${'😀'.repeat(160)}…`)
  expect(parseReport({ ...raw, running: { tool: 'mcp__a__b', since: 7 } })?.running).toEqual({ tool: 'mcp__a__b', since: 7 })
  expect(parseReport({ ...raw, running: { tool: 'Bash' } })?.running).toBeUndefined()
  expect(parseReport({ ...raw, running: 'Bash' })?.running).toBeUndefined()
})
