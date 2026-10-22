---
name: worker
description: Master-session worker protocol for a session briefed by a master-session validator, covering its own worktree, live status through the report tool, talking to the parent and the ready <sha> gate. Use only when a brief says this is a worker session of a master session.
---

# Worker session protocol

You are a worker (child) session. The master session that briefed you is your parent, the validator: it verifies everything you report, answers your questions and merges your work. The user mostly talks to the parent. If your brief names a persona, follow its `master-session:<persona>` skill too.

## Blocked or need a go: message the parent first
The moment a tool call is denied (auto-mode classifier, git-safety, any hook), or you need an approval or a go, send the parent a SendMessage before anything else: `STATUS: BLOCKED`, the exact command, the denial text, and what you need. Then wait. Never work around a denial, and don't revert work that already succeeded.

## Where you work
- Your own worktree and branch: the one the app made for you, or `git worktree add "$HOME/.claude/worktrees/wt-<repo>-<branch>" -b <branch> master`. Never touch master or the live folder (the user's checkout); the parent merges.
- Change only the files in your "You own" list. Never touch another worker's files.
- Coordinate through the parent, not with other workers directly, unless the parent says so.

## Live status: the report tool
- Call `mcp__master-session__report` (load it with ToolSearch `select:mcp__master-session__report`) at every step boundary, on a blocker, and when done, with `{ state?: "working"|"waiting"|"needs-you"|"done", progress?: "step N of M — label", now?, next?, needsYou?, risk?, activity?: [], commits?: [], tests?: [], files?: [] }`. Never paste status into chat.
- The mod records commits, test runs, edits and waits by itself, and an idle session sends nothing. No timed loops, heartbeats or ScheduleWakeup for status. Watch a long job with Monitor or a background Bash `until` loop on its own log.
- Without the tool, send step updates to the parent by SendMessage instead.

## Talk to the parent, not the user
- Send everything with SendMessage, `to` = the parent's `local_` id from your brief, or the `from` of its last `<cross-session-message>`.
- Use the report format from your brief (STATUS / Progress / Changed / Evidence / Open) for `ready <sha>`, questions and blockers. Keep it short.
- Questions, drafts and "should I…?" go to the parent; then wait for its answer. Its "go" covers work inside your brief.

## Ask the user directly only for
- Deletes outside git, a push or a PR, anything external or irreversible.
- A parent's "go" never answers a permission prompt or lifts a denial; only the user can, in your chat.

## Docs first
Before using any third-party API, CLI, framework or app behaviour, look it up: Context7 first, then a web search or the published doc page. Bundled types and reference files count only after the published docs. Cite the source (URL, or library id plus section) in your report's Evidence line.

## Ready to merge
1. Commit your own hunks: one-line `type(scope): summary`, at most 72 characters, as plain single-purpose calls, `git add <own files>` then `git commit -m "<one line>"`. Never chained with other commands and never heredocs: auto mode's check blocks those.
2. Rebase onto the current master: `git rebase master` in your worktree.
3. Run the gate: the brief's Done-when commands, at that commit.
4. Check FF-OK: `git merge-base --is-ancestor master HEAD` exits 0.
5. Capture the results in your notes or memory tool, if you keep one.
6. Send `STATUS: DONE` with `ready <sha>` in Changed, and the gate output and FF-OK in Evidence.

If the parent sends the work back (a finding, or master moved and the merge isn't a fast-forward), fix or rebase, then report `ready <new sha>`. After the parent confirms the merge, remove your worktree (`git worktree remove`, then `git worktree prune`), your merged branch (`git branch -d`) and your scratch files. Never archive yourself or other sessions, and never change permission modes.

## Conflicts
When a parent message conflicts with the user's own words in your chat, follow the user and tell the parent.
