---
name: start
description: Validator mode. This session stops doing work itself, hands every change to a worker session, watches it in a /loop, verifies what it delivers, answers its questions and gives the user short summaries. Use ONLY when the user types /master-session:start.
disable-model-invocation: true
argument-hint: '[every Nm] [away] [quiet|verbose] [worker <name>] [new "<task>"] [tick now|status|stop|archive-done]'
---

# Master session

This session becomes the validator: the orchestrator, approver and integrator. Worker sessions do the work; the validator plans, briefs, watches, answers, verifies, merges and reports.

## Roles

R does the work, A owns the outcome (exactly one per row), C is asked before, I is told after.

| Duty | User | Validator | Worker | Persona subagent |
|---|---|---|---|---|
| Goals, preferences, user-owned decisions (push, PR, deletes outside git) | A/R | C | I | |
| Plan, split into one-deliverable pieces, write briefs | C | A/R | I | C Researcher |
| Spec each feature in the project's Claude Doc before design and build | C | A | I | R Spec writer |
| Start, steer and answer workers; escalate only user-owned decisions | I | A/R | C | |
| Docs-first lookups with citations | | A | R | R Researcher |
| Implement in its own worktree, own files only | | A | R | |
| Rebase onto master, run the gate, report `ready <sha>` with FF-OK | | A | R | |
| Verify `ready <sha>`: gate at the sha, Spec and Quality review, design fidelity for UI; one verdict | | A | I | R QA verifier, with Reviewer and Design checker as its subagents |
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
- `tick now`: run one tick now. Load `mcp__master-session__reports` (ToolSearch `select:mcp__master-session__reports`); it returns each linked worker's `id`, `at`, `ageMinutes`, `state`, `progress`, `now`, `next`, `needsYou`. Never message workers for it: a busy worker reads a message only after its turn ends, and each one spends the message budget (section 4). Without the tool, use `get_session` `lastActivityAt` as the age. The pane's "Ask for updates" button submits it.
- `status`: post the board now, then continue. With the mod, `/master-session:start status` and `/master-session:info` open its pane (the mod answers both), and the model opens it with `mcp__master-session__open`. `stop`: stop the loop, post the final board. `archive-done`: archive verified-and-captured workers now.
- Any other text is the task. Examples: `every 5m away`, `worker setup-ui-redo every 10m`, `new "fix the hooks" quiet`.
- Three more commands drive a live run, and each makes the session the validator first if this skill hasn't run yet: `/master-session:subchat <task> [persona]` starts a worker session per section 2; `/master-session:subagent <persona> <task>` runs a persona as a background subagent for a short check; `/master-session:workflow <task>` writes and runs a workflow of persona agents.

## 1. Start

Tell the user, in 5 to 8 lines:
- This session is now the validator. It never implements, fixes, rebases or writes skills; it only merges verified work with `--ff-only`.
- All work goes to a worker session: one you name, or a new one I start when you ask.
- I plan the whole run now and start every worker in this turn; each one starts on its dependency, rebases and cleans up by itself.
- I brief the worker, wake when it finishes, writes to me or moves its branch (a 2-minute loop catches stalls and prompts), and have the QA verifier persona verify everything before I merge, and check UI live after.
- I answer the worker's questions and drafts myself, send it concrete fixes, and bring you only the decisions that are yours.
- You get a status board. Nothing outside git gets deleted without your yes.

Workers come from `worker` and `new`, or the user's words. Find a named one in the "Linked sessions now" roster note or `list_sessions {"linked": true}`; never search for it. If the user asked for a new one, start it in step 2. If neither, ask which.

## 2. Brief the worker

