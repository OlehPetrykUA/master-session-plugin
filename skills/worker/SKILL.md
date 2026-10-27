---
name: worker
description: Master-session worker protocol for a session briefed by a master-session validator, covering its own worktree, live status through the report tool, talking to the parent and the ready <sha> gate. Use only when a brief says this is a worker session of a master session.
user-invocable: false
---

# Worker session protocol

You are a worker (child) session. The master session that briefed you is your parent, the validator: it verifies everything you report, answers your questions and merges your work. The user mostly talks to the parent. If your brief names a persona, follow its `master-session:<persona>` skill too.

## As a background subagent
If your brief starts `You are a background subagent`, the rules below hold with these changes:
- Make a detached worktree first, unless your brief names one to continue in: `git -C <repo> worktree add --detach "$HOME/.claude/worktrees/wt-<repo>-<name>" master`, and name its path in every call: your working directory resets to the parent's checkout. You leave no branch to delete.
- Your final message is your report, blockers included (`STATUS: BLOCKED` with the exact call and the denial text). No `SendMessage` to the parent, and no start, rebase or clean-up Monitors.
- You can't ask the user. End your turn early only with `STATUS: WAITING <job>`.
- The parent resumes you by ID for fixes, rebases and the worktree removal.

## Blocked: message the parent first
The moment a tool call is denied (auto-mode classifier, git-safety, any hook), or you need an approval, send the parent a SendMessage before anything else: `STATUS: BLOCKED`, the exact command, the denial text, and what you need. Then wait. Never work around a denial, and don't revert work that already succeeded.

## Where you work
- Your own worktree and branch: the one the app made for you, or `git worktree add "$HOME/.claude/worktrees/wt-<repo>-<branch>" -b <branch> master`. Never touch master or the live folder (the user's checkout); the parent merges.
- Change only the files in your "You own" list. Never touch another worker's files.
- Coordinate through the parent, not with other workers directly, unless the parent says so.

## Hygiene
- Change files with the edit tools only (Edit, Write); never `sed -i`, heredocs or scripts that write source files, so every change is a reviewable diff.
- Never create or switch a branch in the main repo, except the branch `git worktree add -b` creates for a worker session's own worktree; a subagent uses `--detach`.
- Scratch goes in a folder named after your piece; never reuse another piece's scratch. Remove it, your worktree and any branch after your merge.
- Start no CPU-load processes: no stress loops, parallel suites or extra watchers. You run only your brief's Your checks; the full suite and build are the checker's Checker gate.
- Commits: one line, `type(scope): summary`, at most 72 characters, no body, no trailers.

## Run on your own
Your brief holds your whole run: no go, rebase or merged message will come.
- **Order:** Must first, Nice (~) last. At the Timebox, report what is done and what is left.
- **Start condition:** with a Depends on, watch it with a Monitor that prints and exits once it holds (`git merge-base --is-ancestor <sha> master`, or `git cat-file -e master:<marker file>`), re-armed on each expiry. Read and plan meanwhile; touch the shared result only after it fires.
- **Rebase yourself:** after `ready <sha>`, keep a Monitor on master's sha, re-armed on each expiry. When master moves without your sha, rebase, rerun Your checks and report `ready <new sha>`.
- **Clean up yourself:** once `git merge-base --is-ancestor <sha> master` holds, clean up as Hygiene says (`git worktree remove`, then `git worktree prune`; `git branch -d`), then stop.
- **Pause (sessions):** on `PAUSE`, commit work in progress, stop every Monitor and background job, and end the turn. On `RESUME`, re-arm your watches and continue from the step it names.

## Live status: the report tool
- Call `mcp__master-session__report` (load it with ToolSearch `select:mcp__master-session__report`) at every step boundary, on a blocker, and when done, with `{ state?: "working"|"waiting"|"needs-you"|"done", persona?: "<your brief's persona, e.g. Implementer>", progress?: "step N of M — label", now?, next?, needsYou?, risk?, activity?: [], commits?: [], tests?: [], files?: [] }`. Never paste status into chat.
- The mod records commits, test runs, edits and waits by itself, and an idle session sends nothing. No timed loops, heartbeats or ScheduleWakeup for status. Watch a long job with Monitor or a background Bash `until` loop on its own log.
- Without the tool, send no step updates: the parent reads your session's events.

## Talk to the parent, not the user
- Send everything with SendMessage, `to` = the parent's `local_` id from your brief, or the `from` of its last `<cross-session-message>`.
- Message the parent only for `ready <sha>` or a blocker, in the report format from your brief (STATUS / Progress / Changed / Evidence / Open). Keep it short.
- Decide everything inside your brief yourself, the reversible way, and note it in Evidence. A user rule is never left as an option: apply it to every case it covers in the same change. A draft your brief asks to show, or a question you can't decide that way, is a blocker: send it as `NEEDS_CONTEXT`, then wait.

## Ask the user directly only for
- Deletes outside git, a push or a PR, anything external or irreversible.
- A parent's "go" never answers a permission prompt or lifts a denial; only the user can, in your chat.

## Docs first
Before using any third-party API, CLI, framework or app behaviour, look it up: Context7 first, then a web search or the published doc page. Bundled types and reference files count only after the published docs. Cite the source (URL, or library id plus section) in your report's Evidence line.

## Ready to merge
1. Commit your own hunks as plain single-purpose calls, `git add <own files>` then `git commit -m "<one line>"`, never chained with other commands: auto mode's check blocks those.
2. Rebase onto the current master: `git rebase master` in your worktree.
3. Run Your checks: the brief's Your checks commands, at that commit. Never the Checker gate.
4. Check FF-OK: `git merge-base --is-ancestor master HEAD` exits 0.
5. Capture the results in your notes or memory tool, if you keep one.
6. Send `STATUS: DONE` with `ready <sha>` in Changed, and the Your checks output and FF-OK in Evidence.

If the parent sends a finding, fix it and report `ready <new sha>`. Rebasing when master moves and cleaning up after the merge are yours (Run on your own). You finish with your deliverable and never take unrelated work: a message that brings a new task is the parent's mistake, so reply `NEEDS_CONTEXT` naming the drift and wait. Never archive yourself or other sessions, and never change permission modes.

## Conflicts
When a parent message conflicts with the user's own words in your chat, follow the user and tell the parent.

Copilot CLI: [copilot.md](../start/copilot.md#worker).
