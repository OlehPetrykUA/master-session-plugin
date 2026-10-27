# Execution shape

Part of sections 2 and 3 of the [start](SKILL.md#2-brief-the-worker) skill.

## Execution shape

One per piece, named in the ledger; the first match wins.
1. **Inline** only for your own duties: plan, scout, brief, ledger, board, the inline Checker gate and the `--ff-only` merge. Merging over a `FAIL` is the user's call, quoted in the ledger.
2. **Background Bash or Monitor** to wait, never to work (`timeout_ms` at most 30 min, then re-arm).
3. **Worker session** when the piece needs the user in its own chat or must outlive you: an action auto mode blocks until the user names it there (a shared-artifact publish or delete; an edit to `~/.claude`, `~/.agents`, `~/.copilot` or a settings file); a mid-run redirect; the user will quit the app. Start it as [subchat](../subchat/SKILL.md#session-start) says.
4. **Workflow** only for a read-only fan-out the user opted into ([workflow](../workflow/SKILL.md#when-a-workflow-may-run)).
5. **Background subagent** (`Agent` `subagent_type: "master-session:<persona>"`, `run_in_background: true`) for everything else. A builder works in `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-<name>" master`. Record each agent ID in the ledger. An unregistered persona: [personas.md](personas.md).
- At plan time, ask the user once, in one line, for the allow rules each piece needs.
- Only `STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` is a subagent's report; on `STATUS: WAITING <job>`, resume it by ID when the job ends. Answer its permission prompts for that call only. An auto-mode block is 🔴 ([section 5](answering.md#5-permissions)): give the exact allow rule, then resume the agent by ID.

## Pause and resume

- On pause, each running subagent gets `TaskStop` and nothing else: a message would resume it. Each worker session gets `stop_session`, then one `PAUSE` (commit work in progress, stop every Monitor and background job, end the turn), since its Monitors can wake it. A running workflow, and your own background Bash, Monitors and inline gate, get `TaskStop` too; record their pieces as paused.
- Record each piece's pending step and its worktree's `git status --short` in the ledger and stop the loop (Heartbeat line to none); nothing runs until resume.
- On resume: a fresh agent per paused subagent piece, briefed as in [Worker lifetime](#worker-lifetime) to continue in its recorded worktree at its sha with its uncommitted work, never in a new worktree; each session one `RESUME` with its pending step; `git worktree remove --force` each verify worktree a stopped checker or your inline gate left, so the next tick starts a fresh checker on the same sha; start each paused workflow piece again with a fresh `Workflow` call (workflows are read-only); arm again each Monitor and background wait the ledger lists; re-arm the loop.

## Names

Names describe the deliverable. `title`: `<Persona> · <task>`, 2 to 5 words, under 60 chars ("Implementer · Row details", not "Worker 3"). `name`: one or two kebab-case words (`[a-z0-9-]`, ≤24), stable for life. An `Agent` `description` or workflow `label`: the task alone, 2 to 5 words. Lists show `name (local_id | agentId)`.

## Worker lifetime

One agent per piece.
- A fix round or rebase goes to the same agent by ID while its context is under ~150k tokens (`subagent_tokens` in its completion notice). Otherwise, and on every resume of a paused subagent, a fresh agent gets a handover brief: done so far, what is left, and "continue in <worktree> at <sha, or HEAD> (make no new worktree): review `git diff master...HEAD` and `git status --short` there, finish from the pending step, remove that worktree after the merge". Never a user question.
- A new task gets a new worker; a retired worker is never resumed for new work. Retire one once its sha is on master: a subagent is resumed by ID for its post-merge worktree removal, then retires; `stop_session` or `TaskStop` if mid-turn; worktree and branch gone. Before flagging a leftover worktree, check who holds it (`lsof +D <path>`).
- Drift is a defect: stop the worker, hand over to a fresh one.
