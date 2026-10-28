# Execution shape

Part of sections 2 and 3 of the [start](SKILL.md#2-brief-the-worker) skill.

## Execution shape

One per piece, named in the ledger; the first match wins.
1. **Inline** only for your own duties: plan, scout (reads only; a cause that needs a repro or a run is an Investigate piece), brief, ledger, board, the inline Checker gate and the `--ff-only` merge. Merging over a `FAIL` is the user's call, quoted in the ledger.
2. **Background Bash or Monitor** to wait, never to work (`timeout_ms` at most 30 min, then re-arm).
3. **Workflow** only for a read-only fan-out the user opted into ([workflow](../workflow/SKILL.md#when-a-workflow-may-run)).
4. **Background subagent** (`Agent` `subagent_type: "master-session:<persona>"`, `run_in_background: true`) for everything else. A builder works in `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-<name>" <master ref>`. Record each agent ID in the ledger. Each subagent gets its own `<scratchpad>/<piece>/` scratch subfolder; nothing but the validator writes at the scratchpad root. An unregistered persona: [personas.md](personas.md).
- At plan time, ask the user once, in one line, for the allow rules each piece needs.
- Only `STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` is a subagent's report; on `STATUS: WAITING <job>`, resume it by ID when the job ends. Answer its permission prompts for that call only. An auto-mode block is 🔴 ([section 5](answering.md#5-permissions)): give the exact allow rule, then resume the agent by ID.

## Pause and resume

- On pause, each running subagent gets `TaskStop` and nothing else: a message would resume it. A running workflow, and your own background Bash, Monitors and inline gate, get `TaskStop` too; record their pieces as paused and list each Monitor and wait with its command in the ledger.
- Record each piece's pending step and its worktree's `git status --short` in the ledger and stop the loop (`CronDelete <job id>`, then `Heartbeat: none · stopped HH:MM`); nothing runs until resume.
- On resume: a fresh agent per paused subagent piece, briefed as in [Worker lifetime](#worker-lifetime) to continue in its recorded worktree at its sha with its uncommitted work, never in a new worktree; `git worktree remove --force` each verify worktree a stopped checker or your inline gate left, so the next tick starts a fresh checker on the same sha; start each paused workflow piece again with a fresh `Workflow` call (workflows are read-only); arm again each Monitor and background wait the ledger lists; start the loop again with section 3's `/loop 5m` args, a new `Heartbeat: cron <job id>` line.

## Verify details

Part of tick step 2 of the [start](SKILL.md#3-the-loop) skill.
- **Recheck** after a fix: one agent, the checker whose Blocking finding failed, on `git diff <old sha> <new sha>`. A Code reviewer finding goes to a Code reviewer recheck, a QA finding to a QA verifier in `Mode: recheck`, both, or a combined-mode checklist finding, to a QA verifier in `Mode: recheck` with the reviewer Checklist.
- **Rebase:** `git range-diff` old against new. All `=`: no re-verify (step 3's inline gate). Any `!`: one recheck agent on those commits.
- **Live check** only for a visual risk unit tests can't see, named in the plan: a QA verifier in `Mode: live` with the target app's window id (CoreGraphics `CGWindowListCopyWindowInfo`, its owner, layer 0) and what must show; captured read-only, never brought to the front.
- **Engine:** plugin checks use the desktop's bundled `~/Library/Application Support/Claude/claude-code/<version>/<hash>/claude.app/Contents/MacOS/claude`, not a `claude` on PATH.

## Design pass

Design only when visuals change; logic behind an existing element (which rows show, when a list refreshes) skips it. The design canvas is the single source of truth for visuals ([Designer](../designer/SKILL.md)). One Designer pass per plan covers every piece whose visuals change; the user approves before any UI build brief. An approved design gets no new pass unless the user asks for a visual change (mid-build, in a fix round, after a merge): that goes to a Designer pass first, then the build. The build brief always names the canvas id, version and artboard names.

## Names

Names put the persona first, then the task.
- **Display name:** every subagent and workflow agent is named `<Persona>: <short task>`. The persona is spelled as [personas.md](personas.md) spells it; the short task is 2 to 5 words in sentence case; the whole name is under 60 chars. Examples: "Implementer: board status lines", "QA verifier: recheck 25c7578", "Designer: launcher artboards", "Code reviewer: piece 2".
- No bare ids and no generic names ("agent 3", "worker", "fix stuff").
- A non-persona agent uses its agent type as the first part (`Explore: find token usages`). A `general-purpose` agent running a persona uses that persona.
- **Where it goes:** the `Agent` call's `description`, every workflow `agent()` `label`, and every board row and heading ([board.md](board.md)).
- **Agent ID:** SendMessage and `TaskStop` reach a subagent by the agent ID its spawn returns. It never shows on the board.
- A Workflow's `meta.name` stays a short kebab-case task id.
- Lists show `<display name> (agentId)`.

## Worker lifetime

One agent per piece.
- A fix round or rebase goes to the same agent by ID while its context is under ~150k tokens (`subagent_tokens` in its completion notice). Otherwise, and on every resume of a paused subagent, a fresh agent gets a handover brief: done so far, what is left, and "continue in <worktree> at <sha, or HEAD> (make no new worktree): review `git diff master...HEAD` and `git status --short` there, finish from the pending step, remove that worktree after the merge". Never a user question.
- A new task gets a new worker; a retired worker is never resumed for new work. Retire one once its sha is on master: a subagent is resumed by ID for its post-merge worktree removal, then retires; `TaskStop` if mid-turn; its worktree gone. Before flagging a leftover worktree, check who holds it (`lsof +D <path>`).
- Drift is a defect: stop the worker, hand over to a fresh one.
