# Execution shape

Part of section 2 of the [start](SKILL.md#2-brief-the-worker) skill.

## Execution shape

One per piece, named in the ledger; the first match wins.
1. **Inline** only for your own duties: plan, scout, brief, ledger, board, the inline Checker gate and the `--ff-only` merge. Merging over a `FAIL` is the user's call, quoted in the ledger.
2. **Background Bash or Monitor** to wait, never to work (`timeout_ms` at most 30 min, then re-arm).
3. **Worker session** when the piece needs the user in its own chat or must outlive you: an action auto mode blocks until the user names it there (a shared-artifact publish or delete; an edit to `~/.claude`, `~/.agents`, `~/.copilot` or a settings file); a mid-run redirect; the user will quit the app. Start it as [subchat](../subchat/SKILL.md#session-start) says.
4. **Workflow** only for a read-only fan-out the user opted into ([workflow](../workflow/SKILL.md#when-a-workflow-may-run)).
5. **Background subagent** (`Agent` `subagent_type: "master-session:<persona>"`, `run_in_background: true`) for everything else. A builder works in `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-<name>" master`. Record each agent ID in the ledger. An unregistered persona: [personas.md](personas.md).
- At plan time, ask the user once, in one line, for the allow rules each piece needs.
- Only `STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` is a subagent's report; on `STATUS: WAITING <job>`, resume it by ID when the job ends. Answer its permission prompts for that call only. An auto-mode block is 🔴 (section 5): give the exact allow rule, then resume the agent by ID.

## Worker lifetime

One agent per piece.
- A fix round or rebase goes to the same agent by ID while its context is under ~150k tokens (`subagent_tokens` in its completion notice). Otherwise, and on every resume of a paused subagent, a fresh agent gets a handover brief: done so far, what is left, "review the uncommitted diff in <worktree>". Never a user question.
- A new task gets a new worker; a retired worker is never resumed for new work. Retire one once its sha is on master: a subagent is resumed by ID for its post-merge worktree removal, then retires; `stop_session` or `TaskStop` if mid-turn; worktree and branch gone.
- Drift is a defect: stop the worker, hand over to a fresh one.
