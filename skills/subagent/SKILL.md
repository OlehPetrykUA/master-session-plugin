---
name: subagent
description: Runs a master-session persona as a background subagent for one short check, relays its result and records it in the ledger. Use ONLY when the user types /master-session:subagent.
disable-model-invocation: true
argument-hint: '<task>'
---

# Run a persona subagent

Invoked with: `$ARGUMENTS`. The text is the task; you pick the persona from [personas.md](../start/personas.md) by the task.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1, then continue here.

Use it for pieces that [Execution shape](../start/shape.md#execution-shape) rule 5 gives a subagent; a piece that needs the user in its own chat is a worker session (rule 3).

1. Write the count line ([start](../start/SKILL.md#2-brief-the-worker), Count and waits), then call `Agent` with `subagent_type: "master-session:<persona>"`, `run_in_background: true`, a `description` that is the task alone (2 to 5 words, no persona word), and a `prompt` with the task, the user's words quoted (`User said: "…"`), the repo, sha or files to check, and what to return: the persona's output from its skill. Leave `model` and `effort` unset unless the tier table sets them.
2. Right after, start [the loop](../start/SKILL.md#3-the-loop) if none runs (the ledger's `Heartbeat:` line shows none, not `cron <job id>`), with section 3's `/loop 5m` args (folder `${CLAUDE_PLUGIN_ROOT}/skills/start`), and say so in one line. Don't wait or poll: the result arrives as a notification.
3. Relay the result to the user in a few lines, and record it in [the ledger](../start/SKILL.md#6-ledger-and-clean-up): persona, task, verdict and open findings. A verdict is a claim: a merge still needs the tier's checkers on that exact sha ([section 3](../start/SKILL.md#3-the-loop), step 2).

Copilot CLI: [copilot.md](../start/copilot.md#subagent).
