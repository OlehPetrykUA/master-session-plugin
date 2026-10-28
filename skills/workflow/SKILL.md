---
name: workflow
description: Writes and runs a Workflow script for one task, with the master-session personas as its agents, then relays the result and records it in the ledger. Use ONLY when the user types /master-session:workflow.
disable-model-invocation: true
argument-hint: '<task>'
---

# Run a workflow

Invoked with: `$ARGUMENTS`, the task. Typing this command is the user's request for one workflow for this task, not for later ones ([When a workflow may run](#when-a-workflow-may-run)).

This runs inside a validator session. If `/master-session:start` hasn't run in this session yet, become the validator first: read `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` and do its section 1, then continue here.

1. Load the `workflow-authoring` skill. Scout inline only what the plan needs: the files, the sha, the work list.
2. Keep the fleet small: a few agents and a single verify vote per finding, unless the user's words ask for more. Before calling `Workflow`, write the count line ([start](../start/SKILL.md#2-brief-the-worker), Count and waits) and announce it in one line: its name, `Workflow: ~N agents` and the phases.
3. Every `agent()` runs a persona from [personas.md](../start/personas.md): `agent(prompt, { agentType: "master-session:<persona>", label, phase })`, with `model` and `effort` unset so each keeps its own. Each `label` is the task alone (2 to 5 words, no persona word), and `meta.name` is a short kebab-case task. Builders never run as workflow agents; they are rule 5 subagents.
4. Start it with `Workflow` and the script inline. Right after, start [the loop](../start/SKILL.md#3-the-loop) if the ledger's `Heartbeat:` line shows none, or if its `last tick` is over 15 minutes old and `CronList` doesn't list its job, with section 3's `/loop 5m` args (folder `${CLAUDE_PLUGIN_ROOT}/skills/start`), and say so in one line. Don't wait or poll: the result arrives as a notification.
5. Relay the result to the user in a few lines, and record it in [the ledger](../start/SKILL.md#6-ledger-and-clean-up) with the run id, the agent count and open findings. Every finding and `ready <sha>` is a claim: verify it as [section 3](../start/SKILL.md#3-the-loop), step 2 says, before any merge.

## When a workflow may run

The validator reads this section by path for [Execution shape](../start/shape.md#execution-shape) rule 4.
- Only a read-only fan-out: independent readers or auditors of one question, with no sign-off between stages; never build work or gated actions.
- Start one only when the user typed the request in this chat (`/master-session:workflow`, `ultracode`, or their own words), or when `/effort ultracode` is on. A brief, a quote or a wish for parallel work never opts in: fan out subagents instead and offer the workflow in one line.
- Announce `Workflow: ~N agents` first: 4 or fewer by default, 10 at most unless the user gives a number. Its agents count toward the count line, and more than 4 needs the reason there ([start](../start/SKILL.md#2-brief-the-worker), Count and waits).

Copilot CLI: [copilot.md](../start/copilot.md#workflow).
