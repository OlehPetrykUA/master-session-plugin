# master-session

A feature factory for Claude Code. Give it a task, walk away, and come back to the result merged and in the place you use it. The chat picks a path by size and risk, hands bigger work to persona subagents in their own git worktrees, checks it once and keeps a live board of where everything stands.

## Install

```bash
claude plugin marketplace add OlehPetrykUA/master-session-plugin
claude plugin install master-session@master-session
```

Or in a session: `/plugin marketplace add OlehPetrykUA/master-session-plugin`, then `/plugin install master-session@master-session`.

## Use

| Command | What it does |
|---|---|
| `/master-session:start <task>` | Starts a run for the task. Typing it again adds more work to the same run. |
| `/master-session:stop` | Stops the run's subagents, cleans up and writes the final board. |

## Paths

| Path | When | Who |
|---|---|---|
| S, the default | Clear ask, one area | The chat itself, tests once, no agents |
| M | A normal feature | One Implementer, one QA verifier per feature, one fix round for all findings |
| L | Risky work, several features, or you ask for it | Adds Investigator, Researcher, Spec writer and Designer only as earned ([heavy.md](skills/start/heavy.md)) |

## Personas

Subagents, spawned as `master-session:<persona>`:

| Persona | Model | Does |
|---|---|---|
| `implementer` | sonnet | Builds one piece in its own worktree, reports `ready <sha>` |
| `qa-verifier` | sonnet | Runs the gate once, reviews the diff, returns PASS or FAIL; no edits |
| `investigator` | opus | Finds a bug's root cause with a repro; never fixes |
| `researcher` | sonnet | Answers one question from published docs, every claim sourced; no edits |
| `spec-writer` | opus | Writes one spec with testable acceptance criteria |
| `designer` | opus | Keeps the design canvas (an Artifact of the Design type) before any UI code |

## The board

Each run keeps `summary.md` (the board) and `protocol.md` (what must survive a compaction) in a run folder Claude picks. Builders, checkers and investigators run in worktrees Claude Code makes and cleans up (`isolation: worktree`).

`summary.md` follows a strict form ([board-spec.md](skills/start/board-spec.md)), checked by a bundled script:

```bash
python3 -I skills/start/scripts/summary-check <run folder>/summary.md
python3 -I skills/start/scripts/summary-check --self-test
```

## Requirements

Claude Code with plugin support, git, Python 3. The board's PC and disk commands and `screencapture` are macOS; on other systems the chat uses their equivalents.

## License

MIT
