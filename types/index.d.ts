export type SessionState = 'needs-you' | 'waiting' | 'working' | 'done'

export type Filter = 'all' | SessionState | 'archived'

export type ArchiveView = 'closed' | 'open' | 'all'

export type Role = { role: 'worker' | 'master' | ''; self: string; parent: string }

export type Asked = { at: number; count: number }

export type Undone = { ids: string[]; name: string; skipped: number; group: SessionState; index: number; at: number; hid?: { agents: number; runs: number; before: number } }

export type BoardSession = {
  id: string
  name: string
  title?: string
  persona?: string
  state: SessionState
  now?: string
  next?: string
  progress?: string
  time?: string
  done?: string
  verified?: string
  git?: string
  location?: string
  worktrees?: string[]
  risk?: string
  needsYou?: string
  sha?: string
  activity?: string[]
  commits?: string[]
  tests?: string[]
  files?: string[]
  reportAt?: number
  cwd?: string
}

export type Board = {
  tick?: string
  sessions: BoardSession[]
  needsYou: string[]
  repos: string[]
  testsPassed?: number
  testsNote?: string
  source: 'tool' | 'file' | 'chat'
  since?: number
  at?: number
}

export type LiveSession = {
  id: string
  name: string
  title: string
  cwd: string
  isRunning: boolean
  isArchived: boolean
  lastActivityAt: number
  startedBy?: string
  createdAt?: number
  model?: string
  effort?: string
  permissionMode?: string
}

export type Live = {
  self: string
  title: string
  sessions: LiveSession[]
  family?: LiveSession[]
  error: string
  at: number
}

export type Shared = {
  at: number
  masterId: string
  board: Board
}

export type Worktree = {
  path: string
  branch: string
  sha: string
  isMain: boolean
  dirty: number
  paths: string[]
  upstream: string
  ahead: number
  behind: number
  unmerged?: number
}

export type Repo = {
  path: string
  name: string
  localOnly: number
  base?: string
  onBase?: string[]
  landed?: number
  worktrees: Worktree[]
}

export type EndReason = 'answer' | 'aborted' | 'refusal' | 'error'

export type Step = { step: number; of: number; label: string }

export type Report = {
  v: 1
  kind: 'status'
  session: string
  engineId: string
  parent: string
  seq: number
  at: number
  run: { isRunning: boolean; since?: number; lastEnd?: { at: number; reason: EndReason } }
  modelAt: number
  state: SessionState
  persona?: string
  progress?: Step
  now?: string
  next?: string
  needsYou?: string
  risk?: string
  activity: { at: number; text: string }[]
  commits: { sha: string; subject: string; at: number }[]
  tests: { cmd: string; ok: boolean; summary?: string; at: number }[]
  files: string[]
  waits?: { since: number; on: string }
  git?: { branch: string; dirty: number; ahead: number; at: number; path?: string }
  agents?: ReportAgent[]
  runs?: ReportRun[]
}

export type AgentState = 'running' | 'done' | 'failed'

export type AgentAsk = { text: string; since: number }

export type AgentRecord = {
  id: string
  name?: string
  type: string
  description: string
  model?: string
  requestedModel?: string
  parentModel?: string
  prompt?: string
  isBackground?: boolean
  isFork?: boolean
  spawnedBy?: string
  run?: { id: string; index: number }
  state: AgentState
  startedAt: number
  endedAt?: number
  result?: string
  tokens?: number
  asking?: AgentAsk
  parentAgentId?: string
  parentSessionId?: string
}

export type ReportAgent = Pick<AgentRecord, 'id' | 'type' | 'description' | 'state' | 'startedAt' | 'name' | 'endedAt' | 'asking' | 'parentAgentId'> & { runId?: string; runIndex?: number }

export type WorkflowRecord = {
  id: string
  toolUseId: string
  taskId?: string
  name?: string
  description?: string
  phases?: string[]
  startedAt: number
  parentSessionId?: string
}

export type ReportRun = Pick<WorkflowRecord, 'id' | 'name' | 'phases' | 'startedAt'>

declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__master-session__scroll': { to: string }
    'mcp__master-session__open': {}
    'mcp__master-session__reports': {}
    'mcp__master-session__board': Pick<Board, 'tick' | 'testsPassed' | 'testsNote'> & { sessions: BoardSession[]; needsYou?: string[]; repos?: string[] }
    'mcp__master-session__report': {
      state?: SessionState
      progress?: string
      now?: string
      next?: string
      needsYou?: string
      risk?: string
      activity?: string[]
      commits?: string[]
      tests?: string[]
      files?: string[]
    }
  }

  interface PluginState {
    'master-session': {
      board: Board | null
      live: Live
      repos: Repo[]
      expanded: string
      confirming: string
      filter: Filter
      archiveView: ArchiveView
      asked: Asked | null
      undone: Undone | null
      cleared: number
      isClearing: boolean
      isRefreshing: boolean
      reports: Report[]
      agents: AgentRecord[]
      workflows: WorkflowRecord[]
      role: Role
      isPlan: boolean
    }
  }
}
