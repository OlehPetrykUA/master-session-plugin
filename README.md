# Master session

A skills-only Claude Code plugin that turns one session into a feature factory. That session is the master session, a validator: it plans the work into tiered pieces, runs every persona as a subagent or a read-only workflow inside its own chat, verifies each `ready <sha>` with a checker, merges `--ff-only` and pushes when you ask. It never implements anything itself, and it never starts other sessions or sub-chats and never calls `start_session`. Splitting work across chats is the chat orchestrator's job, a separate skill that is not in this repo.

## Install

From a local folder:

```bash
claude --plugin-dir /path/to/master-session-plugin
```

From the marketplace manifest in `.claude-plugin/marketplace.json`:

```bash
claude plugin marketplace add OlehPetrykUA/master-session-plugin
claude plugin install master-session@master-session
```

Copilot CLI loads the plugin too, with a few changes: see `skills/start/copilot.md`.

## Commands

| Command | What it does |
|---|---|
| `/master-session:start <task>` | Makes this session the master session and runs the task. Run it again during a run to add work as new queued pieces. |
| `/master-session:subagent <task>` | Runs one persona as a background subagent for a short check and relays its result. |
| `/master-session:workflow <task>` | Writes and runs a workflow script with the personas as its agents, then relays the result. |
| `/master-session:stop` | Ends the run: deletes the tick cron job, stops the run's running subagents and workflows with `TaskStop`, copies the protocol and posts the final board. |

## The flow

1. **Plan** the whole run once: every piece with one deliverable, its tier, persona, owned files and dependencies.
2. **Tier** each piece, T0 to T3, plus a risk flag.
3. **Pick personas** for the tier, in order.
4. **Brief** a background subagent: task, steps, must, you own, your checks, checker gate, timebox.
5. **Build** in a detached worktree, with status lines back to the master session.
6. **Check** the ready sha with the checker the tier names.
7. **Merge** `--ff-only`. A merged sha retires its builder.
8. **Push** only when your task asked for it.

| Tier | Trigger | Checker per ready sha |
|---|---|---|
| T0 Trivial | Wording, docs or config; no behaviour change | The master session reads the diff and runs the gate once |
| T1 Small logic | One module, about 100 lines or fewer, no open behaviour choice, no visual change | 1 QA verifier |
| T2 Feature | Behaviour choices, or 2+ modules or workers | 1 QA verifier |
| T3 UI feature | Visuals change | 1 QA verifier, plus design fidelity and the performance check |
| Risk flag | Secrets, archive, deletes, timers; a rewrite over about 300 lines | QA verifier and Code reviewer in parallel |

The design canvas is the single source of truth for visuals. The full gate runs once per sha, in the checker, never again in the builder.

## Personas

Each persona is a skill plus an agent of the same name.

| Persona | Role |
|---|---|
| `implementer` | Builds one deliverable from a brief in its own worktree and reports `ready <sha>`. |
| `refactorer` | Moves, renames or splits code without changing behaviour, proved by a byte-identical baseline. |
| `reviewer` | The Code reviewer: checks a ready commit against the brief, the spec and the rules, with cited findings. |
| `qa-verifier` | Owns verification of a ready sha in a clean worktree and returns one PASS or FAIL. |
| `design-checker` | Compares a built UI with the approved design artboards and returns crop pairs for each mismatch. |
| `researcher` | Answers one question from published docs, tagging every claim with its source. |
| `investigator` | Finds the root cause of a bug or slowdown by reproducing it; returns evidence, a repro and fix options, never a fix. |
| `spec-writer` | Writes a feature's spec with testable acceptance criteria before design and build. |
| `architect` | Turns an approved spec into a technical design: modules, interfaces, one piece per worker. |
| `designer` | Keeps the design canvas as one artboard per component and state set, edited in place. |

To run one as your own session: `claude --agent master-session:<persona>`. The SessionStart hook `hooks/persona.sh` then loads its skill.

## The board

The master session posts the full board on every tick and in every reply. It opens with a `🏭 BOARD` fence and closes with a `🏭 END` fence right after 🔭 Current state. A reply to you puts its answer below the END fence.

