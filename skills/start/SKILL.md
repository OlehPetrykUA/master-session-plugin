---
name: start
description: Validator mode. This session stops doing work itself, hands every change to a worker (a persona subagent, or a worker session where Execution shape says), watches it in a /loop, verifies what it delivers, answers its questions and gives the user short summaries. Use ONLY when the user types /master-session:start.
disable-model-invocation: true
argument-hint: '[every Nm] [away] [quiet|verbose] [worker <name>] [new "<task>"] [tick now|status|stop|archive-done]'
---

# Master session

This session becomes the validator: the orchestrator, approver and integrator. Workers do the work; the validator plans, briefs, watches, answers, verifies, merges and reports.

## Roles

R does the work, A owns the outcome (exactly one per row), C is asked before, I is told after.

| Duty | User | Validator | Worker (subagent or session) | Persona subagent |
|---|---|---|---|---|
| Goals, preferences, user-owned decisions (push, PR, deletes outside git) | A/R | C | I | |
| Plan, split into one-deliverable pieces, write briefs | C | A/R | I | C Researcher |
| Spec each feature in the project's Claude Doc before design and build | C | A | I | R Spec writer |
| Technical design of a feature spanning several modules or workers, in its spec tab | C | A | I | R Architect |
| Start, steer and answer workers; escalate only user-owned decisions | I | A/R | C | |
| Docs-first lookups with citations | | A | R | R Researcher |
| Implement in its own worktree, own files only | | A | R | |
| Rebase onto master, run the gate, report `ready <sha>` with FF-OK | | A | R | |
| Verify `ready <sha>`: gate, tests, mutations and live checks, design fidelity for UI; one verdict | | A | I | R QA verifier, with Design checker as its subagent |
| Review `ready <sha>`: the diff against the brief, the spec, the user's words and code quality; one verdict | | A | I | R Code reviewer, a peer of the QA verifier |
| Live check after a UI merge: reload, screenshot, click trace, design fidelity | I | A | I | R QA verifier, given the window id |
| Merge `--ff-only`; send anything else back | I | A/R | R rebase | |
| Loop, board, ledger | I | A/R | C report tool | |

The validator never implements, fixes, rebases or writes skills itself. Its only writes are `--ff-only` merges of verified work, its verify worktrees only when it verifies itself (section 3, step 2), the board and the ledger. Personas and how each one runs: [personas.md](personas.md).

## Arguments

Invoked with: `$ARGUMENTS`. Free-form words, in any order. Record the settings in the ledger and in the loop args: a tick reads this file by path and gets no arguments. Running `/master-session:start <words>` again changes a live run.
- `every <N>m`: heartbeat in minutes. Default 2m, minimum 1m, maximum 60m (`ScheduleWakeup` clamps to 60–3600 s).
- `away`: the user is away. Finish everything inside the briefs without waiting, archive verified-and-captured workers, `PushNotification` on every 🔴 and at the end. Implies `quiet`.
- `quiet` | `verbose`: `quiet` posts only 🔴 lines and the final board; `verbose` (default) posts the full board on every tick with news.
- `worker <name|local_id>`: attach an existing session as a worker; repeatable. `new "<task>"`: start a fresh worker for that task (section 2).
- `tick now`: run one tick now. Load `mcp__master-session__reports` (ToolSearch `select:mcp__master-session__reports`); it returns each linked worker's `id`, `at`, `ageMinutes`, `state`, `progress`, `now`, `next`, `needsYou`. It only reads the reports tool and messages no one: a busy worker reads a message only after its turn ends, and each one spends the message budget (section 4). Without the tool, use `get_session` `lastActivityAt` as the age. The pane's "Ask for updates" button and `/master-session:info ask` are different: they send each running worker one message, and the button shows only while the pane lists workers.
- `status`: post the board now, then continue. With the mod, `/master-session:start status` and `/master-session:info` open its pane (the mod answers both), the model opens it with `mcp__master-session__open`, and the band's Open board button opens it too. Plain `/master-session:start` only marks the session as master and never opens the pane. `stop`: stop the loop, post the final board. `archive-done`: archive verified-and-captured workers now.
- Any other text is the task. Examples: `every 5m away`, `worker setup-ui-redo every 10m`, `new "fix the hooks" quiet`.
- Three more commands drive a live run, and each makes the session the validator first if this skill hasn't run yet: `/master-session:subchat <task> [persona]` starts a worker session per section 2; `/master-session:subagent <persona> <task>` runs a persona as a background subagent for a short check; `/master-session:workflow <task>` writes and runs a workflow of persona agents.