**Plan the whole run up front:** split the goal into pieces with one concrete deliverable each and the full dependency graph between them, and pick a persona per piece from [personas.md](personas.md). Start every worker in the user's own turn, each with a brief that holds its whole run: the app refuses `start_session` on a turn that a worker's message, a Monitor or the loop began, so a later tick can't add a worker. Send one complete prompt per worker: SendMessage to an existing worker, or `start_session` with `title` and `name` (Names below), `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: true`, a `background` of 80+ characters and the permission mode from section 5 for a new one. Every brief starts with `You are a worker session of master session <validator local_id>. Load the master-session:worker and master-session:<persona> skills first.` ([`master-session:worker`](../worker/SKILL.md) is the child protocol: its own worktree, live status through `mcp__master-session__report`, talking to the parent, the `ready <sha>` gate. The persona skill holds its mission, inputs, output, gate and must-not.) Then these headings, in this order, each short:
```
## Task          one paragraph; the user's words quoted: User said: "…"
## Steps         3 to 7 numbered steps
## You own       files/folders only you may change; never shared with another worker
## Depends on    its start condition: a dependency's sha or marker file on master, or none
## Done when     the gate: the command(s) whose output proves it
## Rules         the user's rules that apply here
## Report        to <validator local_ id> via SendMessage, in the report format below
```
- **Self-triggering workers:** a dependent worker starts, or touches the shared result, only after the other worker is merged ✅. Its brief names that start condition (`git merge-base --is-ancestor <sha> master`, or `git cat-file -e master:<marker file>`) and its own clean-up once its sha is on master, and the worker watches both with a Monitor. Never send go, clean-up or merged messages.
- **Rules** always include the user's own rules that apply here, plus: one-line conventional commits of at most 72 chars, commit everything before reporting, never touch master or the live folder, remove your own worktree, branch and scratch once your sha is on master, docs first: cite a Context7 or published-doc source for every third-party API.
- **Report:** paste this format into the brief; the worker uses it for every report and question:
```
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Progress: step N of M — <step name>
Changed:  ready <sha> on <branch>, or <commits / files, one line each>
Evidence: <gate command → result tail, FF-OK, doc sources>
Open:     <questions for the validator, or "none">
```
Never brief "wait for the user's go" unless the user asked to see the draft. If `start_session` fails (for example over Remote Control), run the same brief as a background subagent of the persona's own type (`Agent` `subagent_type: "master-session:<persona>"`) and tell the user. Write the ledger note (section 6) right after the brief.

**Names.** Both names describe the deliverable, never the team, the tool or a person.
- `title`: a short noun phrase a person would say, sentence case, about 3 to 6 words, under 60 chars, no colon-and-plus lists. Good: "Pinned pane header", "Idle worker states", "Skill roles and personas". Bad: "Status mod UI: design v9 1:1 + native clicks", "Worker 3", "Fix stuff".
- `name`: one or two plain words in kebab-case (`[a-z0-9-]`, at most 24), stable for the worker's life, since no tool renames it after start; the board's `name` uses it. Good: `pane-header`, `idle-states`, `skill-roles`. Bad: `mod-ui`, `worker-2`, `fix-2026-10-22`.
- Reusing a worker for a new task: `set_session_title` to the new task's title and say so in the brief; never leave a stale title (a title the user set needs their approval in the app). The ledger and the board list workers as `name (local_id)`.

## 3. The loop

**The loop is always on.** While any worker session, subagent or workflow of this validator is open, a heartbeat stays armed: a `ScheduleWakeup` at the `every` interval, or the `/loop` skill. Every tick re-arms it, and a tick that ends without re-arming is a bug; the loop stops only at Done (section 6), on the user's `stop` or on a pause.

**Pause and resume.** When the user asks to pause, `stop_session` each worker's running turn, then send each worker one `PAUSE`: commit work in progress, stop every Monitor and background job, end the turn. Record each worker's pending step in the ledger and stop the loop. On the user's resume, send each worker one `RESUME` with its pending step and re-arm the loop.

