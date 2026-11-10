# Heavy path (L)

Everything in [SKILL.md](SKILL.md) applies. This adds only what risk or size earns. Each step below runs only if its condition holds.

## Plan once

`protocol.md` also holds, at most 30 lines, rewritten in place when a piece changes state, read only after a compaction: Run (name, repos, main ref, this chat's session id); the user's words that shape the run, verbatim; Plan (`| Piece | Persona (agentId) | You own | Depends on | State |`).

## The chain

| Step | Only when | Result |
|---|---|---|
| Investigator | A bug's cause is unknown after a few reads | You approve its report; its repro goes into the build's Must and gate |
| Researcher | One published-docs question you can't answer in a few lookups | Sourced answer |
| Spec writer | 3 or more behaviour choices, or the user wants to sign them off. Its Technical design section only with 2 or more builders | You approve; briefs link it |
| Designer | SKILL.md's visual rule | The user approves; briefs name canvas id, version and artboards |
| Implementer, one per piece | Always | `ready <sha>` |
| QA verifier, `Mode: risk`, `model: "opus"`, `effort: "high"`, once per feature on the final sha | Always | PASS or FAIL |

Personas are `Agent` subagents, `subagent_type: "master-session:<persona>"`, `run_in_background: true`, named `<Persona>: <short task>`. Their frontmatter holds model and effort. Any other subagent names its model and `effort: "medium"`.

Pieces run in parallel when their files are disjoint and neither depends on the other; shared files run in turn, and a dependent piece starts after its dependency merged. At most 3 agents at once and one suite-runner. Don't split what one builder can finish: many small related changes are one piece and one check, not a line of pieces each with its own branch, gate and report.

## Fix rounds

As in SKILL.md, plus one thing: a Blocking finding on risk code (the L list) gets one QA verifier in `Mode: recheck`, on `git diff <old sha> <new sha>` and only the named findings. Everything else is merged on your own read and test. After a rebase, `git range-diff` old against new: all `=` needs nothing; a `!` needs a recheck of those commits.

## Pause and handover

- **Pause:** `TaskStop` each running agent and your own waits. Record each piece's pending step and its worktree's `git status --short` in protocol.md. Nothing runs until resume.
- **Resume, or a builder over ~150k context:** a fresh agent with the handover brief: done so far, what is left, "start from <sha> (`git reset --hard <sha>` in your worktree): review `git diff <main>...HEAD`, finish from the pending step".
- A new task gets a new worker. A merged sha retires its worker.

## At Done

Every piece merged or dropped and every repo clean. If you keep a notes or memory tool, copy protocol.md into the run's note there, then finish as SKILL.md says.
