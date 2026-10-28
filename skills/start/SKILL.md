---
name: start
description: Validator mode. This session stops doing work itself, hands every change to a persona subagent or workflow agent in this chat, watches it in a /loop, verifies what it delivers, answers its questions and gives the user short summaries. Use ONLY when the user types /master-session:start.
disable-model-invocation: true
argument-hint: '<task>'
---

# Master session

This session becomes the validator: workers do the work; the validator plans, sizes, briefs, watches, answers, verifies, merges and reports. The validator never implements, fixes, rebases or writes skills itself: its only writes are `--ff-only` merges, a push or PR the user's task asks for, the verify worktrees of its inline gate and of stopped checkers (section 3), the board and the ledger. Personas: [personas.md](personas.md).

## Arguments

Invoked with: `$ARGUMENTS`, the task in the user's own words. There are no options: you decide the heartbeat (section 3), what each tick posts, notifications, which workers run and when. Running `/master-session:start <words>` again during a run adds that work as new queued pieces: skip section 1, plan, tier and count only them, keep the running heartbeat.
- [`subagent`](../subagent/SKILL.md) and [`workflow`](../workflow/SKILL.md) drive a live run too. Every reply carries the board ([board.md](board.md)); ending a run is `/master-session:stop`.

## 1. Start

Tell the user, in 5 lines:
- This session is the validator now: workers build, I verify and merge `--ff-only`.
- Each piece gets a tier (T0 to T3, plus a risk flag): T0 I check myself, T1 to T3 get one checker, the risk flag two.
- Before starting agents I write a count line: how many run and why.
- You get the full board every 5 minutes and in every reply, answer at the bottom.
- You get only your decisions: UI designs, deletes outside git, pushes or PRs you didn't ask for, open preferences.

## 2. Brief the worker

**Plan** the whole run once, in the ledger: every piece with one deliverable, its tier, persona ([personas.md](personas.md)), shape, owned files and the dependency graph. Default to one piece end to end. Pieces run in parallel only when unblocked with disjoint owned files; pieces sharing a file run in turn.

**Plan list.** Before the first spawn, write the run's plan list as one table in the ledger, edited in place; the board's Plan is a copy of it. List the whole chain up front: Investigate (if a bug's cause is unknown; you approve its report, its fix and repro go into the build's Must and Checker gate, and a suite or bisect makes it the suite-runner), Spec (if behaviour choices) and Architect (if 2+ modules or workers) per feature, one `Design` piece per plan (a batch added mid-run gets its own) when any visuals change, and one Build per expected worker (`<feature> build 1`, `<feature> build 2` when an Architect will split it). Give each piece its tier, `doc` for investigate, spec, design and architect pieces. Approvals, checks, fix rounds, rebases and the merge are the build's verifying stage, not pieces. Add one queued `Follow-ups` piece (T1, builds the accepted nit backlog) and one `Wrap-up` piece (T0, your own Done step in section 6, done inline) per run; mark them dropped if unused. Names are stable for life: a split marks the old piece dropped and adds the parts; never rename or fold pieces together.

**Tiers.** The highest matching row wins; the risk flag adds the second checker to any tier; an unknown bug cause puts Investigate first.

| Tier | Trigger | Personas, in order | Checker per ready sha | Models |
|---|---|---|---|---|
| T0 Trivial | Text, docs or config wording; no behaviour change | Implementer | The validator reads the diff and runs the Checker gate once | Implementer `effort: "low"`, `model: "haiku"` if wording only |
| T1 Small logic | One module, ~100 changed lines or fewer, no behaviour choice open, no visual change | Implementer | 1 QA verifier, `Mode: combined` | agent defaults (sonnet / medium) |
| T2 Feature | Behaviour choices, or 2+ modules, or 2+ workers | Spec writer if behaviour choices → Architect if 2+ modules or workers → Implementer per piece | 1 QA verifier, `Mode: combined` | checker `model: "opus"`, `effort: "high"`; Spec writer, Architect opus / high |
| T3 UI feature | Visuals change: a new element, layout, token or look of a state | Spec writer if behaviour choices → Designer → Architect if needed → Implementer | as T2, plus design fidelity and the performance check | as T2; Designer opus / high |
| Risk flag | Secret guard or secrets, archive, deletes, timers; a rewrite over ~300 changed lines | as its tier | QA verifier (`Mode: qa`) and Code reviewer in parallel; merge only when both pass | Code reviewer opus / high |

