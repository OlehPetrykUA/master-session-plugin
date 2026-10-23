import { expect, test } from 'claude-code/testing'

import { REPORT_CAP, freshReport } from './contract'
import type { Report } from './contract'
import { askForUpdates, boardPath, bytesOf, parentFromBoards, readBoard, readReports, reportJson, reportPath, stateDir, writeBoard, writeReport } from './status'

const MASTER = 'local_master'
const MIN = 60_000

type File = { text: string; mtimeMs: number; size?: number }

type Io = Parameters<typeof writeReport>[0]

type Sender = Parameters<typeof askForUpdates>[0]

function disk(files: Record<string, File> = {}) {
  const reads: string[] = []
  const statOf = (file: File) => ({ kind: 'file' as const, size: file.size ?? bytesOf(file.text), mtimeMs: file.mtimeMs, isLink: false })
  const fs = {
    write: async (path: string, text: string) => {
      files[path] = { text, mtimeMs: (files[path]?.mtimeMs ?? 0) + 1 }
    },
    read: async (path: string) => {
      reads.push(path)
      const file = files[path]
      if (!file) throw new Error(`ENOENT ${path}`)
      return file.text
    },
    list: async (dir: string) =>
      Object.entries(files)
        .filter(([path]) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/'))
        .map(([path, file]) => ({ ...statOf(file), name: path.slice(dir.length + 1) })),
    stat: async (path: string) => {
      const file = files[path]
      if (!file) throw new Error(`ENOENT ${path}`)
      return statOf(file)
    },
  }
  return { $: { fs } as unknown as Io, files, reads }
}

const report = (session: string, patch: Partial<Report> = {}): Report => ({ ...freshReport(session, MASTER, `engine-${session}`, 0), seq: 1, at: 90 * MIN, ...patch })

const file = (value: unknown, mtimeMs: number): File => ({ text: JSON.stringify(value), mtimeMs })

test('a report is written to sessions/<id>.json and trimmed oldest-first under the 16 KB cap', async () => {
  const home = '/home/write'
  const { $, files } = disk()
  const long = 'é'.repeat(290)
  const big = report('local_a', {
    activity: Array.from({ length: 20 }, (_, index) => ({ at: index, text: `${index} ${long}` })),
    tests: Array.from({ length: 20 }, (_, index) => ({ cmd: `${index} ${long}`, ok: true, summary: long, at: index })),
    commits: Array.from({ length: 20 }, (_, index) => ({ sha: `sha${index}`, subject: long, at: index })),
    files: Array.from({ length: 60 }, (_, index) => `/repo/file-${index}.ts`),
  })
  await writeReport($, home, big)
  const written = files[reportPath(home, 'local_a')]?.text ?? ''
  expect(bytesOf(written)).toBeLessThanOrEqual(REPORT_CAP)
  const kept = JSON.parse(written) as Report
  expect(kept.activity.at(-1)?.text.startsWith('19 ')).toBe(true)
  expect(kept.files.at(-1)).toBe('/repo/file-59.ts')
  expect(kept.files.length).toBeLessThanOrEqual(50)
  expect(reportJson(report('local_b'))).toBe(JSON.stringify(report('local_b')))
})

test('the reader reads a report only when its mtime changes, skips oversize files and keeps the last good value', async () => {
  const home = '/home/read'
  const dir = `${stateDir(home)}/sessions`
  const { $, files, reads } = disk({
    [`${dir}/local_a.json`]: file(report('local_a', { now: 'a1' }), 1),
    [`${dir}/local_b.json`]: file(report('local_b', { now: 'b1' }), 1),
    [`${dir}/notes.txt`]: { text: 'x', mtimeMs: 1 },
  })
  const nowOf = async () => Object.fromEntries((await readReports($, home)).map(one => [one.session, one.now]))
  expect(await nowOf()).toEqual({ local_a: 'a1', local_b: 'b1' })
  expect(reads.length).toBe(2)
  expect(await nowOf()).toEqual({ local_a: 'a1', local_b: 'b1' })
  expect(reads.length).toBe(2)
  files[`${dir}/local_a.json`] = file(report('local_a', { seq: 2, now: 'a2' }), 2)
  files[`${dir}/local_b.json`] = { text: '{"v":1,"kind":"sta', mtimeMs: 2 }
  expect(await nowOf()).toEqual({ local_a: 'a2', local_b: 'b1' })
  expect(reads.length).toBe(4)
  expect(await nowOf()).toEqual({ local_a: 'a2', local_b: 'b1' })
  expect(reads.length).toBe(5)
  files[`${dir}/local_a.json`] = file(report('local_a', { seq: 1, now: 'replayed' }), 3)
  files[`${dir}/local_b.json`] = { ...file(report('local_b', { seq: 9, now: 'huge' }), 3), size: REPORT_CAP + 1 }
  expect(await nowOf()).toEqual({ local_a: 'a2', local_b: 'b1' })
  expect(reads.length).toBe(6)
  delete files[`${dir}/local_b.json`]
  expect(await nowOf()).toEqual({ local_a: 'a2' })
  expect(await readReports(disk().$, '/home/empty')).toEqual([])
})

test('the board file round-trips for child chats, is re-read on change only and ignored after 30 min', async () => {
  const home = '/home/board'
  const { $, files, reads } = disk()
  const board = { sessions: [{ id: 'local_a', name: 'alpha', state: 'working' as const }], needsYou: [], repos: ['~/dotfiles'], source: 'tool' as const, since: 5 }
  await writeBoard($, home, { at: 60 * MIN, masterId: MASTER, board })
  expect(await readBoard($, home, MASTER, 70 * MIN)).toEqual({
    at: 60 * MIN,
    masterId: MASTER,
    board: expect.objectContaining({ sessions: [expect.objectContaining({ id: 'local_a', state: 'working' })], repos: ['~/dotfiles'] }),
  })
  expect(JSON.parse(files[boardPath(home, MASTER)]?.text ?? '{}').board.source).toBeUndefined()
  expect(reads).toEqual([boardPath(home, MASTER)])
  expect((await readBoard($, home, MASTER, 80 * MIN))?.masterId).toBe(MASTER)
  expect(reads.length).toBe(1)
  files[boardPath(home, MASTER)] = { text: '{broken', mtimeMs: 9 }
  expect((await readBoard($, home, MASTER, 80 * MIN))?.masterId).toBe(MASTER)
  expect(await readBoard($, home, MASTER, 91 * MIN)).toBeUndefined()
  expect(await readBoard($, home, 'local_missing', 70 * MIN)).toBeUndefined()
})

test('a worker without a known parent finds it in the newest board that lists it', async () => {
  const home = '/home/parent'
  const { $ } = disk({
    [boardPath(home, 'local_old')]: file({ v: 1, kind: 'board', at: 1, masterId: 'local_old', masterTitle: '', board: { sessions: [{ id: 'local_me', state: 'done' }] } }, 1),
    [boardPath(home, MASTER)]: file({ v: 1, kind: 'board', at: 2, masterId: MASTER, masterTitle: '', board: { sessions: [{ id: 'local_me', state: 'working' }] } }, 2),
    [boardPath(home, 'local_me')]: file({ v: 1, kind: 'board', at: 3, masterId: 'local_me', masterTitle: '', board: { sessions: [{ id: 'local_me', state: 'working' }] } }, 3),
  })
  expect(await parentFromBoards($, home, 'local_me')).toBe(MASTER)
  expect(await parentFromBoards($, home, 'local_nobody')).toBe('')
})

test('Ask for updates goes to the worker’s engine id first, then falls back to send_message', async () => {
  const sent: { to: unknown; text: string }[] = []
  const messaged: unknown[] = []
  const $ = {
    session: {
      send: async (args: { to: { sessionId: string }; text: string }) => {
        sent.push(args)
        return args.to.sessionId === 'engine-a' ? { isDelivered: true } : { isDelivered: false, reason: 'not running' }
      },
    },
    mcp: {
      call: async (server: string, tool: string, args: Record<string, unknown>) => {
        messaged.push([server, tool, args.session_id])
        return { content: [{ type: 'text', text: 'delivered' }], isError: args.session_id === 'local_c' }
      },
    },
  } as unknown as Sender
  const targets = [
    { id: 'local_a', engineId: 'engine-a' },
    { id: 'local_b', engineId: '' },
    { id: 'local_c', engineId: 'engine-c' },
  ]
  expect(await askForUpdates($, targets, MASTER, 100 * MIN)).toEqual([
    { id: 'local_a', via: 'mod' },
    { id: 'local_b', via: 'message' },
    { id: 'local_c', via: 'failed' },
  ])
  expect(sent.map(one => one.to)).toEqual([{ sessionId: 'engine-a' }, { sessionId: 'engine-c' }])
  expect(sent[0]?.text).toContain('[master-session:ask] {"v":1,"kind":"ask","from":"local_master"')
  expect(messaged).toEqual([
    ['ccd_session_mgmt', 'send_message', 'local_b'],
    ['ccd_session_mgmt', 'send_message', 'local_c'],
  ])
})

test('an oversize report drops its lowest-priority agents first, so the asking one stays', async () => {
  const home = '/home/agents'
  const { $, files } = disk()
  const long = 'é'.repeat(500)
  const agents = Array.from({ length: 20 }, (_, index) => ({ id: `a${index}`, type: 'Explore', description: long, state: 'running' as const, startedAt: index, ...(index ? {} : { asking: { text: long, since: 1 } }) }))
  await writeReport($, home, report('local_a', { agents }))
  const written = files[reportPath(home, 'local_a')]?.text ?? ''
  expect(bytesOf(written)).toBeLessThanOrEqual(REPORT_CAP)
  const kept = (JSON.parse(written) as Report).agents ?? []
  expect([kept.length < 20, kept[0]?.id, kept[0]?.asking?.since]).toEqual([true, 'a0', 1])
})
