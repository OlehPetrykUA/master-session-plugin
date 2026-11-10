---
name: stop
description: "Master session: ends the run in this chat: stops its running subagents, cleans up and writes the final summary.md. Use only when the user runs this command."
disable-model-invocation: true
---

Stop this run's running subagents with `TaskStop`. First record each one's pending step and worktree (path and `git status --short`) in `protocol.md` if the run has one, otherwise in your closing reply.

Write the final `summary.md` in the form the end of `${CLAUDE_PLUGIN_ROOT}/skills/start/board-spec.md` shows, with every stopped piece ⏸ and anything left open as a Still open row. Run `python3 -I ${CLAUDE_PLUGIN_ROOT}/skills/start/scripts/summary-check <run folder>/summary.md` once and fix what it prints. Reply in a few lines, listing each stopped worker with its pending step and worktree.
