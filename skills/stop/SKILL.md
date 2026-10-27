---
name: stop
description: 'Turns this session back into a plain one: it stops being a master session (or a worker) and the status pane and band go. Use ONLY when the user types /master-session:stop.'
disable-model-invocation: true
argument-hint: '[force]'
---

The master-session status mod answers this command. If you are reading this, the mod isn't running in this session. Tell the user the mod is not running here, and say whether you stopped a master-session heartbeat.

If this session runs the master-session heartbeat (a `/loop` or `ScheduleWakeup` running master-session ticks), stop that one only: delete that `/loop` job (the ledger's `Heartbeat:` line names it) or call `ScheduleWakeup` with `stop: true`. Then set the ledger's `Heartbeat:` line to none. Leave any other loop alone. Run no more master-session ticks and do not call `mcp__master-session__board`. Do not stop, message or archive any worker.

With the mod, `force` stops the run even while workers are still running; without it the mod refuses until they are done. Without the mod, `force` makes no difference.
