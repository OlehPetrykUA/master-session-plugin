# Role lanes

Part of the [start](SKILL.md) skill. One row per role. Everything not in May write is forbidden.

| Role | May write | Git and shell | Never |
|---|---|---|---|
| Validator (this session) | Its run folder (`claude-runs/<date>-<run>/` protocol.md, log.md, summary.md); its memory-tool notes; the one `claude-runs/` line in `$(git rev-parse --git-path info/exclude)`; its own verify worktrees `wt-<repo>-verify-<sha>` (create and remove only, never edit inside); its cron jobs | `merge --ff-only` of a verified sha; a push or PR only when the task asks or the user approved | Edit or Write on any tracked file in any repo; a commit of its own; a rebase; skill, doc or config edits |
| Implementer | Its own detached worktree `wt-<repo>-<name>`, only the files under the brief's `## You own`; its scratch subfolder | Commits in that worktree; a rebase when the validator says so | A push; a merge; main; the live checkout; another worktree; trashing a leftover |
| Refactorer | Its own detached worktree `wt-<repo>-<name>`, only the files under the brief's `## You own`; its scratch subfolder | Commits in that worktree; a rebase when the validator says so | A push; a merge; main; the live checkout; another worktree; trashing a leftover |
| Investigator | Its own `wt-<repo>-investigate-<name>` worktree (temporary edits, never committed); its scratch subfolder | Read-only git, runs and bisects in that worktree | A commit; a push; a merge; main; the live checkout; another worktree |
| QA verifier | Its own verify worktree (create and remove); its scratch subfolder | Checks and gates in that worktree | File edits (its agent denies Edit and Write); a commit; a push; a merge |
| Code reviewer | Its own verify worktree (create and remove); its scratch subfolder | Read-only git | File edits (its agent denies Edit and Write); a commit; a push; a merge |
| Design checker | Its own verify worktree (create and remove); its scratch subfolder | Read-only | File edits (its agent denies Edit and Write); a commit; a push; a merge |
| Researcher | Nothing: read only | Read-only | Any write |
| Spec writer | The feature's tab in the project's spec doc only | None | Code; designs; another tab or doc |
| Architect | The Technical design section of that tab only | Read-only git | Code; designs; the spec's requirements |
| Designer | The design canvas artboards only | None | UI code; the spec |
| Orchestrator (owned by the chat-orchestrator skill, listed so both skills agree) | Its run folder `claude-runs/<date>-orchestrator/`; memory notes; cron; messages; session management on the user's turns (start, unarchive, stop, detach) | `merge --ff-only` and pushes the user approved | Project code, skills, docs or config edits; project commits. Every change goes to the owning chat or a new session |

"The validator sometimes edits" means only its own files above: the run folder, memory notes, the exclude line, its verify worktrees and its cron jobs. That is the list of its only writes in [start](SKILL.md), first paragraph.

- The validator never edits the orchestrator's files, and the orchestrator never edits this plugin's skills.
- **Lane check:** every role, before every Edit, Write, NotebookEdit, commit, push or move to the Trash, checks: `lane check: <role> · <action> <path> · in my lane?`
- **Out of lane, before:** stop, don't do it, and hand it to the owner. The validator writes a worker brief. A worker puts it under `Open:` / NEEDS_CONTEXT. The orchestrator sends it to the owning chat, or to a new session the user creates. Log `lane: <role> stopped <action> <path> → <owner>` in log.md, or in the report for a worker.
- **Out of lane, already happened:**
  1. stop;
  2. revert nothing that belongs to someone else;
  3. tell the owner;
  4. add a ✋ Needs-you item for the user;
  5. log it.
- **Hard ban:** a PreToolUse lane guard is proposed, not installed. It extends the user's git-safety hook, marks main sessions with `~/.claude/state/<session_id>/role.json` (`"role": "master"` or `"orchestrator"`), and tells subagents apart by `agent_type` (code.claude.com/docs/en/hooks: "For subagents shipped by a plugin, the agent type is the plugin-scoped identifier"). Until the user installs it, the lanes are these rules plus the lane check, and no skill writes the marker.
