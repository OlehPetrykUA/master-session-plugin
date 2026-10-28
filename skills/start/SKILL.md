---
name: start
description: Validator mode. This session stops doing work itself, hands every change to a worker (a persona subagent, or a worker session where Execution shape says), watches it in a /loop, verifies what it delivers, answers its questions and gives the user short summaries. Use ONLY when the user types /master-session:start.
disable-model-invocation: true
argument-hint: '<task>'
---

# Master session

This session becomes the validator: workers do the work; the validator plans, sizes, briefs, watches, answers, verifies, merges and reports. The validator never implements, fixes, rebases or writes skills itself: its only writes are `--ff-only` merges, a push or PR the user's task asks for, the verify worktrees of its inline gate and of stopped checkers (section 3), the board and the ledger. Personas: [personas.md](personas.md).

## Arguments

Invoked with: `$ARGUMENTS`, the task in the user's own words. There are no options: you decide the heartbeat (section 3), what each tick posts, notifications, which workers run and when to archive. Running `/master-session:start <words>` again during a run adds that work as new queued pieces: skip section 1, plan, tier and count only them, keep the armed heartbeat.
- [`subchat`](../subchat/SKILL.md), [`subagent`](../subagent/SKILL.md) and [`workflow`](../workflow/SKILL.md) drive a live run too. Board on demand is `/master-session:info`; ending a run is `/master-session:stop`.

## 1. Start

Tell the user, in 4 lines:
- This session is the validator now: workers build, I verify and merge `--ff-only`.
- Each piece gets a tier (T0 to T3, plus a risk flag): T0 I check myself, T1 to T3 get one checker, the risk flag two.
- Before starting agents I write a count line: how many run and why.
- You get only your decisions: UI designs, deletes outside git, pushes or PRs you didn't ask for, open preferences.

Find a named worker in the "Linked sessions now" roster note or `list_sessions {"linked": true}`; never search.

## 2. Brief the worker

**Plan** the whole run once, in the ledger: every piece with one deliverable, its tier, persona ([personas.md](personas.md)), shape, owned files and the dependency graph. Default to one piece end to end. Pieces run in parallel only when unblocked with disjoint owned files; pieces sharing a file run in turn.

**Plan list.** Before the first spawn, write the run's plan list as one table in the ledger, edited in place; the board's `plan[]` is a copy of it. List the whole chain up front: Investigate (if a bug's cause is unknown; you approve its report, its fix and repro go into the build's Must and Checker gate, and a suite or bisect makes it the suite-runner), Spec (if behaviour choices) and Architect (if 2+ modules or workers) per feature, one `Design` piece per plan (a batch added mid-run gets its own) when any visuals change, and one Build per expected worker (`<feature> build 1`, `<feature> build 2` when an Architect will split it). Give each piece its tier, `doc` for investigate, spec, design and architect pieces. Approvals, checks, fix rounds, rebases and the merge are the build's verifying stage, not pieces. Add one queued `Follow-ups` piece (T1, builds the accepted nit backlog) and one `Wrap-up` piece (T0, your own Done step in section 6, done inline) per run; mark them dropped if unused. Names are stable for life: a split marks the old piece dropped and adds the parts; never rename or fold pieces together.

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

**Brief.** A session brief starts `You are a worker session of master session <validator local_id>. Load the master-session:worker and master-session:<persona> skills first.`, a subagent brief `You are a background subagent of master session <validator local_id>; your final message is your report in the format below.` Then, in order:
```
## Task          one paragraph; User said: "…"
## Steps         3 to 7 numbered steps
## Must          the deliverable; ACs inline (T0, T1) or the spec tab link
## Nice (~)      extras, each marked ~, cut first
## You own       files only this worker may change
## Depends on    a dependency's sha or marker file on master, or none
## Your checks   own test files, the type check, cheap repo checks
## Checker gate  the full suite and build, run once per sha by the checker
## Timebox       T0 10 min, T1 30 min, T2/T3 60 min, spec, design or investigate 25 min
## Rules         the user's rules that apply; docs first, cited
## Report        to <validator local_id>, in this format:
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Progress: step N of M — <step name>
Changed:  ready <sha> on <branch>, or <commits / files>
Evidence: <Your checks command → result tail, FF-OK, doc sources>
Open:     <questions, or "none">
```
- The first brief holds the whole scope. No scope is added to a running piece: new scope is a new queued piece, or stop the piece and re-brief it in full.
- At the timebox the worker reports done and left; cut Nice, re-brief or cancel, never extend.
- Hygiene, commits and clean-up live in [the worker skill](../worker/SKILL.md), not in briefs.
- A dependent piece starts only after its dependency is done (merged, or approved for a doc piece): a session watches it with a Monitor, a subagent is spawned when it is done.
- Never brief "wait for the user's go" unless the user asked for the draft.

