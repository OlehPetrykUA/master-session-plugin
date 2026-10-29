---
name: stop
description: 'Ends a master-session run in this session: stops its heartbeat and its running subagents and workflows, copies the ledger and posts the final board. Use ONLY when the user types /master-session:stop.'
disable-model-invocation: true
---

Stop this session's master-session heartbeat: `CronDelete` the job the ledger's `Heartbeat:` line names, then set that line to `Heartbeat: none · stopped HH:MM`. Leave any other loop alone and run no more master-session ticks. If no heartbeat runs here, say so in one line.

Then stop this run's running subagents and workflows: for each one, first write its pending step and its worktree (path and `git status --short`) to `log.md`, then stop it with `TaskStop` and its agent or task ID.

Then write the final board to `summary.md` in the run folder in the format of `${CLAUDE_PLUGIN_ROOT}/skills/start/board-spec.md`, run `python3 ${CLAUDE_PLUGIN_ROOT}/skills/start/scripts/summary-check <run folder>/summary.md` and fix every violation before going on, copy the final `protocol.md` and `log.md` into the run's note, keep the run folder (all as section 6 of `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` says), and post the final board as `${CLAUDE_PLUGIN_ROOT}/skills/start/board.md` shows, listing every stopped worker as `<display name> (agentId)` with its pending step and worktree. The board lists every unfinished Leftovers row (not `🗑`) as still open.

Copilot CLI: [copilot.md](../start/copilot.md#stop).
