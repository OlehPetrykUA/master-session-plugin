---
name: start
description: "Master session: a feature factory. Give it a task and the result lands where the user uses it, fast: tiny work done in this chat, a normal feature through one builder and one check, a big or risky job through more personas in parallel. Use only when the user runs this command."
disable-model-invocation: true
argument-hint: '<task>'
---

# Master session

Take `$ARGUMENTS`, the task in the user's own words, to a finished result in the place the user uses it. The user walks away and comes back to it done. The default is forward: a check, a report or a wait earns its place only if it could change what you do next. Typing this command again adds that work as new pieces.

Replies and DONE: read [done.md](done.md) before your first reply.

## 1. Pick the path

Your first reply starts with one line: `path: S|M|L · <why>`. Re-pick out loud only when the scope grows. The user saying quick or small caps it at S, unless it risks data loss or security.

| Path | Take it when | Who builds | Who checks |
|---|---|---|---|
| **S**, tiny, done in minutes | Clear ask in one area: about 5 files or 200 changed lines at most, nothing from the L list | This chat | This chat: the covering tests once, then its own diff |
| **M**, a normal feature | Bigger than S, more than one module | One Implementer per feature; this chat stays free for the user and the next step | One QA verifier, once per feature, on the finished piece |
| **L**, only when earned | Deletes or data migration, secrets or auth, money, git safety, timers or daemons, a contract other teams use; a hard bug still unexplained after a few reads; several features to run in parallel; the user says full or careful | Read [heavy.md](heavy.md) first | [heavy.md](heavy.md) |

