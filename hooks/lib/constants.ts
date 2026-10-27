export const PANE = 'master-session'
export const TITLE = 'Master session'
export const SKILL = 'master-session:start'
export const INFO = 'master-session:info'
export const STOP = 'master-session:stop'
export const NOT_MASTER = 'This session is not a master session: run /master-session:start to make it one.'
export const BOARD_TOOL = 'mcp__master-session__board'
export const FILE_MS = 5_000
export const REPOS_CLOSED_MS = 120_000
export const LIVE_MS = 15_000
export const TICK_MS = 1_000
export const LIVE_LIMIT = 50
export const GIT_CAP = 12
export const TREE_STALE_MS = 120_000
export const ARCHIVE_LIMIT = 200
export const AIM_MS = 2_000
export const LANDING_MS = 1_000
export const AGENT_SHOWN_MS = 120_000
export const UNDO_MS = 10_000
export const FAULT_RETRY_MS = 5_000
export const FAULT_RETRY_MAX_MS = 60_000
export const NARRATIVE_STALE_MS = 900_000
export const NARRATIVE_CAP = 500
export const PLAN_NAME_CAP = 80
export const PLAN_STATES = ['queued', 'working', 'verifying', 'done', 'dropped'] as const
export const NARRATIVE_ROWS = 3
export const NARRATIVE_MAX_ROWS = 40
export const OPENED = 'Master session pane opened.'
export const SECTIONS = ['section-header', 'section-narrative', 'section-summary', 'section-processes', 'section-chips', 'section-list', 'section-expanded', 'section-archived'] as const

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
          persona: { type: 'string', description: 'the persona the worker runs as, e.g. Implementer' },
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
    plan: {
      type: 'array',
      description: `every piece of the whole run, queued ones included, written from the ledger on every call; helpers (QA verifier, Code reviewer, Researcher checks) are not pieces. At most ${LIVE_LIMIT} pieces, names unique. The band's percent measures it`,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: `the piece, unique in the plan, at most ${PLAN_NAME_CAP} characters` },
          state: { type: 'string', enum: [...PLAN_STATES] },
          progress: { type: 'string', description: 'step N of M — label, for a working piece' },
        },
        required: ['name', 'state'],
      },
    },
    narrative: {
      type: 'string',
      description:
        'up to four short plain sentences for the user, at most 500 characters, in this order: what the run is for and what it is mostly on now; what is done (count and latest pieces); what comes next, in the plan\'s queued order; what needs them (or "Nothing needs you."). Describe the work, not short worker names or ids; no markdown. Write it fresh on every call; it shows in the pane only',
    },
  },
  required: ['sessions'],
}

export const OPEN_SCHEMA = {
  type: 'object',
  properties: {
    expand: { type: 'string', description: 'An item id (session, subagent, workflow run or workflow agent, archived session) whose card opens expanded' },
    archived: { type: 'boolean', description: 'true opens the Archived list' },
  },
}

export const SCROLL_SCHEMA = {
  type: 'object',
  properties: {
    to: { type: 'string', description: `"start", "end" or a section key: ${SECTIONS.join(', ')}` },
  },
  required: ['to'],
}
