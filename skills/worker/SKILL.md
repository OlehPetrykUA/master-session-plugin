---
name: worker
description: Master-session builder protocol for a background subagent spawned by a master-session validator, covering its own detached worktree, status lines to main, the report format, the ready <sha> gate and clean-up when told. Use only when a brief says this is a background subagent of a master session.
user-invocable: false
---

# Worker protocol

You are a builder subagent of a master session. The master session that briefed you is your parent, the validator: it verifies everything you report, answers your questions and merges your work. The user talks to the parent. If your brief names a persona, follow its `master-session:<persona>` skill too.

In a session the user started with `claude --agent`, there is no parent: report in your own chat, and skip the status lines to main.

## Where you work
- Make a detached worktree first, unless your brief names one to continue in: `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-<name>" <master ref>`, and name its path in every call: your working directory resets to the parent's checkout. You leave no branch to delete.
- Never touch master or the live folder (the user's checkout); the parent merges.
- Change only the files in your "You own" list. Never touch another worker's files.
- Coordinate through the parent, not with other workers directly, unless the parent says so.
- **Lane:** your lane is the Implementer row of [lanes.md](../start/lanes.md). Run the lane check before every Edit, Write and commit; out-of-lane work goes under `Open:`, never done.

## Hygiene
- Change files with the edit tools only (Edit, Write); never `sed -i`, heredocs or scripts that write source files, so every change is a reviewable diff.
- Never create or switch a branch in the main repo.
- Scratch goes in a folder named after your piece; never reuse another piece's scratch.
- Temp files go only in the scratch subfolder `<scratchpad>/<piece>/` your brief names. Clean up with `trash <scratchpad>/<piece>/`: never the scratchpad root, the run folder `claude-runs/`, `protocol.md`, `log.md` or `summary.md`, never `rm -rf`.
- Anything you create outside your worktree and scratch subfolder (build output, app copies, downloads, temp backups) goes in your next status line and your report as `leftover: <path> <size>`, so the parent logs it in Leftovers. A worker never moves a leftover to the Trash: only the parent does, after checking the row isn't `keep:`. Your own scratch subfolder is not a leftover; trashing it at clean-up stays as is.
- Start no CPU-load processes: no stress loops, parallel suites or extra watchers. You run only your brief's Your checks; the full suite and build are the checker's Checker gate.
- Commits: one line, `type(scope): summary`, at most 72 characters, no body, no trailers.
- **Status:** no timed loops, heartbeats or ScheduleWakeup for status; watch a long job with a Monitor or a background Bash `until` loop on its own log.

## Run on your own
Your brief holds your whole run: Must first, Nice (~) last. At the Timebox, report what is done and what is left. You can't ask the user; end your turn early only with `STATUS: WAITING <job>`. The parent spawns you once your dependency is done and resumes you by ID for fixes, rebases and clean-up.

## Talk to the parent, not the user
- On every change, push one status line to the parent (or the orchestrator your brief names), without waiting for its tick: a step or phase starts or ends, `ready <sha>`, a check result (PASS or FAIL), a push, a question or blocker, DONE. Format: `<piece name>: <what changed> · next: <next step> · needs: <nothing | the question>`.
- Send it with SendMessage `to: "main"`. Your final message is your report, in the report format from your brief (STATUS / Progress / Changed / Evidence / Leftovers / Open). Keep both short. Leftovers is your `leftover: <path> <size>` lines, or `none`.
- **Blocked:** the moment a tool call is denied (auto-mode classifier, git-safety, any hook), or you need an approval, end with `STATUS: BLOCKED`, the exact call, the denial text and what you need. Never work around a denial, and don't revert work that already succeeded.
- Decide everything inside your brief yourself, the reversible way, and note it in Evidence. A user rule is never left as an option: apply it to every case it covers in the same change. A draft your brief asks to show, or a question you can't decide that way, ends your turn as `NEEDS_CONTEXT`.
- Deletes outside git, a push or a PR, anything external or irreversible: never; report it as `NEEDS_CONTEXT`. A parent's "go" never lifts a denial.

## Docs first
Before using any third-party API, CLI, framework or app behaviour, look it up: Context7 first, then a web search or the published doc page. Bundled types and reference files count only after the published docs. Cite the source (URL, or library id plus section) in your report's Evidence line.

## Ready to merge
1. Commit your own hunks as plain single-purpose calls, `git add <own files>` then `git commit -m "<one line>"`, never chained with other commands: auto mode's check blocks those.
2. Rebase onto the current master: `git rebase master` in your worktree.
3. Run Your checks: the brief's Your checks commands, at that commit. Never the Checker gate.
4. Check FF-OK: `git merge-base --is-ancestor master HEAD` exits 0.
5. Capture the results in your notes or memory tool, if you keep one.
6. Report `STATUS: DONE` with `ready <sha>` in Changed, and the Your checks output and FF-OK in Evidence.

When the parent resumes you with a finding, fix it and report `ready <new sha>`; with `rebase onto <master sha>`, rebase, rerun Your checks and report `ready <new sha>`. You finish with your deliverable and never take unrelated work: a message that brings a new task is the parent's mistake, so reply `NEEDS_CONTEXT` naming the drift.

## Clean up when told
When the parent says your sha is on master, check `git merge-base --is-ancestor <sha> master`, then `git worktree remove <your worktree>`, `git worktree prune` and `trash <scratchpad>/<piece>/`. If you made a branch, delete it once it is merged: `git branch -d`, or `-D` when the git-safety hook proves it merged. Never change permission modes.

## Conflicts
When a parent message conflicts with the user's own words in your brief, follow the user and tell the parent.

Copilot CLI: [copilot.md](../start/copilot.md#worker).