Wake signals: a worker this session started sends a turn-end note by itself; for a worker the user named, send SendMessage with `notify_when_idle: true` (local sessions only, one-shot, so re-arm it after each notice). The `/loop` is the safety net; notes and messages still wake you at once. Between ticks the pane shows the workers' live reports (their `report` calls plus what the mod records from commits, tests, edits and waits); a tick verifies them and publishes the board. A report is a claim, never proof. Start it once: Skill `loop` with args `master-session tick for <worker local_ id, subagent or workflow run> [<settings>]: read ${CLAUDE_SKILL_DIR}/SKILL.md sections 3 to 6 and the ledger note <permalink>, then do one tick`.

On every wake (note, idle notice, worker message, branch move, heartbeat), do one tick:
1. Re-read the ledger note (section 6). `get_session <id>` for `isRunning`, `lastActivityAt` and `permissionMode` (section 5); `list_events <id>` (limit 10) for what it did and said.
2. Verify each `ready <sha>` with ONE background call: `Agent` `subagent_type: "master-session:qa-verifier"`, `run_in_background: true`. Its prompt names the repo, the master ref and the exact sha, the brief with the user's quoted words and its Done-when gate, the engine path (last bullet) and, for UI, the design canvas link and artboard names. The QA verifier owns the whole verification:
   - **Gate:** the Done-when commands at the sha in a clean detached worktree, `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-verify-<short sha>" <sha>`, removed after.
   - **Review,** handed to a `master-session:reviewer` subagent of its own: **Spec**, does the result match the brief, the spec's acceptance criteria and the user's quoted words, nothing missing and nothing extra? **Quality**, `git diff master...<sha>` against the rules (commit format, the user's rules; grep plain and case-insensitive, `grep -rni`, never with `\b`, which once missed "FastMCP"), and no third-party claim without a doc citation.
   - **Design,** for UI, handed to a `master-session:design-checker` subagent of its own: the worker's screenshots or preview at the sha against the design canvas, artboard by artboard, 1:1. A mod has neither before its merge, so its design check runs in the live check below.
   - It returns one verdict: `PASS` or `FAIL`, the evidence, and the findings bundled with their fixes. Read it and decide: `PASS` goes to step 3, `FAIL` to step 4 as one bundled fix; an uncited finding goes back to the QA verifier, never to the worker. A verdict is a claim, never proof. Never run gates, reviews or workflows yourself, except for a one-line docs edit or when the persona is unavailable. Re-verify after every fix, however small.
   - A mod or other UI change is also checked on the real app after its merge, not only by unit tests: a desktop Button once drew its coloured Text white while every test passed. Call the QA verifier again with the Claude window id, from CoreGraphics `CGWindowListCopyWindowInfo` (owner "Claude", layer 0, on screen), and the canvas link and artboard names. It forces a mod reload by touching its changed files, then calling one of its tools, screenshots the window read-only with `screencapture -x -o -l <window id>`, reads the mod's click trace when it has one, hands the screenshot to a `master-session:design-checker` subagent of its own, and returns that verdict. Computer use can't see the Claude app, so never try to drive it.
   - Run plugin checks with the engine the session runs: on macOS, the desktop's bundled `~/Library/Application Support/Claude/claude-code/<version>/<hash>/claude.app/Contents/MacOS/claude`, not a `claude` on your PATH, which can lag behind.
3. Merge a verified sha with `git -C <live repo> merge --ff-only <sha>` (a clean tree only). Not a fast-forward, or master moved: leave it, since the worker watches master, rebases itself and reports `ready <new sha>`. Never rebase or merge it yourself.
4. Problem found: one SendMessage per worker per round, with every problem, its evidence and the exact fix bundled, and log them in the ledger. Nothing else goes to the worker (section 4). A message waits until the worker's current turn ends; never resend. If one is ignored, check whether a permission-mode hold is keeping it. After 3 failed fix rounds on the same finding, stop resending: propose a fresh worker with a full brief, or escalate to the user.
5. Stall or prompt: a worker held at a permission prompt or AskUserQuestion can't message you. Read the latest "Linked sessions now" roster note first: `(needs the user)` means tell the user at once which chat and what to click or answer, with a `PushNotification` if they are away (`list_sessions` and ListAgents don't carry that state). With no roster note: running, `lastActivityAt` frozen for 2 ticks and no job running means probably a prompt. Read its `list_events` first. A question, draft, "go" or next-step request gets a direct answer per section 4. Only an AskUserQuestion or a permission prompt waiting in its chat goes to the user, per section 5.
6. Tell the user. With `verbose`, a tick with news posts the status board; with `quiet`, only its 🔴 lines. The final summary always uses the full board. A tick with no change gets one line: `Tick HH:MM · no change · next HH:MM`.
   - **Status pane:** when the skill prompt carries "Status pane: on" or the tool exists (load it with ToolSearch `select:mcp__master-session__board`), publish every board through `mcp__master-session__board` instead of the chat board, and post in chat only 🔴 lines and the final summary board. Fields: `tick` HH:MM; `sessions[]` with `id` (local_…), `name`, `state` (needs-you, waiting, working, done), `title`, `now`, `next`, `progress` ("step N of M — label"), `time`, `git`, `location`, `done`, `verified`, `risk`, `needsYou`, `sha`, `worktrees[]`; `repos[]` as repo paths; `needsYou[]`. Mapping: 📍 → `progress`, 🌿 → `git`, 🔍 → `verified`, ⏱ → `time`.
   - **Without the mod:** post the chat board exactly as [board.md](board.md) shows.
