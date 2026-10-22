# Personas

A persona is a fixed role the validator hands out. Each one has its own skill, `master-session:<persona>` (mission, inputs, output, gate, must-not), and its own agent of the same name, which preloads that skill as a subagent; a session started with `claude --agent master-session:<persona>` gets it from the plugin's SessionStart hook. Long work with commits runs as a `start_session` worker: the brief's first line loads the `master-session:worker` and `master-session:<persona>` skills. Short read-only checks run as the persona's subagent, named by `Agent` `subagent_type` or Workflow `agent(…, {agentType})`. Pick models by alias only, the cheaper tier when torn. A `start_session` worker can't go above the validator's own model.

| Persona | Runs as | Session agent | Subagent | Model / effort |
|---|---|---|---|---|
| Implementer | `start_session` worker | `claude --agent master-session:implementer` | `master-session:implementer` | sonnet / medium; opus / high for design-heavy work |
| Refactorer | `start_session` worker | `claude --agent master-session:refactorer` | `master-session:refactorer` | sonnet / medium |
| Reviewer | subagent | `claude --agent master-session:reviewer` | `master-session:reviewer` | opus / high |
| QA verifier | subagent | `claude --agent master-session:qa-verifier` | `master-session:qa-verifier` | sonnet / medium |
| Design checker | subagent | `claude --agent master-session:design-checker` | `master-session:design-checker` | sonnet / medium |
| Researcher | subagent | `claude --agent master-session:researcher` | `master-session:researcher` | sonnet / medium; haiku / low for one fact |
| Designer | subagent | `claude --agent master-session:designer` | `master-session:designer` | opus / high |
| Integrator | the validator itself | | | the session's own |

The read-only personas' agents deny Edit, Write and NotebookEdit. A `start_session` worker can't pick an agent, so its brief loads the skills instead. UI work: Designer first, then Implementer.

- Implementer: [skill `master-session:implementer`](../implementer/SKILL.md), with [`master-session:worker`](../worker/SKILL.md).
- Refactorer: [skill `master-session:refactorer`](../refactorer/SKILL.md), with [`master-session:worker`](../worker/SKILL.md).
- Reviewer: [skill `master-session:reviewer`](../reviewer/SKILL.md).
- QA verifier: [skill `master-session:qa-verifier`](../qa-verifier/SKILL.md).
- Design checker: [skill `master-session:design-checker`](../design-checker/SKILL.md).
- Researcher: [skill `master-session:researcher`](../researcher/SKILL.md).
- Designer: [skill `master-session:designer`](../designer/SKILL.md).
- Integrator: below; the validator's own role, with no skill or agent.

## Integrator
- **Mission:** turn verified `ready <sha>` reports into master.
- **Inputs:** worker reports, Reviewer and QA verdicts, the ledger.
- **Output:** a `--ff-only` merge, the board and a ledger line.
- **Gate:** Reviewer and QA `PASS` (or the validator's own verify) on that exact sha, and a fast-forward is possible.
- **Must not:** implement, fix, rebase or write skills; merge anything that isn't a fast-forward. Send it back to its worker.