- **Counts line:** working, waiting, need you, done, and the next tick time.
- **Quick table and mini tables:** subagents and workflows only, as plain names.
- **Plan:** every piece of the run, with the piece names kept; each ▶ step names its active worker.
- **🙋 Needs you:** numbered actions, each marked 🔴 blocking now or 🟡 later, plus a kind emoji; `✅ Nothing right now.` when empty.
- **🛡 Standing checks:** Git safety per repo (committed, on a branch, or uncommitted), a To delete later list of extra worktrees and branches, and PC load.
- **📦 Results so far:** kept on every board until you say "acknowledged".
- **🔭 Current state:** 2 to 4 bullets on what each worker is doing, waiting for and doing next.

Every worker is named `<Persona>: <short task>`.

```
━━━━━━━━━━ 🏭 BOARD · 19:20 · run setup-wizard ━━━━━━━━━━
🟢 1 working · 🟡 1 waiting · 🔴 0 need you · ✅ 1 done · next tick 19:25

| | 🤖 Worker | ▸ Now | → Next |
|---|---|---|---|
| 🟡 | QA verifier: check setup build | waiting on ready sha | verdict |
| 🟢 | Implementer: setup build | rewriting setup screens | smoke, check |
| ✅ | Implementer: conductor build | done · 07ab1b7 | — |

**📋 Plan**
1. ✅ Conductor build · T1 · merged 07ab1b7
2. ▶ Setup build · T3 · Implementer: setup build, step 3 of 5 — build screens
3. ⏳ Wrap-up · T0 · Done step

**🙋 Needs you**
Urgency: 🔴 blocking now · 🟡 later or after X. Kind: 🖥 run a command · 🔁 restart or reload · 🗑 Trash or files · ✋ decision · 🔑 sign-in or approval.
1. 🟡🔁 After QA verifier: check setup build passes: reload the plugin with `/reload-plugins` in the user's own chat
2. 🟡🗑 After the merge: move `~/.claude/worktrees/wt-my-app-setup-build` to Trash, in the user's terminal

**🛡 Standing checks**
- **Git safety:**
  - ✅ ~/dotfiles: committed and on master; nothing lives only in scratch
  - 🟡 my-app: committed on branch `setup-ui ＠ 3c1d7e2`, owner Implementer: setup build, merges after the QA verdict
- **To delete later:**
  - worktree `wt-my-app-setup-build` (detached) · Implementer: setup build · holds the unmerged ready sha · after merge
  - branch `setup-import` · Implementer: setup import · piece dropped · owner retired ⚠
- ✅ PC load: CPU 62% idle · load 5.1 / 10 cores

**📦 Results so far**
- Implementer: conductor build merged and verified: 07ab1b7 on master

**🔭 Current state**
- Implementer: setup build is rewriting the setup screens; next a smoke test and its check.
- QA verifier: check setup build waits for the ready sha; next the gate and a verdict.
━━━━━━━━━━ 🏭 END ━━━━━━━━━━

**Answer:** yes, the conductor build is on master as 07ab1b7.
```

## Status lines and ticks

Builders send a status line on every change, with SendMessage `to: "main"`:

```
<piece>: <what changed> · next: … · needs: …
```

These lines are the primary signal. A tick is only a safeguard: `/loop 5m`, a recurring cron job that fires only while the session is idle, lives only in this session and expires after 7 days. A tick older than 15 minutes means the loop has stalled. A subagent counts as stalled when its output file and its last status line (or its spawn time) are both older than 15 minutes.

## The run protocol

The run lives in two files in the session's scratchpad: `protocol.md` (the head: run, your words, hard rules, plan, done criteria) and `log.md` (the appended log). They are re-read on every tick and survive compaction. The memory tool gets milestones, and a copy of both files at wrap-up or on stop.

## Repo layout

| Path | Contents |
|---|---|
| `skills/start`, `stop`, `subagent`, `workflow` | The four commands. `start` also holds `board.md`, `shape.md`, `answering.md`, `personas.md` and `copilot.md`. |
| `skills/worker` | The builder-subagent protocol. |
| `skills/<persona>` and `agents/<persona>.md` | The ten personas. |
| `hooks/` | `persona.sh`, the SessionStart hook, and `persona.test.sh`. |
| `.claude-plugin/` | `plugin.json` and `marketplace.json`. |

## Development

```bash
sh hooks/persona.test.sh
claude plugin validate --strict .
```

## License

[MIT](LICENSE)
