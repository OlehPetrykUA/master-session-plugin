# Personas

A persona is a fixed role the validator hands out. Each one has its own skill, `master-session:<persona>` (mission, inputs, output, gate, must-not), and its own agent of the same name, which preloads that skill as a subagent; a session the user starts with `claude --agent master-session:<persona>` (Copilot: `copilot --agent master-session:<persona>`) gets it from the plugin's SessionStart hook. The validator runs every persona as a subagent or workflow agent in its own chat. Which personas a piece gets, and its checkers, come from the [tier table](SKILL.md#2-brief-the-worker). The agent frontmatter holds each persona's default model and effort; the tier table says when the `Agent` call overrides it.

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

On Claude Code the read-only personas' agents deny Edit, Write and NotebookEdit; Copilot ignores that field, so there only the lane guards them ([copilot.md](copilot.md#read-only-personas)).

## Effort

| Role | Effort | Why |
|---|---|---|
| Validator chat | xhigh | [long agentic runs](https://platform.claude.com/docs/en/build-with-claude/effort) |
| Implementer | medium | [well-specified tasks](https://platform.claude.com/docs/en/build-with-claude/effort) |
| Implementer, fresh re-brief after 2 fix rounds | high | harder or longer work |
| Refactorer | medium | baseline is the failure signal |
| QA verifier, Design checker | high | [verification gains most](https://claude.dev/blog/spending-your-effort) |
| Code reviewer, Investigator, Architect, Spec writer, Designer | high | [bug and design work](https://code.claude.com/docs/en/model-config) |
| Researcher | medium | [research gains little](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence) |

- The validator chat runs at `xhigh`, set once at the start by whoever starts it (Copilot: `copilot --reasoning-effort xhigh`). It never changes its own effort: a change [breaks the prompt cache](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost).
- A non-persona subagent the validator spawns (Explore, Plan, general-purpose) gets an explicit `effort: "medium"` on the call; with none it [inherits the session's](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) (2.1.316).
- `xhigh` on a worker is never a default: only a deliberate second-opinion recheck of a risk-flagged piece. `max` never, it [may overthink](https://code.claude.com/docs/en/model-config).

## Unregistered persona

A persona added to the plugin during a session isn't a registered agent type until the app restarts; skills hot-reload. Until then, run it as `subagent_type: "general-purpose"` with a brief starting `Load the master-session:<persona> skill with the Skill tool first and act as that persona.`
