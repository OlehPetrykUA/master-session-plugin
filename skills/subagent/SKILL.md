---
name: subagent
description: Runs a master-session persona as a background subagent for one short check, relays its result and records it in the ledger. Use ONLY when the user types /master-session:subagent.
disable-model-invocation: true
argument-hint: '<persona> <task>'
---

# Run a persona subagent

Invoked with: `$ARGUMENTS`. The first word is the persona, one of the eight in [personas.md](../start/personas.md); the rest is the task. With no known persona, list the eight and stop.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1 with no settings, then continue here.

1. Call `Agent` with `subagent_type: "master-session:<persona>"`, `run_in_background: true`, a `description` that is the task alone (2 to 5 words, no persona word: the mod reads the persona from the type), and a `prompt` with the task, the user's words quoted (`User said: "…"`), the repo, sha or files to check, and what to return: the persona's output from its skill. Leave `model` and `effort` unset; the agent keeps its own.
2. Right after, arm [the loop](../start/SKILL.md#3-the-loop) if none is armed (`CronList` shows none), with section 3's `/loop` args, and say so in one line. Don't wait or poll: the result arrives as a notification.
3. Relay the result to the user in a few lines, and record it in [the ledger](../start/SKILL.md#6-ledger-and-clean-up): persona, task, verdict and open findings. A verdict is a claim: a merge still needs a QA verifier verify of that exact sha ([section 3](../start/SKILL.md#3-the-loop), step 2).

## In Copilot CLI

Call the `task` tool instead of `Agent`: `agent_type: "master-session:<persona>"`, `name`, `description` and `prompt` as in step 1, and `model` set to a Copilot model id, such as this session's own. Copilot rejects the agents' `sonnet` and `opus`, and its error lists the ids. `/tasks` shows the run. There is no loop to arm: relay the result when it comes back. `${CLAUDE_PLUGIN_ROOT}` is this plugin's folder, two levels up from this file.