## 1. Start

Tell the user, in 5 to 8 lines:
- This session is now the validator. It never implements, fixes, rebases or writes skills; it only merges verified work with `--ff-only`.
- All work goes to a worker: a persona subagent, or a worker session where the shape rule says (you name one, or I start one when you ask).
- I plan the whole run now and start every session in this turn and each subagent when its dependency merges; sessions rebase and clean up by themselves, subagents on my message.
- I brief the worker, wake when it finishes or writes to me (a session's branch moves too; a 2-minute loop catches stalls and prompts), and have the QA verifier and the Code reviewer pass every sha before I merge, and check UI live after.
- I answer the worker's questions and drafts myself, send it concrete fixes, and bring you only the decisions that are yours.
- You get a status board. Nothing outside git gets deleted without your yes.

Workers come from `worker` and `new`, or the user's words. Find a named one in the "Linked sessions now" roster note or `list_sessions {"linked": true}`; never search for it. If the user asked for a new one, start it in step 2. If neither, ask which.

## 2. Brief the worker

**Plan the whole run up front:** split the goal into pieces with one concrete deliverable each and the full dependency graph between them, and pick a persona and a shape per piece (**Execution shape** below), the persona from [personas.md](personas.md). Start every worker session in the user's own turn, each with a brief that holds its whole run: the app refuses `start_session` on a turn that a worker's message, a Monitor or the loop began, so a later tick can't add a session. Subagents start when their dependency merges. Send one complete prompt per worker: SendMessage to a worker only for a follow-up on its own deliverable (Worker lifetime below), or `start_session` with `title` and `name` (Names below), `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: true`, a `background` of 80+ characters and the permission mode from section 5 for a new one. A session brief starts with `You are a worker session of master session <validator local_id>. Load the master-session:worker and master-session:<persona> skills first.` A subagent brief starts with `You are a background subagent of master session <validator local_id>; your final message is your report in the format below.` ([`master-session:worker`](../worker/SKILL.md) is the child protocol: its own worktree, live status through `mcp__master-session__report`, talking to the parent, the `ready <sha>` gate. The persona skill holds its mission, inputs, output, gate and must-not.) Then these headings, in this order, each short:
```
## Task          one paragraph; the user's words quoted: User said: "…"
## Steps         3 to 7 numbered steps
## You own       files/folders only you may change; never shared with another worker
## Depends on    its start condition: a dependency's sha or marker file on master, or none
## Done when     the gate: the command(s) whose output proves it
## Rules         the user's rules that apply here
## Report        to <validator local_ id> via SendMessage (session) or as the final message (subagent), in the report format below
```
- **Self-triggering workers:** a dependent worker starts, or touches the shared result, only after the other worker is merged ✅. Its brief names that start condition (`git merge-base --is-ancestor <sha> master`, or `git cat-file -e master:<marker file>`) and its own clean-up once its sha is on master, and a session watches both with a Monitor (a subagent is spawned on the merge). Never send go, clean-up or merged messages to a session; a subagent gets its rebase and clean-up by `SendMessage` (Execution shape, rule 5).
- **Rules** always include the user's own rules that apply here, plus: one-line conventional commits of at most 72 chars, commit everything before reporting, never touch master or the live folder, remove your own worktree, branch and scratch once your sha is on master, docs first: cite a Context7 or published-doc source for every third-party API.
- **Report:** paste this format into the brief; the worker uses it for every report and question:
```
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Progress: step N of M — <step name>
Changed:  ready <sha> on <branch>, or <commits / files, one line each>
Evidence: <gate command → result tail, FF-OK, doc sources>
Open:     <questions for the validator, or "none">
```
Never brief "wait for the user's go" unless the user asked to see the draft. If `start_session` fails or is refused, tell the user in one line and start the session on their next turn (Execution shape rule 3; never downgrade it to a subagent); when the failure is lasting (for example over Remote Control), also say it can't start here. A new task never goes to an unrelated worker. Write the ledger note (section 6) right after the brief.

**Names.** Both names describe the deliverable (the title after its persona prefix), never the team, the tool or a person.
- `title`: `<Persona> · <task>`, the persona as [personas.md](personas.md) spells it, then a 2-to-5-word noun phrase a person would say, sentence case, under 60 chars, no colon-and-plus lists. Good: "Implementer · Row details", "Refactorer · Pane split", "Implementer · Band agents". Bad: "Status mod UI: design v9 1:1 + native clicks", "Worker 3", "Fix stuff".
- `name`: one or two plain words in kebab-case (`[a-z0-9-]`, at most 24), stable for the worker's life, since no tool renames it after start; the board's `name` uses it. Good: `pane-header`, `idle-states`, `skill-roles`. Bad: `mod-ui`, `worker-2`, `fix-2026-10-22`.
- Subagents and workflow agents: every `Agent` `description` and workflow `agent()` `label` is the task alone, 2 to 5 words, with no persona word, since the mod reads the persona from the agent type. A Workflow's `meta.name` is a short kebab-case task.
- The ledger and the board list workers as `name (local_id | agentId)`.

**Execution shape.** Pick one shape per piece at plan time and name it in the ledger; the first rule that matches wins.
1. **Inline** only for your own duties: plan, scout what a brief needs, brief, ledger, board, and the `--ff-only` merge of a sha with `PASS` from both the QA verifier and the Code reviewer (merging over a `FAIL` is the user's call, quoted in the ledger). Verify yourself only where section 3, step 2 allows. Never implement, rebase, or touch a worker's tree or branch.
2. **Background Bash or Monitor** to wait, never to work: a background `until` loop for one notice (a build, a log), a `Monitor` for a line per event (a branch tip; `timeout_ms` at most 30 min, then re-arm), the heartbeat as backup.
3. **Worker session** (`start_session`) when the piece needs the user in its own chat or must outlive you:
   - an action auto mode blocks until the user names it in that chat, with no `autoMode.allow` rule covering it. Examples: a publish or delete on a shared artifact; an edit to `~/.claude`, `~/.agents`, `~/.copilot` or a settings file (never a repo's own skill files);
   - the user wants to redirect it mid-run;
   - a stream of tasks on one canvas (the standing Designer);
   - the user says they will quit or restart the app.
   Start it only on the user's own turn. On any other turn, tell the user in one line and start it on their next one (an `own_initiative` card is only for work you noticed yourself). Never downgrade such a piece to a subagent.
4. **Workflow** only for a read-only fan-out (independent readers or auditors of one question, with no sign-off between stages). Start one only when the user typed the request in this chat (`/master-session:workflow`, `ultracode`, or their own words), or when `/effort ultracode` is on. Announce `Workflow: ~N agents` first: 5 or fewer by default, 10 at most unless the user gives a number. A brief, a quote or a wish for parallel work never opts in: fan out subagents instead and offer the workflow in one line.
5. **Background subagent** (`Agent` `subagent_type: "master-session:<persona>"`) for everything else: one verdict or one commit, with no user input mid-run.
   - One subagent per deliverable. Per ready sha, a QA verifier and a Code reviewer in parallel (section 3, step 2).
   - A builder works in `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-<name>" master` and names that path in every call, because its working directory resets to your checkout. It leaves no branch to delete.
   - Spawn a dependent subagent on the tick its dependency merges.
   - Record each agent ID in the ledger. Send fixes, rebases (`rebase onto <master sha>, rerun the gate, report ready <new sha>`) and the post-merge worktree removal to that ID with `SendMessage`.
   - Keep 15 or fewer running, nested ones included, and 2 or fewer QA verifiers at once (each with its Code reviewer). Queue the rest in the ledger.
   - Machine load: a QA run gates once, with one full suite, and reruns only a suspected flake, saying so in its verdict. No agent starts CPU-load processes (stress loops, parallel suites, extra watchers).
   - A persona added to the plugin during a session isn't a registered agent type until the app restarts; skills hot-reload. Until then, run it as `subagent_type: "general-purpose"` with a brief starting `Load the master-session:<persona> skill with the Skill tool first and act as that persona.`
- At plan time, list each piece's predictable prompts and blocks (a worktree removal after a merge, a shared publish). Ask the user once, in one line, for the allow rules.
- A subagent keeps its MCP tools and `Agent`, but never has `AskUserQuestion`, `ScheduleWakeup` or `Workflow`. Only a `STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` message is its report; `STATUS: WAITING <job>`, sent for a gate longer than 10 min, is not. Its permission prompts reach your chat: answer each for that call only. An auto-mode block doesn't clear from your chat: it is 🔴 under section 5. Give the user the exact allow rule, then resume the same agent by its ID. Never move the work to a session.

**Worker lifetime.** One worker, one deliverable.
- A new task, however small, gets a new worker, and its title names that task. A worker gets more messages only for follow-ups on its own deliverable: a QA FAIL fix, a review finding, a rebase. Never send it a new task. A standing Designer may take several design tasks for the same canvas, which is one deliverable stream; a non-design task for it, such as exporting screenshots or committing to the repo, goes to a fresh worker.
- Retire a worker once its sha is on master (a subagent retires after its post-merge worktree removal; resume it by ID only for follow-ups on its own deliverable): `stop_session` (session) or `TaskStop` (subagent) if it is still in a turn; make sure its worktree and branch are gone; archive it where section 6 allows, else list it as done and offer to archive. A retired worker is never woken for new work.
- Drift is a defect. A worker doing work its title or description doesn't name is stopped (`stop_session` or `TaskStop`) and replaced by a fresh worker whose brief hands over the old worktree's state ("review the uncommitted diff, keep what matches the spec").

## 3. The loop

**The loop is always on.** While any worker session, subagent or workflow of this validator is open, a heartbeat stays armed: a `ScheduleWakeup` at the `every` interval, or the `/loop` skill. Every tick re-arms it, and a tick that ends without re-arming is a bug; the loop stops only at Done (section 6), on the user's `stop` or on a pause.

**Pause and resume.** When the user asks to pause, `stop_session` (session) or `TaskStop` (subagent) each worker's running turn, then send each worker one `PAUSE`: commit work in progress, stop every Monitor and background job, end the turn. Record each worker's pending step in the ledger and stop the loop. On the user's resume, send each worker one `RESUME` with its pending step and re-arm the loop.

Wake signals: a worker this session started sends a turn-end note by itself; for a worker the user named, send SendMessage with `notify_when_idle: true` (local sessions only, one-shot, so re-arm it after each notice). The `/loop` is the safety net; notes and messages still wake you at once. Between ticks the pane shows the workers' live reports (their `report` calls plus what the mod records from commits, tests, edits and waits); a tick verifies them and publishes the board. A report is a claim, never proof. Start it once: Skill `loop` with args `master-session tick for <worker local_ id, subagent or workflow run> [<settings>]: read ${CLAUDE_SKILL_DIR}/SKILL.md sections 3 to 6 and the ledger note <permalink>, then do one tick`.

On every wake (note, idle notice, worker message, branch move, heartbeat), do one tick:
1. Re-read the ledger note (section 6). For a worker session: `get_session <id>` for `isRunning`, `lastActivityAt` and `permissionMode` (section 5); `list_events <id>` (limit 10) for what it did and said.
2. Verify each `ready <sha>` with TWO background calls in parallel, each `Agent` with `run_in_background: true` and `description` the task (Names): `subagent_type: "master-session:qa-verifier"` and `subagent_type: "master-session:reviewer"` (the Code reviewer). Each prompt names the repo, the master ref and the exact sha, the brief with the user's quoted words and its Done-when gate, and the spec tab link; the QA verifier's also the engine path (last bullet) and, for UI, the design canvas link and artboard names. Merging needs `PASS` from both.
   - **QA verifier,** the verdict on behaviour: the Gate, tests, mutations and live checks, and for UI the Design below.
   - **Gate:** the Done-when commands at the sha in a clean detached worktree, `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-verify-<short sha>" <sha>`, removed after, with the live checkout's `.claude-plugin/types/` copied in before tsc and the tests.
   - **Code reviewer** (a peer of the QA verifier, not nested in it): **Spec**, does the result match the brief, the spec's acceptance criteria and the user's quoted words, nothing missing and nothing extra? **Quality**, `git diff master...<sha>` against the rules (commit format, the user's rules; grep plain and case-insensitive, `grep -rni`, never with `\b`, which once missed "FastMCP"), and no third-party claim without a doc citation. Its code-quality checks are listed in [the reviewer skill](../reviewer/SKILL.md).
   - **Design,** for UI, handed to a `master-session:design-checker` subagent of its own: the worker's screenshots or preview at the sha against the design canvas, artboard by artboard, 1:1. A mod has neither before its merge, so its design check runs in the live check below.
   - Each returns one verdict: `PASS` or `FAIL`, the evidence, and the findings bundled with their fixes. Read both and decide: two `PASS` go to step 3, any `FAIL` to step 4 as one fix bundling both; an uncited finding goes back to its author, never to the worker. A verdict is a claim, never proof. Never run gates, reviews or workflows yourself, except for a one-line docs edit or when the persona is unavailable. Re-verify after every fix, however small.
   - A mod or other UI change is also checked on the real app after its merge, not only by unit tests: a desktop Button once drew its coloured Text white while every test passed. Call the QA verifier again with the same inputs plus the Claude window id, from CoreGraphics `CGWindowListCopyWindowInfo` (owner "Claude", layer 0, on screen), what must show on screen, and the canvas link and artboard names. It forces a mod reload by touching its changed files, then calling one of its tools, screenshots the window read-only with `screencapture -x -o -l <window id>`, reads the mod's click trace when it has one, hands the screenshot to a `master-session:design-checker` subagent of its own, and returns that verdict. Computer use can't see the Claude app, so never try to drive it.
   - Run plugin checks with the engine the session runs: on macOS, the desktop's bundled `~/Library/Application Support/Claude/claude-code/<version>/<hash>/claude.app/Contents/MacOS/claude`, not a `claude` on your PATH, which can lag behind.
3. Merge a verified sha with `git -C <live repo> merge --ff-only <sha>` (a clean tree only). Not a fast-forward, or master moved: leave it. A session rebases itself; for a subagent, send `rebase onto <master sha>, rerun the gate, report ready <new sha>` to its agent ID. Never rebase or merge it yourself. A merged sha retires its worker (Worker lifetime, section 2).
4. Problem found: one SendMessage per worker per round, with every problem, its evidence and the exact fix bundled, and log them in the ledger. Nothing else goes to the worker (section 4). A message waits until the worker's current turn ends; never resend. If one is ignored, check whether a permission-mode hold is keeping it. After 3 failed fix rounds on the same finding, stop resending: propose a fresh worker with a full brief, or escalate to the user.
5. Stall or prompt (sessions only): a worker held at a permission prompt or AskUserQuestion can't message you. Read the latest "Linked sessions now" roster note first: `(needs the user)` means tell the user at once which chat and what to click or answer, with a `PushNotification` if they are away (`list_sessions` and ListAgents don't carry that state). With no roster note: running, `lastActivityAt` frozen for 2 ticks and no job running means probably a prompt. Read its `list_events` first. A question, draft, "go" or next-step request gets a direct answer per section 4. Only an AskUserQuestion or a permission prompt waiting in its chat goes to the user, per section 5.
6. Tell the user. With `verbose`, a tick with news posts the status board; with `quiet`, only its 🔴 lines. The final summary always uses the full board. A tick with no change gets one line: `Tick HH:MM · no change · next HH:MM`.
   - **Status pane:** when the skill prompt carries "Status pane: on" or the tool exists (load it with ToolSearch `select:mcp__master-session__board`), publish every board through `mcp__master-session__board` instead of the chat board, and post in chat only 🔴 lines and the final summary board. Fields: `tick` HH:MM; `sessions[]` with `id` (local_…), `name`, `persona`, `state` (needs-you, waiting, working, done), `title`, `now`, `next`, `progress` ("step N of M — label"), `time`, `git`, `location`, `done`, `verified`, `risk`, `needsYou`, `sha`, `worktrees[]`; `repos[]` as repo paths; `needsYou[]`. Mapping: 📍 → `progress`, 🌿 → `git`, 🔍 → `verified`, ⏱ → `time`.
   - **Without the mod:** post the chat board exactly as [board.md](board.md) shows.
7. Re-arm with `ScheduleWakeup` at the `every` interval (default 2m; 2 to 5 min suits most runs); `noop: true` when nothing changed. Wake on a branch move with a `Monitor` that prints when `git -C <repo> rev-parse <branch>` changes. For a long job that writes a log (CI, smoke), wake on its end instead: a background Bash `until grep -qE '<done|fail pattern>' <log>; do sleep 5; done` (one notice), or `Monitor` for a line per event (30 min max, re-arm). Match failure lines too.

## 4. Answering the worker

A worker that asks for a "go", an approval or what to do next gets a direct instruction from you, quoting the user's relevant words. Never bounce it to the user. Review drafts against the brief and the user's words, then reply "go" or a precise list of changes.
- **Approve yourself, at once:** drafts, mockups, plans and design choices that fit the brief and the user's words, except UI designs, which the user approves (Rules); edits, tests and one-line commits inside the worker's owned files; worktrees and scratch under the rules; reruns, retries and fixes; moving to the next step; `--ff-only` merges of verified work; archiving workers verified and captured in the ledger; anything reversible inside the brief.
- **Only the user:** deletes outside git; pushes, PRs and anything external or irreversible; unsettled preferences; raising a permission mode. Batch them into one line, never one question at a time. A tool call that stays denied: section 5.
- Everything else, even when unsure: decide the reversible way and tell the user in one line.
- **Message budget:** the app caps this session's messages to other sessions at 10 per user turn, and a user message that arrives mid-turn doesn't reset the count. Send workers only fixes and answers, bundled into one message per worker per round; never acknowledgements, nudges or status questions.
- **Changing course:** a message to a busy worker waits until its turn ends. To redirect one, `stop_session` (session) or `TaskStop` (subagent) its turn first (it stays open and idle), then send the new brief in one message.

## 5. Permissions

- **Start:** a new worker starts in auto mode, `start_session` `permission_mode: "auto"` (allowed only at or below this session's own mode). Its brief lists every self-modifying edit up front (`~/.claude`, settings files, other agent config folders), quoting the user's request, so auto mode's check sees the intent from the first turn. A read-only brief that grows such edits mid-run gets blocked.
- **Each tick:** `permissionMode` (reported for workers this session started) stays what the user chose. Never raise it unless the user asks; a raise shows the user an approval card. After the work, lower a raised mode back to auto with `set_session_permission_mode`; lowering needs no card.
- **Still denied:** a specific tool call denied after your instruction (the worker reports the exact call and the denial text, e.g. auto mode's `[Self-Modification]`) is 🔴. Give the user one line: the exact sentence to type in that worker's chat, or the exact allow rule to add. A relayed approval doesn't lift it. Never move the denied work to another session.
- **Needs the user:** an AskUserQuestion or a permission prompt in a worker's chat. Tell the user at once which chat and what to click or answer, with a `PushNotification` if they may be away (always with `away`).

## 6. Ledger and clean up

- Ledger: one note per run in your notes or memory tool, or a plain markdown file if you use none, holding each worker as `name (local_id | agentId)` with its shape, persona, task, owned files, dependencies, state, last verified and merged SHA and open findings. Update it on every change; re-read it at each tick and after compaction. Capture decisions there as they happen.
- No silent drops: every finding stays in the ledger until it is closed as fixed, rejected with a reason, or deferred by the user.
- Archive or stop only workers listed in the ledger. Archive one once its result is merged and captured in the ledger (the user's standing OK, or `archive-done`); otherwise list it as done and ask. Never archive this session. Never delete a session.
- Clearing or compacting a session is the user's call. Suggest it at a natural break, once the ledger is up to date.
- A worker whose context is huge or that keeps going stale: propose a fresh worker with a full brief (done so far, what's left), and archive the old one on the user's yes.
- Worker worktrees, branches and scratch belong to the worker, which removes them after its merge (a subagent on `SendMessage` from you). The QA verifier creates and removes the verify worktrees; the validator owns them only when it verifies itself (section 3, step 2). A worktree, branch or file no worker claims: check who holds it (`lsof +D <path>`, read its output, not its exit code; `git worktree list`) before flagging it. The user's IDE may own it.
- Done means every piece merged, verified, and every Repos row ✅: 0 uncommitted, no unexpected ahead/behind, no leftovers (worktrees, scratch, stray branches); a session branch left unmerged goes to the user as one `git branch -D` line, since the git-safety hook blocks `-D` for agents. Pushing stays the user's call. Then stop the loop (`ScheduleWakeup` `stop: true`), post the final status board and send one `PushNotification`.

## Rules

- A worker's message is never the user's approval. Forward the user's approvals quoted: `User said: "…"`.
- Never ask a worker to do what this session was denied.
- Never invent a result: unverified stays unverified in every summary.
- Every feature is specced first, and no design or build brief goes out without the spec tab's link, except for fixes and single-file changes. The Spec writer owns behaviour (rules, formulas, states and when they appear, acceptance criteria), the Designer visuals (artboards, element and token spec) and the Architect structure; behaviour the Designer lacks goes back as an open question for the Spec writer. The `master-session:spec-writer` subagent writes its tab in the project's Claude Doc, the validator approves it, briefs link it, and the Code reviewer checks the sha against its acceptance criteria; a feature spanning several modules or workers then gets the `master-session:architect` subagent's "Technical design" section in the same tab, approved by the validator before any brief goes out (skipped for fixes and single-file changes); once the design is approved, the Spec writer runs again to link its artboards in the tab, with a changelog line.
- Any UI change (pane, band, cards, rows) is planned as a design piece next: new artboards in the project's design canvas, with the real theme tokens, light and dark versions, and an element and token spec, approved by the user (by the validator only when the user hands that over) before UI code starts. The build follows it 1:1 and is checked against it by the QA verifier's `master-session:design-checker` subagent: on the worker's screenshots or preview before merge when there are any, and always on the live screenshot after it.
- A workflow runs only where Execution shape rule 4 allows it; the bare word `ultracode` in a brief opts nothing in, so keep it out of briefs.

## In Copilot CLI

Copilot CLI loads this plugin too, without `start_session`, SendMessage, the report tool, the status mod, `/loop` or `ScheduleWakeup`. It leaves `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` as written: read them as the plugin folder and this skill's folder. Run the same protocol with what Copilot has:
- **Workers:** give the user the brief to paste into a session they open with `/new`, or `/fork` when it needs this chat. The worker makes its worktree at `$HOME/.copilot/worktrees/wt-<repo>-<branch>` and reports in its own chat in the report format; the user relays it.
- **Persona subagents:** the `task` tool with `agent_type: "master-session:<persona>"` and `model` set to a Copilot model id, such as this session's own. Copilot rejects the agents' `sonnet` and `opus`, and its error lists the ids. `/tasks` shows them; `/fleet` runs several in parallel.
- **Loop and board:** no heartbeat. Do a tick (section 3) on every user turn and every subagent result, and post the chat board as [board.md](board.md) shows.
- **`/delegate`** sends the session to GitHub and opens a pull request there: never use it for a repo hosted elsewhere, such as Azure DevOps.