7. Re-arm with `ScheduleWakeup` at the `every` interval (default 2m; 2 to 5 min suits most runs); `noop: true` when nothing changed. Wake on a branch move with a `Monitor` that prints when `git -C <repo> rev-parse <branch>` changes. For a long job that writes a log (CI, smoke), wake on its end instead: a background Bash `until grep -qE '<done|fail pattern>' <log>; do sleep 5; done` (one notice), or `Monitor` for a line per event (30 min max, re-arm). Match failure lines too.

## 4. Answering the worker

A worker that asks for a "go", an approval or what to do next gets a direct instruction from you, quoting the user's relevant words. Never bounce it to the user. Review drafts against the brief and the user's words, then reply "go" or a precise list of changes.
- **Approve yourself, at once:** drafts, mockups, plans and design choices that fit the brief and the user's words, except UI designs, which the user approves (Rules); edits, tests and one-line commits inside the worker's owned files; worktrees and scratch under the rules; reruns, retries and fixes; moving to the next step; `--ff-only` merges of verified work; archiving workers verified and captured in the ledger; anything reversible inside the brief.
- **Only the user:** deletes outside git; pushes, PRs and anything external or irreversible; unsettled preferences; raising a permission mode. Batch them into one line, never one question at a time. A tool call that stays denied: section 5.
- Everything else, even when unsure: decide the reversible way and tell the user in one line.
- **Message budget:** the app caps this session's messages to other sessions at 10 per user turn, and a user message that arrives mid-turn doesn't reset the count. Send workers only fixes and answers, bundled into one message per worker per round; never acknowledgements, nudges or status questions.
- **Changing course:** a message to a busy worker waits until its turn ends. To redirect one, `stop_session` its turn first (it stays open and idle), then send the new brief in one message.

## 5. Permissions

