# Personas

A persona is a fixed role the validator hands out. Each one has its own skill, `master-session:<persona>` (mission, inputs, output, gate, must-not), and its own agent of the same name, which preloads that skill as a subagent; a session the user starts with `claude --agent master-session:<persona>` gets it from the plugin's SessionStart hook. The validator runs every persona as a subagent or workflow agent in its own chat. Which personas a piece gets, and its checkers, come from the [tier table](SKILL.md#2-brief-the-worker). The agent frontmatter holds each persona's default model and effort; the tier table says when the `Agent` call overrides it.

| Persona | Runs as | Skill and agent |
|---|---|---|
| Implementer | subagent, [Execution shape](shape.md#execution-shape) rule 4 | [`master-session:implementer`](../implementer/SKILL.md), with [`master-session:worker`](../worker/SKILL.md) |
| Refactorer | subagent, rule 4 | [`master-session:refactorer`](../refactorer/SKILL.md), with [`master-session:worker`](../worker/SKILL.md) |
| Code reviewer | subagent, risk-flagged pieces | [`master-session:reviewer`](../reviewer/SKILL.md) |
| QA verifier | subagent, every checked sha | [`master-session:qa-verifier`](../qa-verifier/SKILL.md) |
| Design checker | subagent of the QA verifier, on a render it can read | [`master-session:design-checker`](../design-checker/SKILL.md) |
| Researcher | subagent | [`master-session:researcher`](../researcher/SKILL.md) |
| Investigator | subagent | [`master-session:investigator`](../investigator/SKILL.md) |
| Spec writer | subagent | [`master-session:spec-writer`](../spec-writer/SKILL.md) |
| Architect | subagent | [`master-session:architect`](../architect/SKILL.md) |
| Designer | a fresh subagent per design pass | [`master-session:designer`](../designer/SKILL.md) |

The read-only personas' agents deny Edit, Write and NotebookEdit.

## Unregistered persona

A persona added to the plugin during a session isn't a registered agent type until the app restarts; skills hot-reload. Until then, run it as `subagent_type: "general-purpose"` with a brief starting `Load the master-session:<persona> skill with the Skill tool first and act as that persona.`
