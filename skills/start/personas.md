# Personas

A persona is a fixed role the validator hands out. Each one has its own skill, `master-session:<persona>` (mission, inputs, output, gate, must-not), and its own agent of the same name, which preloads that skill as a subagent; a session started with `claude --agent master-session:<persona>` gets it from the plugin's SessionStart hook. Builders run as background subagents by default and as `start_session` workers where [Execution shape](SKILL.md#2-brief-the-worker) rule 3 says: the session brief's first line loads the `master-session:worker` and `master-session:<persona>` skills. Short read-only checks run as the persona's subagent, named by `Agent` `subagent_type` or Workflow `agent(…, {agentType})`. On every `ready <sha>` the validator starts the QA verifier and the Code reviewer in parallel, and merging needs `PASS` from both; the QA verifier runs the Design checker for UI as its own subagent ([SKILL.md](SKILL.md#3-the-loop) section 3, step 2). Pick models by alias only, the cheaper tier when torn. A `start_session` worker can't go above the validator's own model.

| Persona | Runs as | Session agent | Subagent | Model / effort |
|---|---|---|---|---|
| Implementer | subagent; session by rule 3 | `claude --agent master-session:implementer` | `master-session:implementer` | sonnet / medium; opus / high for design-heavy work |
| Refactorer | subagent; session by rule 3 | `claude --agent master-session:refactorer` | `master-session:refactorer` | sonnet / medium |
| Code reviewer | subagent | `claude --agent master-session:reviewer` | `master-session:reviewer` | opus / high |
| QA verifier | subagent | `claude --agent master-session:qa-verifier` | `master-session:qa-verifier` | sonnet / medium |
| Design checker | subagent | `claude --agent master-session:design-checker` | `master-session:design-checker` | sonnet / medium |
| Researcher | subagent | `claude --agent master-session:researcher` | `master-session:researcher` | sonnet / medium; haiku / low for one fact |
| Spec writer | subagent | `claude --agent master-session:spec-writer` | `master-session:spec-writer` | opus / high |
| Architect | subagent | `claude --agent master-session:architect` | `master-session:architect` | opus / high |
| Designer | `start_session` worker for a canvas stream (rule 3), else subagent | `claude --agent master-session:designer` | `master-session:designer` | opus / high |
| Integrator | the validator itself | | | the session's own |

The read-only personas' agents deny Edit, Write and NotebookEdit. A `start_session` worker can't pick an agent, so its brief loads the skills instead. Order: Spec writer, then Architect (only for work spanning several modules or workers; skipped for fixes and single-file changes), then Designer (UI only), then Implementer, then QA verifier with Code reviewer.

- Implementer: [skill `master-session:implementer`](../implementer/SKILL.md), with [`master-session:worker`](../worker/SKILL.md).
- Refactorer: [skill `master-session:refactorer`](../refactorer/SKILL.md), with [`master-session:worker`](../worker/SKILL.md).
- Code reviewer: [skill `master-session:reviewer`](../reviewer/SKILL.md).
- QA verifier: [skill `master-session:qa-verifier`](../qa-verifier/SKILL.md).
- Design checker: [skill `master-session:design-checker`](../design-checker/SKILL.md).
- Researcher: [skill `master-session:researcher`](../researcher/SKILL.md).
- Spec writer: [skill `master-session:spec-writer`](../spec-writer/SKILL.md).
- Architect: [skill `master-session:architect`](../architect/SKILL.md).
- Designer: [skill `master-session:designer`](../designer/SKILL.md).
- Integrator: below; the validator's own role, with no skill or agent.

## Integrator
- **Mission:** turn verified `ready <sha>` reports into master.
- **Inputs:** worker reports, the QA verifier's verdict, the ledger.
- **Output:** a `--ff-only` merge, the board and a ledger line.
- **Gate:** the QA verifier's `PASS` on that exact sha (the validator's own check only where section 3, step 2 allows it), and a fast-forward is possible.
- **Must not:** implement, fix, rebase or write skills; merge anything that isn't a fast-forward. Send it back to its worker.