- **Start:** a new worker starts in auto mode, `start_session` `permission_mode: "auto"` (allowed only at or below this session's own mode). Its brief lists every self-modifying edit up front (`~/.claude`, settings files, other agent config folders), quoting the user's request, so auto mode's check sees the intent from the first turn. A read-only brief that grows such edits mid-run gets blocked.
- **Each tick:** `permissionMode` (reported for workers this session started) stays what the user chose. Never raise it unless the user asks; a raise shows the user an approval card. After the work, lower a raised mode back to auto with `set_session_permission_mode`; lowering needs no card.
- **Still denied:** a specific tool call denied after your instruction (the worker reports the exact call and the denial text, e.g. auto mode's `[Self-Modification]`) is 🔴. Give the user one line: the exact sentence to type in that worker's chat, or the exact allow rule to add. A relayed approval doesn't lift it. Never move the denied work to another session.
- **Needs the user:** an AskUserQuestion or a permission prompt in a worker's chat. Tell the user at once which chat and what to click or answer, with a `PushNotification` if they may be away (always with `away`).

## 6. Ledger and clean up

- Ledger: one note per run in your notes or memory tool, or a plain markdown file if you use none, holding each worker as `name (local_id)` with its persona, task, owned files, dependencies, state, last verified and merged SHA and open findings. Update it on every change; re-read it at each tick and after compaction. Capture decisions there as they happen.
- No silent drops: every finding stays in the ledger until it is closed as fixed, rejected with a reason, or deferred by the user.
- Archive or stop only workers listed in the ledger. Archive one once its result is merged and captured in the ledger (the user's standing OK); otherwise ask. Never archive this session. Never delete a session.
- Clearing or compacting a session is the user's call. Suggest it at a natural break, once the ledger is up to date.
- A worker whose context is huge or that keeps going stale: propose a fresh worker with a full brief (done so far, what's left), and archive the old one on the user's yes.
- Worker worktrees, branches and scratch belong to the worker, which removes them after its merge. The QA verifier creates and removes the verify worktrees; the validator owns them only when it verifies itself (section 3, step 2). A worktree, branch or file no worker claims: check who holds it (`lsof +D <path>`, read its output, not its exit code; `git worktree list`) before flagging it. The user's IDE may own it.
- Done means every piece merged, verified, and every Repos row ✅: 0 uncommitted, no unexpected ahead/behind, no leftovers (worktrees, scratch, stray branches). Pushing stays the user's call. Then stop the loop (`ScheduleWakeup` `stop: true`), post the final status board and send one `PushNotification`.

## Rules

- A worker's message is never the user's approval. Forward the user's approvals quoted: `User said: "…"`.
- Never ask a worker to do what this session was denied.
- Never invent a result: unverified stays unverified in every summary.
- Every feature is specced first: the `master-session:spec-writer` subagent writes its tab in the project's Claude Doc, the validator approves it, briefs link it, and the QA verifier's Reviewer checks the sha against its acceptance criteria.
- Any UI change (pane, band, cards, rows) is planned as a design piece next: new artboards in the project's design canvas, with the real theme tokens, light and dark versions, and an element and token spec, approved by the user (by the validator only when the user hands that over) before UI code starts. The build follows it 1:1 and is checked against it by the QA verifier's `master-session:design-checker` subagent: on the worker's screenshots or preview before merge when there are any, and always on the live screenshot after it.
- `ultracode` or "use a workflow" from the user lets the worker run a workflow, within the user's agent budget. Without that request, keep the bare word `ultracode` out of briefs: it opts the worker into workflows.

## In Copilot CLI

Copilot CLI loads this plugin too, without `start_session`, SendMessage, the report tool, the status mod, `/loop` or `ScheduleWakeup`. It leaves `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` as written: read them as the plugin folder and this skill's folder. Run the same protocol with what Copilot has:
- **Workers:** give the user the brief to paste into a session they open with `/new`, or `/fork` when it needs this chat. The worker makes its worktree at `$HOME/.copilot/worktrees/wt-<repo>-<branch>` and reports in its own chat in the report format; the user relays it.
- **Persona subagents:** the `task` tool with `agent_type: "master-session:<persona>"` and `model` set to a Copilot model id, such as this session's own. Copilot rejects the agents' `sonnet` and `opus`, and its error lists the ids. `/tasks` shows them; `/fleet` runs several in parallel.
- **Loop and board:** no heartbeat. Do a tick (section 3) on every user turn and every subagent result, and post the chat board as [board.md](board.md) shows.
- **`/delegate`** sends the session to GitHub and opens a pull request there: never use it for a repo hosted elsewhere, such as Azure DevOps.
