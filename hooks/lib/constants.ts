export const PANE = 'master-session'
export const TITLE = 'Master session'
export const SKILL = 'master-session:start'
export const INFO = 'master-session:info'
export const BOARD_TOOL = 'mcp__master-session__board'
export const FILE_MS = 3_000
export const LIVE_MS = 15_000
export const AIM_MS = 2_000
export const LANDING_MS = 1_000
export const AGENT_SHOWN_MS = 120_000
export const FAULT_RETRY_MS = 5_000
export const FAULT_RETRY_MAX_MS = 60_000
export const OPENED = 'Master session pane opened.'
export const SECTIONS = ['section-header', 'section-summary', 'section-chips', 'section-list', 'section-expanded', 'section-archived'] as const

const LIST = { type: 'array', items: { type: 'string' } }

export const BOARD_SCHEMA = {
  type: 'object',
  properties: {
    tick: { type: 'string', description: 'HH:MM of this tick' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'local_… session id' },
          name: { type: 'string' },
          title: { type: 'string' },
          state: { type: 'string', enum: ['needs-you', 'waiting', 'working', 'done'] },
          progress: { type: 'string', description: 'step N of M — step name' },
          now: { type: 'string' },
          next: { type: 'string' },
          time: { type: 'string' },
          done: { type: 'string' },
          verified: { type: 'string' },
          git: { type: 'string' },
          location: { type: 'string' },
          worktrees: { ...LIST, description: 'worktree paths the worker created besides its cwd' },
          risk: { type: 'string' },
          needsYou: { type: 'string', description: 'the blocker the user must act on' },
          sha: { type: 'string' },
          activity: { ...LIST, description: 'latest events first, e.g. "committed db8ea4d · 2m"' },
          commits: { ...LIST, description: '"<sha> <subject>", newest first' },
          tests: { ...LIST, description: 'checks that passed, e.g. "test_hooks 128"' },
          files: { ...LIST, description: 'files or folders the worker owns' },
        },
        required: ['id', 'state'],
      },
    },
    needsYou: LIST,
    repos: { ...LIST, description: 'repo paths the run touches' },
    testsPassed: { type: 'number', description: 'tests passed in the whole run' },
    testsNote: { type: 'string', description: 'e.g. "smoke 398 · hooks 128"' },
  },
  required: ['sessions'],
}

export const SCROLL_SCHEMA = {
  type: 'object',
  properties: {
    to: { type: 'string', description: `"start", "end" or a section key: ${SECTIONS.join(', ')}` },
  },
  required: ['to'],
}
