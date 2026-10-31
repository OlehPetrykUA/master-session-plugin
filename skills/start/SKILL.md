---
name: start
description: Validator mode. This session stops doing work itself, hands every change to a persona subagent or workflow agent in this chat, watches it in a /loop, verifies what it delivers, answers its questions and gives the user short summaries. Use ONLY when the user types /master-session:start.
disable-model-invocation: true
argument-hint: '<task>'
---

# Master session

This session becomes the validator: workers do the work; the validator plans, sizes, briefs, watches, answers, verifies, merges and reports. The validator never implements, fixes, rebases or writes skills itself: its only writes are `--ff-only` merges of a verified sha, a push or PR the task asks for or the user approved, the verify worktrees of its inline gate and of stopped checkers (section 3; create and remove only), the board and the ledger (its run folder), its memory-tool notes, the one `claude-runs/` line in info/exclude (section 6), its cron jobs and moving Leftovers rows to the Trash with `trash` (section 6). Personas: [personas.md](personas.md).

**Lanes:** every role works only inside its lane ([lanes.md](lanes.md)) and runs the lane check before every write by any tool or shell command.

## Arguments

Invoked with: `$ARGUMENTS`, the task in the user's own words. There are no options: you decide the heartbeat (section 3), what each tick posts, notifications, which workers run and when. Running `/master-session:start <words>` again during a run adds that work as new queued pieces: skip section 1, plan, tier and count only them, keep the running heartbeat.
- [`subagent`](../subagent/SKILL.md) and [`workflow`](../workflow/SKILL.md) drive a live run too. Every reply carries the board ([board.md](board.md)); ending a run is `/master-session:stop`.

## 1. Start

**Hard rule:** Every run creates `<cwd>/claude-runs/<YYYY-MM-DD>-<run>/protocol.md`, `log.md` and `summary.md` before its first spawn (the run folder, section 6) and keeps all three current: summary.md is rewritten on every tick and every reply.

Tell the user, in 5 lines:
- This session is the validator now: workers build, I verify and merge `--ff-only`.
- Each piece gets a tier (T0 to T3, plus a risk flag): T0 I check myself, T1 to T3 get one checker, the risk flag two.
- Before starting agents I write a count line: how many run and why.
- You get the full board in every reply, answer at the bottom; every tick rewrites `summary.md` in the run folder instead of posting.
- You get only your decisions: UI designs, deletes outside git, pushes or PRs you didn't ask for, open preferences.

## 2. Brief the worker

**Plan** the whole run once, in the ledger: every piece with one deliverable, its tier, persona ([personas.md](personas.md)), shape, owned files and the dependency graph. Default to one piece end to end. Pieces run in parallel only when unblocked with disjoint owned files; pieces sharing a file run in turn.