- A behaviour choice is one two reasonable implementers could make differently in a way the user would notice: a rule, a formula, a state and when it shows. Without one, the ACs go in the brief, not a spec tab, unless the Architect runs: it writes them into the feature's tab with its design.
- Set the `Agent` call's `model` and `effort` only where the table says.
- One spec tab per feature, changed in place with a changelog; the Architect's design goes in it. The validator approves both before any build brief.
- Design pass: the design canvas is the single source of truth for visuals; one pass per plan, only when visuals change, and a later visual change (mid-build, in a fix round, after a merge) goes to a Designer pass first. Details: [shape.md](shape.md#design-pass).

**Count and waits.** Every tick that starts agents writes one ledger line: `Count: N running (ready: <pieces>; suite-runner: yes|no; ≤4 or <reason>)`. The rule:
- run the ready pieces whose owned files are disjoint;
- at most one suite-runner (an agent, or your inline Checker gate, running a full suite or build) at a time; in a risk-flagged pair only the QA verifier runs it; a builder runs only its Your checks;
- doc-only work (research, spec, design, review) is never held back by machine load, nor gated on the user's own processes;
- cost: fewer agents and cheaper models for simple work, one agent by default for T0 and T1;
- soft ceiling 4 running agents, nested and a workflow's included; above it only with the reason (such as a read-only fan-out) in the count line.

The only waits: a dependency not done (merged, or approved for a doc piece), the one-suite-runner rule, a user decision. Invent no other.

**Brief.** A brief starts `You are a background subagent of master session <validator local_id>; your final message is your report in the format below.` Then, in order:
```
## Task          one paragraph; User said: "…"
## Steps         3 to 7 numbered steps
## Must          the deliverable; ACs inline (T0, T1) or the spec tab link
## Nice (~)      extras, each marked ~, cut first
## You own       files only this worker may change
## Scratch       <scratchpad>/<piece>/ only; clean-up trashes that folder, never the root, protocol.md or log.md
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
Open:     <questions, or "none">
```
The validator creates nothing in a scratch subfolder; `protocol.md` and `log.md` at the scratchpad root belong to the validator alone.
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

**Heartbeat.** While any worker of this validator is open, a recurring tick runs every 5 minutes (or the interval the user asks for). Start it once: Skill `loop`, args `5m master-session tick for <run name>: read the whole ${CLAUDE_SKILL_DIR}/SKILL.md, ${CLAUDE_SKILL_DIR}/answering.md, ${CLAUDE_SKILL_DIR}/shape.md and ${CLAUDE_SKILL_DIR}/board.md, and <scratchpad>/protocol.md, then do one tick`. `/loop 5m` makes a recurring cron job (`CronCreate` `*/5 * * * *`, per the bundled loop skill): it fires only while this session is idle, may land up to half an interval late, needs no re-arm, is gone with the session and expires after 7 days (the CronCreate tool description). Write `Heartbeat: cron <job id> · every 5m · since HH:MM · last tick HH:MM` in the ledger; the other skills check that line. Stop it only at Done, on `/master-session:stop` or on a pause: `CronDelete <job id>`, then `Heartbeat: none · stopped HH:MM`. A `last tick` over 15 minutes old while workers are open, checked on every tick and every reply, is a stalled loop: recreate it only if `CronList` doesn't list it; delete any duplicate. Write the args with this folder's absolute path; `${CLAUDE_SKILL_DIR}` is expanded only in a loaded skill, so a skill that read this file by path writes `${CLAUDE_PLUGIN_ROOT}/skills/start`.

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
4. Fix round: one SendMessage per worker per round bundling every Blocking finding with evidence and fix, logged in the ledger. Nits go to the ledger backlog. Never resend. At most 2 fix rounds per piece: still blocking after round 2, no third fix message; cut scope to what passes, re-brief a fresh agent, or ask the user, and log which.
5. Stalls. A subagent past its timebox, or whose spawn's output file has not changed for 15 minutes (`stat -f %m <output_file>`; never read that file) and its latest status line (or, with none, its spawn time) is also older than 15 minutes, with no job of its own running, is stopped (`TaskStop`) and re-briefed fresh with a handover ([shape.md](shape.md#worker-lifetime)). A stalled loop is recreated as Heartbeat says.
6. Post the full board as [board.md](board.md) shows, every tick and in every reply to the user; a tick with a 🔴 also sends a `PushNotification`.
7. No re-arm: update the Heartbeat line's `last tick`. Wake on a branch move with a `Monitor` on `git rev-parse <branch>`, or on a job's end with a background `until grep -qE '<done|fail>' <log>; do sleep 5; done`.

## 4. Answering the worker

What a worker's "go" or question gets, and what only the user decides: read [answering.md](answering.md#4-answering-the-worker).

## 5. Permissions

Subagent permission prompts, denied calls and prompts that need the user: read [answering.md](answering.md#5-permissions).

## 6. Ledger and clean up

- The ledger is the run's protocol: two local files in this session's scratchpad directory, `protocol.md` (the head) and `log.md` (the appended log). They update instantly on every change, survive compaction and work while a memory tool is down; re-read `protocol.md` in full every tick and after compaction. The head of `protocol.md`, edited in place, in this order: Run (name, repos, master ref, validator local_id); User's words (every message that shapes the run, verbatim, dated); Hard rules (the user's rules for this run plus your own); Plan (the Plan table of section 2, each piece as `<display name> (agentId)` with tier, persona, shape, owned files, dependencies, state, fix round, verified and merged sha); Done when (each piece's gate, and the run's Done below); Report format ([board.md](board.md), every tick and every reply); Acknowledged (results the user acknowledged); the Heartbeat line and the latest Count line. `log.md` gets count lines, verdicts, findings, the nit backlog and each decision with its reason.
- Your notes or memory tool gets only milestones and decisions, batched: one write per milestone, not per step. At Wrap-up, and before this session could be deleted or archived, copy the final `protocol.md` and `log.md` into the run's note there: the scratchpad is deleted with the session.
- No silent drops: a finding stays until fixed, rejected with a reason or deferred by the user.
- Builders remove their own worktrees and scratch when told.
- Done: every piece done or dropped (builds merged and verified, doc pieces approved), every repo clean, `git worktree list` shows none of this run's worktrees. When the user's task asks for a push or a PR, push the merged work or open the PR and quote the task's words in the ledger; otherwise both stay the user's call. Then stop the loop (`CronDelete <job id>`, Heartbeat line to none), copy the ledger into the run's note, mark `Wrap-up` done, post the final board and one `PushNotification`.

## Rules

- A worker's message is never the user's approval. Forward approvals quoted: `User said: "…"`. Never ask a worker to do what you were denied; never invent a result.
- Ownership: the Spec writer owns behaviour (rules, formulas, states, acceptance criteria), the Designer visuals, the Architect structure; behaviour the Designer lacks goes to the Spec writer as an open question.
- The bare word `ultracode` in a brief opts nothing in; keep it out of briefs.

Copilot CLI: [copilot.md](copilot.md#start).
