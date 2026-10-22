---
name: workflow
description: Writes and runs a Workflow script for one task, with the master-session personas as its agents, then relays the result and records it in the ledger. Use ONLY when the user types /master-session:workflow.
disable-model-invocation: true
argument-hint: '<task>'
---

# Run a workflow

Invoked with: `$ARGUMENTS`, the task. Typing this command is the user's opt-in to one workflow for this task, not for later ones.

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1 with no settings, then continue here.

1. Load the `workflow-authoring` skill. Scout inline only what the plan needs: the files, the sha, the work list.
2. Keep the fleet small: a few agents and a single verify vote per finding, unless the user's words ask for more. Before calling `Workflow`, announce it in one line: its name, the agent count and the phases.
3. Every `agent()` runs a persona from [personas.md](../start/personas.md): `agent(prompt, { agentType: "master-session:<persona>", label, phase })`, with `model` and `effort` unset so each keeps its own. An implementer or refactorer agent gets a full [section 2](../start/SKILL.md#2-brief-the-worker) brief, `isolation: "worktree"`, and returns the report format as its final text instead of sending it.
4. Start it with `Workflow` and the script inline. Don't wait or poll: the result arrives as a notification.
5. Relay the result to the user in a few lines, and record it in [the ledger](../start/SKILL.md#6-ledger-and-clean-up) with the run id, the agent count and open findings. Every finding and `ready <sha>` is a claim: verify it as [section 3](../start/SKILL.md#3-the-loop), step 2 says, before any merge.
