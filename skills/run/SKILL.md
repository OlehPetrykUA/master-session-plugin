---
name: run
description: Starts a worker session, a side chat, for one task, briefed the way the validator briefs every worker, and watches it in the validator's loop. Use ONLY when the user types /master-session:run.
disable-model-invocation: true
argument-hint: '<task> [persona]'
---

# Run a worker session

Invoked with: `$ARGUMENTS`. The text is the task. A last word naming a persona from [personas.md](../start/personas.md) picks it; the default is `implementer`.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1 with no settings, then continue here.

1. Brief and start the worker exactly as [section 2 of the start skill](../start/SKILL.md#2-brief-the-worker) says: the plan, the persona, `title` and `name`, the brief format, `start_session` and the ledger note. The user typed the command, so `initiation` is `"user_asked"`.
2. Watch it in [the loop](../start/SKILL.md#3-the-loop): start the loop if none runs yet; otherwise add the worker to the running loop's ledger.
3. Tell the user in one line: the worker as `name (local_id)`, its persona and its Done when.