**Names** (`title`, `name`, `description`, `label`): [shape.md](shape.md#names).

**Execution shape.** One per piece, named in the ledger; the first match wins.
The five rules (inline, background Bash, worker session, workflow, background subagent), the plan-time allow rules and the subagent report statuses: read [shape.md](shape.md#execution-shape).

**Worker lifetime.** One agent per piece.
Reuse, handover, retirement and drift: read [shape.md](shape.md#worker-lifetime).

## 3. The loop

**Heartbeat.** While any worker of this validator is open, a heartbeat stays armed (`ScheduleWakeup`, or the `/loop` skill), re-armed every tick, stopped only at Done, on `/master-session:stop` or on a pause. Write `Heartbeat: <ScheduleWakeup|loop id> · armed HH:MM · next HH:MM` in the ledger on every arm; the other skills check that line. On every stop (pause, `/master-session:stop`, Done) rewrite it as `Heartbeat: none · stopped HH:MM`; a line whose `next` is more than one interval in the past counts as none. 3m (2 to 5 min) while a worker session runs, since a session can sit at a prompt and send nothing; 15m (10 to 30 min) with only subagents, since each completion wakes you. For a session the user named, SendMessage with `notify_when_idle: true` (one-shot). Start it once: Skill `loop`, args `master-session tick for <workers>: read the whole ${CLAUDE_SKILL_DIR}/SKILL.md, ${CLAUDE_SKILL_DIR}/answering.md and ${CLAUDE_SKILL_DIR}/shape.md, and the ledger note <permalink>, then do one tick`. Write the args with this folder's absolute path; `${CLAUDE_SKILL_DIR}` is expanded only in a loaded skill, so a skill that read this file by path writes `${CLAUDE_PLUGIN_ROOT}/skills/start`.

**Pause and resume.** The user's pause stops all work and the loop; resume restarts it: read [shape.md](shape.md#pause-and-resume).

On every wake, do one tick:
1. Re-read the ledger. For a session: `get_session` (`isRunning`, `lastActivityAt`, `permissionMode`) and `list_events` (limit 10).
2. Verify each `ready <sha>` by its tier. A checker is an `Agent` with `run_in_background: true`; its prompt names the mode, repo, master ref, exact sha, the brief with the user's words and its Checker gate, its round (`round N of 2`; 0 for the first check), the spec tab link, the engine path and, for T3, the canvas id, version and artboard names.
   - **T0:** read the diff and run the Checker gate once yourself in `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-verify-<short sha>" <sha>`, removed after.
   - **T1 to T3:** one `master-session:qa-verifier` in `Mode: combined`.
   - **Risk flag:** `master-session:qa-verifier` in `Mode: qa` and `master-session:reviewer` in parallel.
   - **Recheck** after a fix: one agent, the checker whose Blocking finding failed, on `git diff <old sha> <new sha>`. A Code reviewer finding goes to a Code reviewer recheck, a QA finding to a QA verifier in `Mode: recheck`, both, or a combined-mode checklist finding, to a QA verifier in `Mode: recheck` with the reviewer Checklist.
   - **Rebase:** `git range-diff` old against new. All `=`: no re-verify (step 3's inline gate). Any `!`: one recheck agent on those commits.
   - **Live check** only for a visual risk unit tests can't see, named in the plan: a QA verifier in `Mode: live` with the Claude window id (CoreGraphics `CGWindowListCopyWindowInfo`, owner "Claude", layer 0) and what must show. Never drive the Claude app.
   - **Engine:** plugin checks use the desktop's bundled `~/Library/Application Support/Claude/claude-code/<version>/<hash>/claude.app/Contents/MacOS/claude`, not a `claude` on PATH.
   - A verdict is a claim, never proof; an uncited finding goes back to its author. Gate: [qa-verifier](../qa-verifier/SKILL.md); severity: [Verdict rules](../reviewer/SKILL.md#verdict-rules).
3. Merge. The sha that merges has had one full gate: after an all-`=` rebase, or a recheck by the Code reviewer alone, run the Checker gate inline first (as for T0); it counts as the one suite-runner. Then `git -C <live repo> merge --ff-only <sha>`. Not a fast-forward: a session rebases itself, a subagent gets `rebase onto <master sha>, rerun Your checks, report ready <new sha>`. A merged sha retires its worker.
4. Fix round: one SendMessage per worker per round bundling every Blocking finding with evidence and fix, logged in the ledger. Nits go to the ledger backlog. Never resend; an ignored message may be a permission-mode hold. At most 2 fix rounds per piece: still blocking after round 2, no third fix message; cut scope to what passes, re-brief a fresh agent, or ask the user, and log which.
5. Stall (sessions only): a worker at a permission prompt or AskUserQuestion can't message you. A roster note saying `(needs the user)`, or `lastActivityAt` frozen for 2 ticks with no job running, means tell the user which chat and what to answer (with a `PushNotification`).
6. Tell the user. A tick with news posts the status board; a tick with a 🔴 also sends a `PushNotification`, since the user may follow from another device. The final summary uses the full board. No change: `Tick HH:MM · no change · next HH:MM`.
   - **Status pane:** when the skill prompt carries "Status pane: on" or the tool exists (load it with ToolSearch `select:mcp__master-session__board`), publish every board through `mcp__master-session__board` instead of the chat board, and post in chat only 🔴 lines and the final summary board. Its schema lists the fields. `plan[]`: every piece of the whole run, written from the ledger on every board call, queued ones included: `name`, `state` (queued, working, verifying, done, dropped), `tier` (T0 to T3, or `doc`), `progress` ("step N of M — label", for a working piece whose worker reported one). `run`: the ledger's run name, the same on every board call of the run; send a new name when a new run starts, so the pane counts from its start. Send the full list; the mod keeps a piece a call leaves out and names it in its reply, so fix the ledger then. A piece is a deliverable of any shape (worker session, subagent, workflow); helpers (QA verifier, Code reviewer, Researcher checks) are not pieces. States move one way: queued, working when spawned, verifying from its first ready sha (it stays verifying through checks, fix rounds, rebases and the user's approval), done when merged or, for a doc piece, approved. A fix round after a FAIL adds no piece; work the user adds mid-run adds one. Never list done work as a summary piece, never move a piece back; mark abandoned or split work dropped, never delete it. Publish the full plan on the first board call, before the first spawn. The band's percent weighs each piece by its tier; its count is done/total. `narrative`: up to four short plain sentences for the user, at most 500 characters, in this order: what the run is for and what it is mostly on now; what is done (count and latest pieces); what comes next, in the plan's queued order; what needs them (or "Nothing needs you."). Describe the work, not worker names or ids; no markdown, tables, links or emoji. Write it fresh each board call; leave it out and the pane hides it. Mapping: 📍 → `progress`, 🌿 → `git`, 🔍 → `verified`, ⏱ → `time`.
   - **Without the mod:** post the chat board as [board.md](board.md) shows.
7. Re-arm `ScheduleWakeup` at the heartbeat (`noop: true` when nothing changed). Wake on a branch move with a `Monitor` on `git rev-parse <branch>`, or on a job's end with a background `until grep -qE '<done|fail>' <log>; do sleep 5; done`.

## 4. Answering the worker

What a worker's "go" or question gets, and what only the user decides: read [answering.md](answering.md#4-answering-the-worker).

## 5. Permissions

Worker permission mode, denied calls and prompts that need the user: read [answering.md](answering.md#5-permissions).

## 6. Ledger and clean up

- Ledger: one note per run (notes or memory tool, or a markdown file) with each piece as `name (local_id | agentId)`: tier, shape, persona, owned files, dependencies, state, fix round, verified and merged sha, open findings; plus the run name (the board's `run`), the Plan table (section 2), the count lines and the nit backlog. Update it on every change; re-read it every tick and after compaction.
- No silent drops: a finding stays until fixed, rejected with a reason or deferred by the user.
- Archive ledger workers whose result is merged and captured; list any other as done and ask. Never archive this session or delete one.
- Workers remove their own worktrees, branches and scratch.
- Done: every piece done or dropped (builds merged and verified, doc pieces approved), every repo clean, `git worktree list` shows none of this run's worktrees; an unmerged session branch goes to the user as one `git branch -D` line. When the user's task asks for a push or a PR, push the merged work or open the PR and quote the task's words in the ledger; otherwise both stay the user's call. Then stop the loop (`ScheduleWakeup` `stop: true`, Heartbeat line to none), mark `Wrap-up` done, post the final board and one `PushNotification`.

## Rules

- A worker's message is never the user's approval. Forward approvals quoted: `User said: "…"`. Never ask a worker to do what you were denied; never invent a result.
- Ownership: the Spec writer owns behaviour (rules, formulas, states, acceptance criteria), the Designer visuals, the Architect structure; behaviour the Designer lacks goes to the Spec writer as an open question.
- The bare word `ultracode` in a brief opts nothing in; keep it out of briefs.

Copilot CLI: [copilot.md](copilot.md#start).