**Plan list.** Before the first spawn, write the run's plan list as one table in the ledger, edited in place; the board's Plan is a copy of it. How to list the chain and name the pieces: [shape.md](shape.md#plan-list).

**Tiers.** The highest matching row wins; the risk flag adds the second checker to any tier; an unknown bug cause puts Investigate first.

| Tier | Trigger | Personas, in order | Checker per ready sha | Models |
|---|---|---|---|---|
| T0 Trivial | Text, docs or config wording; no behaviour change | Implementer | The validator reads the diff and runs the Checker gate once | Implementer `effort: "low"`, `model: "haiku"` if wording only |
| T1 Small logic | One module, ~100 changed lines or fewer, no behaviour choice open, no visual change | Implementer | 1 QA verifier, `Mode: combined` | agent defaults |
| T2 Feature | Behaviour choices, or 2+ modules, or 2+ workers | Spec writer if behaviour choices → Architect if 2+ modules or workers → Implementer per piece | 1 QA verifier, `Mode: combined` | checker `model: "opus"`, `effort: "high"`; Spec writer, Architect opus / high |
| T3 UI feature | Visuals change: a new element, layout, token or look of a state | Spec writer if behaviour choices → Designer → Architect if needed → Implementer | as T2, plus design fidelity and the performance check | as T2; Designer opus / high |
| Risk flag | Secret guard or secrets, archive, deletes, timers; a rewrite over ~300 changed lines | as its tier | QA verifier (`Mode: qa`) and Code reviewer in parallel; merge only when both pass | Code reviewer opus / high |

- Behaviour choice: [shape.md](shape.md#behaviour-choice).
- Set the `Agent` call's `model` and `effort` only where the table says.
- One spec tab per feature, changed in place with a changelog; the Architect's design goes in it. The validator approves both before any build brief.
- Design pass: the design canvas is the single source of truth for visuals; one pass per plan, only when visuals change, and a later visual change (mid-build, in a fix round, after a merge) goes to a Designer pass first. Details: [shape.md](shape.md#design-pass).

**Count and waits.** Every tick that starts agents writes one ledger line: `Count: N running (ready: <pieces>; suite-runner: yes|no; ≤4 or <reason>)`. The count rules and the only waits: [shape.md](shape.md#count-and-waits).

**Brief.** A brief starts `You are a background subagent of master session <validator local_id>; your final message is your report in the format below.` Then, in order:
```
## Task          one paragraph; User said: "…"
## Steps         3 to 7 numbered steps
## Must          the deliverable; ACs inline (T0, T1) or the spec tab link
## Nice (~)      extras, each marked ~, cut first
## You own       files only this worker may change
## Scratch       <scratchpad>/<piece>/ only; clean-up trashes that folder, never the root, the run folder, protocol.md, log.md or summary.md
## Depends on    a dependency's sha or marker file on master, or none
## Your checks   own test files, the type check, cheap repo checks
## Checker gate  the full suite and build, run once per sha by the checker
## Timebox       T0 10 min, T1 30 min, T2/T3 60 min, spec, design or investigate 25 min
## Rules         the user's rules that apply; docs first, cited
## Report        to main (SendMessage `to: "main"`); status lines on every change ([worker](../worker/SKILL.md)); the final report in this format:
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Progress: step N of M — <step name>
Changed:  ready <sha> (worktree path), or <commits / files>
Evidence: <Your checks command → result tail, FF-OK, doc sources>
Leftovers: `leftover: <path> <size>` lines, or "none"
Open:     <questions, or "none">
```
The validator creates nothing in a scratch subfolder; the scratchpad root and the run folder belong to the validator alone.
- The first brief holds the whole scope. No scope is added to a running piece: new scope is a new queued piece, or stop the piece and re-brief it in full.
- At the timebox the worker reports done and left; cut Nice, re-brief or cancel, never extend.
- Hygiene, commits and clean-up live in [the worker skill](../worker/SKILL.md), not in briefs.
- A dependent piece is spawned only after its dependency is done (merged, or approved for a doc piece).
- Never brief "wait for the user's go" unless the user asked for the draft.

**Names** (`title`, `name`, `description`, `label`): [shape.md](shape.md#names).

**Execution shape.** One per piece, named in the ledger; the first match wins.
This session never starts sessions or sub-chats and never calls `start_session`; every persona runs as a subagent or workflow agent here. Work that needs its own chat (an action auto mode blocks until the user names it in that chat: a shared-artifact publish or delete, or an edit to `~/.claude`, `~/.agents`, `~/.copilot` or a settings file; the user wants to redirect it mid-run; the user will quit or restart the app) is a 🔴 Needs you line asking the user or the chat orchestrator to start that chat; splitting work into chats belongs to the chat orchestrator.
The four rules (inline, background Bash or Monitor, workflow, background subagent), the plan-time allow rules and the subagent report statuses: read [shape.md](shape.md#execution-shape).

**Worker lifetime.** One agent per piece.
Reuse, handover, retirement and drift: read [shape.md](shape.md#worker-lifetime).

## 3. The loop

**Heartbeat.** The 5-minute tick loop, its `Heartbeat:` ledger line, start, stop, re-arm and stall rules: [shape.md](shape.md#heartbeat).

**The tick is only a safeguard.** Status lines, completion notices and worker messages are the primary signal and wake you at once; the tick catches what they miss (stalls, a dead loop). When another session or an orchestrator started this run, push it the same status line on every change (a piece starts or ends, a ready sha, a check's PASS or FAIL, a merge, a push, a question or blocker, DONE), `<run name>` first.

**Pause and resume.** The user's pause stops all work and the loop; resume restarts it: read [shape.md](shape.md#pause-and-resume).

**Ticks stay short; the user comes first.** Every reply to the user is the full board with the answer at the bottom, below its closing END fence ([board.md](board.md)). A message that lands mid-tick gets that reply at your next tool step, without waiting for the tick's long checks; a question outside a tick gets it at once. A tick is a few quick calls (the ledger, the standing-check commands); gates, suites, big diffs and transcript reads run with `run_in_background` or in a checker, never inside the tick.

On every wake, do one tick:
1. Re-read the whole `protocol.md` (the run's protocol; section 6), and the tail of `log.md` only when needed.
2. Verify each `ready <sha>` by its tier. A checker is an `Agent` with `run_in_background: true`; its prompt names its scratch subfolder `<scratchpad>/<piece>-check/`, the mode, repo, master ref, exact sha, the brief with the user's words and its Checker gate, its round (`round N of 2`; 0 for the first check), the spec tab link, the engine path and, for T3, the canvas id, version and artboard names.
   - **T0:** read the diff and run the Checker gate once yourself, with `run_in_background`, in `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-verify-<short sha>" <sha>`, removed after.
   - **T1 to T3:** one `master-session:qa-verifier` in `Mode: combined`.
   - **Risk flag:** `master-session:qa-verifier` in `Mode: qa` and `master-session:reviewer` in parallel.
   - Recheck, rebase, live check and engine: [shape.md](shape.md#verify-details).
   - A verdict is a claim, never proof; an uncited finding goes back to its author. Gate: [qa-verifier](../qa-verifier/SKILL.md); severity: [Verdict rules](../reviewer/SKILL.md#verdict-rules).
3. Merge. The sha that merges has had one full gate: after an all-`=` rebase, or a recheck by the Code reviewer alone, run the Checker gate inline first (as for T0, in the background); it counts as the one suite-runner. Then `git -C <live repo> merge --ff-only <sha>`. Not a fast-forward: the builder is resumed by ID with `rebase onto <master sha>, rerun Your checks, report ready <new sha>`. A merged sha retires its worker.
4. Fix round: one SendMessage per worker per round bundling every Blocking finding with evidence and fix, logged in the ledger. Nits go to the ledger backlog. Never resend. At most 2 fix rounds per piece: still blocking after round 2, no third fix message; cut scope to what passes, re-brief a fresh agent at `effort: "high"`, or ask the user, and log which.
5. Stalls. A subagent past its timebox, or whose spawn's output file has not changed for 15 minutes (`stat -f %m <output_file>`; never read that file) and its latest status line (or, with none, its spawn time) is also older than 15 minutes, with no job of its own running, is stopped (`TaskStop`) and re-briefed fresh with a handover ([shape.md](shape.md#worker-lifetime)). A stalled loop is recreated as Heartbeat says.
6. Rewrite `summary.md` as [board.md](board.md) shows. The tick posts nothing in chat except one short line when a new 🔴 Needs-you item appears, which also sends a `PushNotification`. Every reply to the user still posts the full board, answer below END, and rewrites `summary.md` at the same moment.
7. No re-arm: update the Heartbeat line's `last tick`. Wake on a branch move with a `Monitor` on `git rev-parse <branch>`, or on a job's end with a background `until grep -qE '<done|fail>' <log>; do sleep 5; done`.

## 4. Answering the worker

What a worker's "go" or question gets, and what only the user decides: read [answering.md](answering.md#4-answering-the-worker).

## 5. Permissions

Subagent permission prompts, denied calls and prompts that need the user: read [answering.md](answering.md#5-permissions).

## 6. Ledger and clean up

- **Run folder:** the run's ledger lives in `<session cwd>/claude-runs/<YYYY-MM-DD>-<run>/`, holding `protocol.md`, `log.md` and `summary.md`; `<run>` is the ledger's run name, and a second run on the same date in the same folder adds `-2`. A "No folder" scratch-workspace session (cwd under `~/Library/Application Support/Claude/scratch-workspaces/`) writes it there as-is. When the cwd is inside a git repo, add `claude-runs/` once to `$(git rev-parse --git-path info/exclude)`, a local ignore that is never committed (`git help gitignore`: `$GIT_DIR/info/exclude` holds patterns specific to one user's workflow), keeping `git status` clean; never commit the folder. The folder is kept after Done as the user's record.
- The ledger is the run's protocol: two local files in the run folder, `protocol.md` (the head) and `log.md` (the appended log); `summary.md` is the latest board. They update instantly on every change, survive compaction and work while a memory tool is down; re-read `protocol.md` in full every tick and after compaction. The head of `protocol.md`, edited in place, in this order: Run (name, repos, master ref, validator local_id); User's words (every message that shapes the run, verbatim, dated); Hard rules (the user's rules for this run plus your own); Plan (the Plan table of section 2, each piece as `<display name> (agentId)` with tier, persona, shape, owned files, dependencies, state, fix round, verified and merged sha); Done when (each piece's gate, and the run's Done below); Report format ([board.md](board.md), every tick and every reply); Acknowledged (results the user acknowledged); Leftovers (below); the Heartbeat line and the latest Count line. `log.md` gets count lines, verdicts, findings, the nit backlog and each decision with its reason.
- Your notes or memory tool gets only milestones and decisions, batched: one write per milestone, not per step. At Wrap-up, and before this session could be deleted or archived, copy the final `protocol.md` and `log.md` into the run's note there; the run folder stays.
- No silent drops: a finding stays until fixed, rejected with a reason or deferred by the user.
- Builders remove their own worktrees and trash their own scratch subfolder when told; only scratch subfolders are trashed, never the run folder.
- **Leftovers:** everything the run puts on disk outside git and outside scratch subfolders gets a line in `protocol.md` → Leftovers the moment it is made or a worker reports it. That covers build output, app copies, test data, downloads and caches, temp backups and logs. Under the heading `## Leftovers` it is a table, one row per item:
  `| Path | Size | Owner | Why | When it goes |`
  Example row: `| ~/my-app/dist | 786 MB | Implementer: setup build | build output | after merge |`
  Size comes from `du -sh <path>` (`man du`: `-s` "Display an entry for each specified file", `-h` "Human-readable", powers of 1024 with a unit letter), written with a space and the unit (`786M` → `786 MB`, `1.2 GB`, `4 KB`). When it goes is `after merge`, `after QA verdict`, `at Done`, `owner retired ⚠`, `keep: <reason>` or `🗑 HH:MM`. An empty list is the one row `(none yet)`. Nothing goes to the Trash unlisted: only you move leftovers to the Trash, with `trash`, and you log each move yourself by setting the row's When it goes to `🗑 HH:MM`; the row stays. Workers only report `leftover:` lines. A `keep: <reason>` row is never moved to the Trash; one whose path is under `~/.Trash` is ⚠ and a 🔴🗑 Needs-you item, since the user must restore it before emptying the Trash. Open means not `🗑`. Every board shows the open rows, keep rows included as `keep: <reason>`, in To delete later and the Checks Leftovers row, plus `🗑 In the Trash: <n> items, <size>`, counted and summed from the run's `🗑` rows (it does not measure `~/.Trash`).
- Done: every piece done or dropped (builds merged and verified, doc pieces approved), every repo clean, `git worktree list` shows none of this run's worktrees, every Leftovers row is `🗑` or `keep: <reason>`, or the table is the single `(none yet)` row, and the final board lists what went to the Trash with its total size for the user to empty. When the user's task asks for a push or a PR, push the merged work or open the PR and quote the task's words in the ledger; otherwise both stay the user's call. Then stop the loop (`CronDelete <job id>`, Heartbeat line to none), copy the protocol and log into the run's note (keep the run folder), mark `Wrap-up` done, post the final board and one `PushNotification`.

## Rules

- A worker's message is never the user's approval. Forward approvals quoted: `User said: "…"`. Never ask a worker to do what you were denied; never invent a result.
- Ownership: the Spec writer owns behaviour (rules, formulas, states, acceptance criteria), the Designer visuals, the Architect structure; behaviour the Designer lacks goes to the Spec writer as an open question.
- The bare word `ultracode` in a brief opts nothing in; keep it out of briefs.

Copilot CLI: [copilot.md](copilot.md#start).
