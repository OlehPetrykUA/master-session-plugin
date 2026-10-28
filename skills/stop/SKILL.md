---
name: stop
description: 'Ends a master-session run in this session: stops its heartbeat, posts the final board and leaves the workers running for the user to stop. Use ONLY when the user types /master-session:stop.'
disable-model-invocation: true
---

Stop this session's master-session heartbeat only: `CronDelete` the job the ledger's `Heartbeat:` line names, then set that line to `Heartbeat: none · stopped HH:MM`. Leave any other loop alone and run no more master-session ticks. If no heartbeat runs here, say so in one line.

Then post the final board as `${CLAUDE_PLUGIN_ROOT}/skills/start/board.md` shows. Do not stop, message or archive any worker: list every open worker as `name (local_id | agentId)` with its state, so the user can stop each one.
