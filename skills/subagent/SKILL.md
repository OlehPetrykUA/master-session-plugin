---
name: subagent
description: Runs a master-session persona as a background subagent for one short check, relays its result and records it in the ledger. Use ONLY when the user types /master-session:subagent.
disable-model-invocation: true
argument-hint: '<task>'
---

# Run a persona subagent

Invoked with: `$ARGUMENTS`. The text is the task; you pick the persona from [personas.md](../start/personas.md) by the task.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1, then continue here.

Use it for pieces that [Execution shape](../start/shape.md#execution-shape) rule 4 gives a subagent. This session never starts a session or sub-chat: a piece that needs its own chat is a 🔴 Needs you line for the user or the chat orchestrator.

1. Write the count line ([start](../start/SKILL.md#2-brief-the-worker), Count and waits), then call `Agent` with `subagent_type: "master-session:<persona>"`, `run_in_background: true`, a `description` that is the display name from [shape.md Names](../start/shape.md#names), and a `prompt` with the task, the user's words quoted (`User said: "…"`), the repo, sha or files to check, and what to return: the persona's output from its skill. Leave `model` and `effort` unset unless the tier table sets them.
2. Right after, start [the loop](../start/SKILL.md#3-the-loop) if the ledger's `Heartbeat:` line shows none, or if its `last tick` is over 15 minutes old and `CronList` doesn't list its job, with section 3's `/loop 5m` args (folder `${CLAUDE_PLUGIN_ROOT}/skills/start`), and say so in one line. Don't wait or poll: the result arrives as a notification.
3. Relay the result to the user in a few lines, and record it in [the ledger](../start/SKILL.md#6-ledger-and-clean-up): persona, task, verdict and open findings. A verdict is a claim: a merge still needs the tier's checkers on that exact sha ([section 3](../start/SKILL.md#3-the-loop), step 2).

Copilot CLI: [copilot.md](../start/copilot.md#subagent).
