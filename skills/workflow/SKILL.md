---
name: workflow
description: Writes and runs a Workflow script for one task, with the master-session personas as its agents, then relays the result and records it in the ledger. Use ONLY when the user types /master-session:workflow.
disable-model-invocation: true
argument-hint: '<task>'
---

# Run a workflow

Invoked with: `$ARGUMENTS`, the task. Typing this command is the user's request for one workflow for this task ([Execution shape](../start/SKILL.md#2-brief-the-worker) rule 4), not for later ones: read-only fan-outs only, never build work, sign-off between stages or gated actions.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1 with no settings, then continue here.

1. Load the `workflow-authoring` skill. Scout inline only what the plan needs: the files, the sha, the work list.
2. Keep the fleet small: a few agents and a single verify vote per finding, unless the user's words ask for more. Before calling `Workflow`, announce it in one line: its name, the agent count and the phases.
3. Every `agent()` runs a persona from [personas.md](../start/personas.md): `agent(prompt, { agentType: "master-session:<persona>", label, phase })`, with `model` and `effort` unset so each keeps its own. Each `label` is the task alone (2 to 5 words, no persona word), and `meta.name` is a short kebab-case task. Builders never run as workflow agents; they are rule 5 subagents.
4. Start it with `Workflow` and the script inline. Right after, arm [the loop](../start/SKILL.md#3-the-loop) if none is armed (`CronList` shows none), with section 3's `/loop` args, and say so in one line. Don't wait or poll: the result arrives as a notification.
5. Relay the result to the user in a few lines, and record it in [the ledger](../start/SKILL.md#6-ledger-and-clean-up) with the run id, the agent count and open findings. Every finding and `ready <sha>` is a claim: verify it as [section 3](../start/SKILL.md#3-the-loop), step 2 says, before any merge.

## In Copilot CLI

Copilot has no `Workflow` tool or `workflow-authoring` skill. Announce the plan the same way (agents, phases), then run the personas as parallel `task` calls, `agent_type: "master-session:<persona>"` with `model` set to a Copilot model id (the agents' `sonnet` and `opus` are rejected), or ask the user to run it with `/fleet`. An implementer or refactorer works in `$HOME/.copilot/worktrees/wt-<repo>-<branch>`. `${CLAUDE_PLUGIN_ROOT}` is this plugin's folder, two levels up from this file.