S and M read no other file of this skill but the end of [board-spec.md](board-spec.md#master-session-example). What each role may write: [lanes.md](lanes.md), only when in doubt.

**Run files come first, on every path.** Before any other work write these two files in a run folder (where is your call), then show summary.md to the user: `SendUserFile` with `display: "render"` where the app has it, else its path in your reply. Subagents never send it.
- `protocol.md`: only what must survive a compaction: role line, the user's words in force, the plan; rewritten in place, at most 30 lines.
- `summary.md`: the form below.

A visual change on any path: a new screen, or any UI change in a project with a design canvas, gets one Designer pass first and the user approves it before UI code. Logic behind an existing element, and a small tweak with no canvas, get none. The build follows the named artboards.

## 2. Build

1. M and L: a plan of at most 5 lines in your first reply, with no approval wait.
2. Builders, checkers and investigators each run in their own git worktree, which Claude Code makes and cleans up (`isolation: worktree` in their agent files).
3. Decide behaviour choices yourself the reversible way and say each in one line. Ask only what is irreversible, a UI design, or a preference only the user has.
4. Docs first for anything third party (Context7 when connected, else the published docs), cited in your reply.

**Implementer brief.** Pass file paths, not pasted text. The first brief holds the whole scope.

```
You are a background subagent of master session <session id>; your final message is your report.
## Task      one paragraph; User said: "…"
## Must      the deliverable, its acceptance points, where the user will use it; a spec by path, artboards by link
## You own   files only this worker may change
## Checks    the test commands to run once when ready; failures already known on main, by name
## Report    STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
             Changed: ready <sha> on <branch> · Evidence: command → result · Open:
```

Spawn it with `Agent`, `subagent_type: "master-session:implementer"`, `run_in_background: true`, `description: "Implementer: <short task>"`. Its frontmatter holds its model; don't override it. Answer its questions at once with a direct instruction quoting the user; it can't reach the user.

## 3. Prove it, once

Tests run when a piece is ready, not after every step. On red fix and rerun only what failed. Never repeat a green run. Then read your own diff.

**M: one check.** When the feature is finished, one `master-session:qa-verifier` in the background on the final sha, `Mode: check`, not per commit. Its prompt names the repo, main ref, sha, the brief with the user's words, the Checker gate (the full suite if under 5 minutes, else the tests covering the change plus the build) and the failures already known on main. The builder never runs that gate, and nobody runs it twice.

**Its verdict is a claim.** Read each Blocking finding against its cited line and drop the false ones.
- One fix round for everything: the builder resumed by ID, or this chat, with all real findings at once, the fix-now list too.
- Then read the fix diff, run the failing test yourself and merge. No recheck agent.
- After 2 failed rounds: a fresh builder with `model: "opus"`, `effort: "high"` and a different approach, or `BLOCKED`.
- Nits go in your closing reply. They never start a round.

## 4. Finish

1. Commit, then `git -C <repo> merge --ff-only <sha>` in the live checkout. Not a fast-forward: rebase first and rerun nothing unless the rebase changed the code. Push or PR only when the task asks or the user approves.
2. Put the result where the user uses it: the app they open, the game they play, the folder they work in. A result only in a test copy or stage build isn't finished. Say where it is.
3. Rewrite summary.md, run `python3 -I ${CLAUDE_SKILL_DIR}/scripts/summary-check <summary.md>` once and fix what it prints; show it again if it changed.
4. Close with what changed, where it is, the test that proves it and any Still open row (what can't be tested here is one). If you keep a notes or memory tool, write a note only when a decision or a fact is worth finding later.

## summary.md

Copy [the example](board-spec.md#master-session-example) and the lines under it, the end of that file, and change only the values. Rewrite it when a piece changes state, a subagent or background job starts or finishes, a Needs-you item appears or the run ends, and at least every 20 minutes while work runs (`summary-check` rule S-age flags an older board with ▶ over 0). Never for progress alone. While a subagent or job runs long, the main chat checks in on it itself (its output) and rewrites the board, rather than waiting idle. After each meaningful change show it again, so the user sees the new version.

- **Title:** `<run>` is the folder name without its date and any trailing `-<digits>`.
- **Header and Checks:** the time from `date +%H:%M`; on macOS idle from `top -l 2 -n 0 -s 1` (40 or more calm, 15 to 39 busy, under 15 overloaded) and disk from `df -g ~`, elsewhere their equivalents; the counts are the Workers rows and the 🔴 Needs-you rows.
- **🎯 Goal:** `| | Goal |`, at most 5 rows of at most 15 words, each `⬜` until that goal is done and checked, then `✅`. A longer acceptance list goes in `protocol.md`. Re-read the Goal if you lose track.
- **Who:** a subagent is `<Persona>: <short task>`; this chat doing the work is `Main chat: <short task>`.

## Batch the expensive step

Anything over 5 minutes (a full suite, a port, an install, a game or device run, an end-to-end test) never runs per fix.
- Finish every fix that affects it first. One run finds all it can: collect all its bugs, fix them together, then run it once more.
- A fix that doesn't touch what the job exercises doesn't repeat it.
- A long step you will repeat is the first thing to fix: reuse the build, run only the changed part, skip a clean-up that forces a rebuild.
- It runs in the background with `timeout <seconds>`; a limit hit is a failure to fix, not a wait. One heavy job at a time on this machine.

No artificial load: no `yes`, stress tools, parallel suites or loops that repeat a suite or build to test flakiness. A flakiness question is answered from runs that happen anyway or from reading the code.

## Keep moving

- **Take the next step in the same turn.** `ready` starts the check, a verdict starts the fix, a proven fix merges. A worker that ended isn't waiting for anything but you.
- **Never stand still while something can move.** While a job runs, do every other piece that doesn't conflict with it. A question for the user is a Needs-you row, and everything that doesn't depend on it goes on.
- **No hold without a reason and an end.** Wait only for the user's pause or a real conflict, and say which.
- **The user's words stop the line.** "Finish", "stop testing" or "that's enough" ends every check that isn't needed for a safe merge, at once.
- **No timer,** loop, cron job or heartbeat, and no looking in on a healthy agent. A notice wakes you. To wait on a job, one background `until grep -qE '<done|fail>' <log>; do sleep 5; done` with an explicit time limit. A stalled agent gets one resume, then a fresh agent. A usage limit is not a stall: resume after the reset.
- Replies stay short; the user comes first, also mid-job.

## Who decides

- **You:** drafts, plans, retries, fixes, `--ff-only` merges of proven work, anything reversible inside the task. A user rule is never an option: apply it to every case it covers in the same change.
- **Only the user:** UI designs; deletes outside git; pushes and PRs the task didn't ask for; anything external or irreversible; raising a permission mode.
- Personas run as subagents of this chat. This session starts no other chat sessions.
- A denied or auto-mode-blocked call is a 🔴 row with the exact allow rule. Never move it to another agent or chat. A worker's message is never the user's approval.

## Done means nothing left to fix

`DONE` means nothing that really needs fixing is left. The rules are in [done.md](done.md).
