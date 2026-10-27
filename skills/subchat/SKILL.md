---
name: subchat
description: Starts a worker session, a side chat, for one task, briefed the way the validator briefs every worker, and watches it in the validator's loop. Use ONLY when the user types /master-session:subchat.
disable-model-invocation: true
argument-hint: '<task> [persona]'
---

# Start a worker session

Invoked with: `$ARGUMENTS`. The text is the task. A last word naming a persona from [personas.md](../start/personas.md) picks it; the default is `implementer`.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1, then continue here.

Use it only for pieces that [Execution shape](../start/shape.md#execution-shape) rule 3 gives a worker session; anything else is a subagent (rule 5).

1. Plan and brief the worker as [section 2 of the start skill](../start/SKILL.md#2-brief-the-worker) says, then start it as Session start below. The user typed the command, so it starts in this turn.
2. Right after, arm [the loop](../start/SKILL.md#3-the-loop) if none is armed (`CronList` shows none), with section 3's `/loop` args, and say so in one line. A loop that is already armed picks the worker up from the ledger.
3. Tell the user in one line: the worker as `name (local_id)`, its persona and its Your checks.

## Session start

The validator reads this section by path whenever it starts a worker session.
- Call `start_session` with `title` and `name` (start section 2, Names), `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: true`, a `background` of 80+ characters, `permission_mode: "auto"` (start section 5) and the whole brief, whose first line is `You are a worker session of master session <validator local_id>. Load the master-session:worker and master-session:<persona> skills first.`
- Start it only in the user's own turn: the app refuses `start_session` on a turn that a worker's message, a Monitor or the loop began, so a later tick can't add a session. On any other turn, tell the user in one line and start it on their next one (an `own_initiative` card is only for work you noticed yourself).
- If `start_session` fails or is refused, tell the user in one line and start it on their next turn; when the failure is lasting (for example over Remote Control), also say it can't start here.
- Never downgrade such a piece to a subagent.
- A session's brief holds its whole run: never send it go, rebase or merged messages; SendMessage only for a follow-up on its own deliverable.

Copilot CLI: [copilot.md](../start/copilot.md#subchat).
