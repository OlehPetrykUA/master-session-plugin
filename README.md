# Master session

A Claude Code plugin that turns one session into a **validator** for a team of workers. The validator plans the work, sizes each piece into a tier, starts only the agents the tier and the count line allow, answers their questions, verifies every `ready <sha>` with the checkers its tier names and merges it fast-forward only.
## What's inside

| Part | What it does |
|---|---|
| Skill `start` | `/master-session:start`, the validator protocol: work tiers, the agent count line, briefs, the tick loop, checkers by tier, permissions, the ledger. Ships `personas.md` (the persona index), `shape.md` (execution shape, worker lifetime, pause and resume, names), `answering.md` (answering workers and permissions), `board.md` (the chat board) and `copilot.md` (the Copilot CLI notes). |
| Skills `subchat`, `subagent`, `workflow` | `/master-session:subchat`, `/master-session:subagent` and `/master-session:workflow`: start a worker session, a persona subagent or a workflow of persona agents from the validator. |
| Skill `worker` | The protocol every worker session follows: its own worktree, talking to the validator, the `ready <sha>` gate. |
| Personas | Ten roles, each a skill plus an agent of the same name: `implementer`, `refactorer`, `reviewer`, `qa-verifier`, `design-checker`, `researcher`, `investigator`, `spec-writer`, `architect` and `designer`. |

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

## Copilot CLI

GitHub Copilot CLI loads the same plugin from a clone, live: nothing is copied, and each change in the folder shows up in the next session.

```bash
copilot plugin marketplace add <path to your clone>
```

```bash
copilot plugin install master-session@master-session
```

`copilot plugin list` shows it under "Live Plugins". The skills keep their own names (`start`, `subchat`, `worker`, the personas), and the agents are `master-session:<persona>`. What Copilot does instead of the session tools and the loop: [skills/start/copilot.md](skills/start/copilot.md).

## Usage

| Command | What it does |
|---|---|
| `/master-session:start <task>` | Turns the current session into the validator. |
| `/master-session:subchat <task>` | Starts a worker session, a side chat, for the task (the master picks the persona) and watches it in the loop. |
| `/master-session:subagent <task>` | Runs a persona the master picks as a background subagent for a short check, then relays its result. |
| `/master-session:workflow <task>` | Writes and runs a workflow for the task with persona agents, announcing the agent count first. |
| `/master-session:stop` | Ends the run: stops this session's heartbeat, posts the final board and lists the workers still running for you to stop. |

`subchat`, `subagent` and `workflow` make the session the validator first if `/master-session:start` hasn't run yet. Type `/master-session:start <task>`; the master decides the heartbeat, the board and the workers.

Workers need nothing installed beyond this plugin: their brief loads the `master-session:worker` skill and their persona's skill.

The ledger, the run's protocol, is two local files in the validator's session folder: `protocol.md` (every worker, its state and the plan) and `log.md` (verdicts, findings, decisions). Your notes or memory tool gets the milestones and, at wrap-up, a copy of both files.

## Personas

Each persona is a skill, `master-session:<persona>`, and an agent of the same name whose frontmatter keeps its default model, effort and tool limits ([personas.md](skills/start/personas.md)). The validator stages only the personas a piece's tier needs. The code reviewer, QA verifier, design checker, researcher and architect can't edit files.

| Persona | What it does |
|---|---|
| `implementer` | Builds one deliverable from a brief in its own worktree and reports `ready <sha>`. |
| `refactorer` | Moves, renames or splits code without changing behaviour. |
| `reviewer` | The Code reviewer for risk-flagged pieces, beside the QA verifier: reads a `ready <sha>` against its brief, the spec, the user's words and code quality, ending in PASS or FAIL. Its checklist and verdict rules also drive the combined checker. |
| `qa-verifier` | Owns the verification of a ready sha in a clean detached worktree: the one full gate, tests and mutations, the review checklist in combined mode (the single checker for most pieces), rechecks after a fix, and live checks when given a window id. |
| `design-checker` | Compares a readable render of the built UI with the approved design. |
| `researcher` | Answers one question from published docs, citing each claim. |
| `investigator` | Finds why a bug, failing test, regression or slowdown happens in the project's own code: reproduces and traces it in its own worktree and returns the root cause with evidence, a repro and fix options; never fixes it. |
| `spec-writer` | Writes the feature's spec in the project's Claude Doc, one tab per feature, with testable acceptance criteria, before design and build. |
| `architect` | For features spanning several modules or workers: turns the approved spec into a technical design in its tab (module map, interfaces, one piece per worker, order, risks, test proofs); read-only on code. |
| `designer` | A fresh subagent per design pass that edits the project's canonical design artboards, the single source of truth for visuals, in place (a new one only for a new component or state), in light and dark, for the user to approve before any UI code. |

Start a session as a persona. Claude Code's default system prompt is kept, and the plugin's SessionStart hook loads the persona's skill, plus the worker skill for the implementer and refactorer:

```bash
claude --agent master-session:implementer
```

The validator also spawns each one as a subagent, `master-session:<persona>`, which preloads its persona skill. The persona and worker skills stay out of the `/` menu. The desktop app's `start_session` can't pick an agent, so a worker started there loads the skills from its brief instead.

## Requirements

- Claude Code 2.1.275 or later for the one-line `/plugin install … --marketplace` form, 2.1.292 or later for its shell form. Built and tested on 2.1.304.
- The Claude desktop app's **Code** tab. The skill starts and messages worker sessions through the app's session tools.
- git. Workers work in their own worktrees and the validator merges with `--ff-only`.

## Development

```bash
claude plugin validate .
```

Check the SessionStart persona hook with:

```bash
sh hooks/persona.test.sh
```

## License

[MIT](LICENSE)
