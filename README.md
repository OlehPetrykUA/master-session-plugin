# Master session

A Claude Code plugin that turns one session into a **validator** for a team of worker sessions. The validator plans the work, briefs a worker session per piece, watches them, answers their questions, verifies every `ready <sha>` in a clean worktree and merges it fast-forward only. You get a live status board instead of a scrolling chat.

## What's inside

| Part | What it does |
|---|---|
| Skill `start` | `/master-session:start`, the validator protocol: roles, briefs, the tick loop, verification, permissions, the ledger. Ships `personas.md` (the persona index) and `board.md` (the chat board when the pane isn't available). |
| Skills `run`, `run-sub`, `workflow` | `/master-session:run`, `/master-session:run-sub` and `/master-session:workflow`: start a worker session, a persona subagent or a workflow of persona agents from the validator. |
| Skill `worker` | The protocol every worker session follows: its own worktree, the report tool, talking to the validator, the `ready <sha>` gate. |
| Status mod | `/master-session:info` opens it: a pane beside the chat with one tile per worker (state, progress, git, tests, commits), a band above the prompt, archive and unarchive, and **Ask for updates**. Workers report through the `mcp__master-session__report` tool; the mod also records their commits, test runs, edits and waits by itself. |
| Personas | Six roles, each a skill plus an agent of the same name: `implementer`, `refactorer`, `reviewer`, `qa-verifier`, `design-checker` and `researcher`. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install master-session --marketplace OlehPetrykUA/master-session-plugin
```

Answer `y` to add the marketplace, then pick a scope (user scope is the first choice).

From a shell:

```bash
claude plugin install master-session --marketplace OlehPetrykUA/master-session-plugin
```

Or in two steps, adding the marketplace once:

```bash
claude plugin marketplace add OlehPetrykUA/master-session-plugin
```

```bash
claude plugin install master-session@master-session
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `OlehPetrykUA/master-session-plugin`, then **Add plugin**. A plugin installed at user scope from a terminal also loads in the desktop app's local sessions.

Update later with `claude plugin update master-session@master-session`.

## Usage

| Command | What it does |
|---|---|
| `/master-session:start [task] [settings]` | Turns the current session into the validator. |
| `/master-session:run <task> [persona]` | Starts a worker session, a side chat, for the task (persona `implementer` by default) and watches it in the loop. |
| `/master-session:run-sub <persona> <task>` | Runs a persona as a background subagent for a short check, then relays its result. |
| `/master-session:workflow <task>` | Writes and runs a workflow for the task with persona agents, announcing the agent count first. |
| `/master-session:info [ask]` | Opens the status pane; `ask` asks every running worker for a fresh report. |

`run`, `run-sub` and `workflow` make the session the validator first if `/master-session:start` hasn't run yet. Settings for `/master-session:start`, in any order:
- `new "<task>"` starts a fresh worker for that task; `worker <name>` attaches an existing session.
- `every 5m` sets the heartbeat (default 2 minutes); `away` finishes everything inside the briefs without waiting; `quiet` or `verbose`.
- `tick now`, `status`, `stop`, `archive-done`.

Workers need nothing installed beyond this plugin: their brief loads the `master-session:worker` skill and their persona's skill, and they report through the status tool.

The ledger, one note per run with every worker, its state and open findings, goes in your notes or memory tool, or a plain markdown file if you use none.

## Personas

Each persona is a skill, `master-session:<persona>`, and an agent of the same name that keeps the model, effort and tool limits listed in [personas.md](skills/start/personas.md). The reviewer, QA verifier, design checker and researcher can't edit files.

| Persona | What it does |
|---|---|
| `implementer` | Builds one deliverable from a brief in its own worktree and reports `ready <sha>`. |
| `refactorer` | Moves, renames or splits code without changing behaviour. |
| `reviewer` | Judges a `ready <sha>` against its brief and rules, ending in PASS or FAIL. |
| `qa-verifier` | Re-runs the gate at an exact sha in a clean worktree, ending in PASS or FAIL. |
| `design-checker` | Compares the built UI with the approved design. |
| `researcher` | Answers one question from published docs, citing each claim. |

Start a session as a persona. Claude Code's default system prompt is kept, and the plugin's SessionStart hook loads the persona's skill, plus the worker skill for the implementer and refactorer:

```bash
claude --agent master-session:implementer
```

The validator also spawns each one as a subagent, `master-session:<persona>`, which preloads its persona skill. The persona and worker skills stay out of the `/` menu. The desktop app's `start_session` can't pick an agent, so a worker started there loads the skills from its brief instead.

## Requirements

- Claude Code 2.1.275 or later for the one-line `/plugin install … --marketplace` form, 2.1.292 or later for its shell form. Built and tested on 2.1.304.
- The Claude desktop app's **Code** tab. The skill starts and messages worker sessions through the app's session tools, and the pane draws there. In a terminal the mod falls back to a text pane and band.
- git. Workers work in their own worktrees and the validator merges with `--ff-only`.

The mod keeps worker reports and the shared board under `~/.claude/state/master-session/`.

## Development

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

`plugin test` runs the mod's tests only. Check the SessionStart persona hook with:

```bash
sh hooks/persona.test.sh
```

Type-check against the engine's generated types: load the plugin once with `claude --plugin-dir .` so the engine writes `.claude-plugin/types/`, then run `tsc -p .`.

## License

[MIT](LICENSE)
