---
name: subchat
description: Starts a worker session, a side chat, for one task, briefed the way the validator briefs every worker, and watches it in the validator's loop. Use ONLY when the user types /master-session:subchat.
disable-model-invocation: true
argument-hint: '<task> [persona]'
---

# Start a worker session

Invoked with: `$ARGUMENTS`. The text is the task. A last word naming a persona from [personas.md](../start/personas.md) picks it; the default is `implementer`.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1 with no settings, then continue here.

1. Brief and start the worker exactly as [section 2 of the start skill](../start/SKILL.md#2-brief-the-worker) says: the plan, the persona, `title` and `name`, the brief format with its start condition and clean-up, `start_session` and the ledger note. The user typed the command, so `initiation` is `"user_asked"`, and it starts in this turn: the app refuses `start_session` on a later turn that a message, a Monitor or the loop began.
2. Right after, arm [the loop](../start/SKILL.md#3-the-loop) if none is armed (`CronList` shows none), with section 3's `/loop` args, and say so in one line. A loop that is already armed picks the worker up from the ledger.
3. Tell the user in one line: the worker as `name (local_id)`, its persona and its Done when.

## In Copilot CLI

Copilot can't start a session or arm a loop. Write the brief as step 1 says, give it to the user to paste into a session they open with `/new` (or `/fork` to keep this chat), and list the worker by the name they give it. It reports in its own chat; check on it whenever the user writes. `${CLAUDE_PLUGIN_ROOT}` is this plugin's folder, two levels up from this file.
