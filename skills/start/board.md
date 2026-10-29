# Chat status board

The board is posted in chat in every reply to the user; a tick only rewrites summary.md (below). Every part is always shown, in this order; the board opens with the BOARD fence line and closes with the END fence line right after 🔭 Current state, so its boundaries are plain; a reply to the user adds the Answer at the bottom, below the closing fence, so the user never scrolls up. Post this shape exactly, as plain markdown, never inside a code block: tables, bold and the fence lines must render.

━━━━━━━━━━ 🏭 BOARD · 19:20 · run setup-wizard ━━━━━━━━━━
🟢 1 working · 🟡 1 waiting · 🔴 0 need you · ✅ 2 done · next tick 19:25

| | 🤖 Worker | ▸ Now | → Next |
|---|---|---|---|
| 🟡 | QA verifier: check setup build | waiting on ready sha | verdict |
| 🟢 | Implementer: setup build | rewriting setup screens | smoke, check, amend |
| ✅ | Implementer: conductor build | done · 07ab1b7 | — |
| ✅ | Designer: setup design | approved v4 | — |

#### 🟢 Implementer: setup build — checkbox setup UI
| | |
|---|---|
| ⏱ Time | spawned 19:00 (20 min) · last status 19:19 |
| 📍 Progress | step 3 of 5 — build screens |
| ✔ Done | tech choice (bash), setup design v4 approved |
| ▸ Now | rewriting setup.sh screens, edits so far committed (+27 −32) |
| 🔍 Verified | mockups match spec; worktree holds only its commit |
| 🌿 Git | my-app wt-my-app-setup-build, detached · 0 uncommitted · last 9f95022 |
| ⚠️ Risk | bash 3.2 key handling unproven |
| → Next | smoke on /bin/bash, check, amend · ETA ~20 min |

#### 🟡 QA verifier: check setup build
| | |
|---|---|
| ▸ Now | waiting on the ready sha |
| → Next | gate, verdict |

**📋 Plan**
1. ✅ Conductor build · T1 · merged 07ab1b7
2. ✅ Setup design · doc · approved v4
3. ▶ Setup build · T3 · Implementer: setup build, step 3 of 5 — build screens
4. ⏳ Follow-ups · T1 · nit backlog
5. ⏳ Wrap-up · T0 · Done step
6. ✖ Setup import · T3 · dropped: user cut the import screen

**🙋 Needs you**
1. 🟡🔁 After QA verifier: check setup build passes: reload the plugin with `/reload-plugins` in the user's own chat
2. 🟡🗑 After the merge: move `~/.claude/worktrees/wt-my-app-setup-build` to Trash, in the user's terminal

**🛡 Standing checks**
- **Git safety:**
  - ✅ ~/dotfiles: committed and on master; nothing lives only in scratch
  - 🟡 my-app: committed on branch `setup-ui ＠ 9f95022`, owner Implementer: setup build, merges after the QA verdict
- **To delete later:**
  - worktree `wt-my-app-setup-build` (detached at 9f95022) · Implementer: setup build · holds the unmerged ready sha · after merge
  - branch `setup-ui` · Implementer: setup build · same commit 9f95022 as the worktree · after merge
  - branch `setup-import` · Implementer: setup import · piece dropped · owner retired ⚠
- ✅ PC load: CPU 62% idle · load 5.1 / 10 cores · no suites or builds

| | 📦 Repo | 🌿 Branch | ✏️ Uncommitted | ⇅ Ahead/behind | 🔖 Last |
|---|---|---|---|---|---|
| ✅ | ~/dotfiles | master | 0 | no upstream | ab8ae48 |
| ✅ | my-app | master | 0 | no upstream | 07ab1b7 |

**📦 Results so far**
- Implementer: conductor build merged and verified: 07ab1b7 on master
- Designer: setup design approved: [canvas](<canvas link>) v4

**🔭 Current state**
- Implementer: setup build is rewriting the setup screens; it waits for nothing, then runs a smoke test and its check.
- QA verifier: check setup build waits for the ready sha; next comes the gate and a verdict.
━━━━━━━━━━ 🏭 END ━━━━━━━━━━

**Answer:** yes, Implementer: conductor build is on master as 07ab1b7 and its check passed.

- **Header:** the fence line `━━━━━━━━━━ 🏭 BOARD · HH:MM · run <name> ━━━━━━━━━━` (the ledger's run name), then the line `🟢 N working · 🟡 N waiting · 🔴 N need you · ✅ N done · next tick HH:MM`: the counts of Quick-table rows by marker and the next tick time from the Heartbeat line.
- **summary.md:** every tick and every reply overwrite `<run folder>/summary.md` (start §6) with the Write tool, in its own template ([below](#summarymd-template)), not the chat board. It has no fence lines: no ━━━ lines, no `---` dividers; the fences stay in chat posts only. The user opens it from the app's files pane at any time.
- **Closing fence:** `━━━━━━━━━━ 🏭 END ━━━━━━━━━━`, right after 🔭 Current state.
- **Order:** header, Quick table, mini tables, 📋 Plan, 🙋 Needs you, 🛡 Standing checks, 📦 Results so far, 🔭 Current state, END fence; the Answer follows below it.
- **Names:** every worker is shown by its display name `<Persona>: <short task>` ([shape.md Names](shape.md#names)) in every place on the board that names who is doing something: the Quick table rows, the mini table headings, each Plan step, Needs you, Standing checks, Results lines, Current state and the Answer. The board lists only subagents and workflow agents, every name as plain text with no link. Agent IDs never show on the board. The Plan keeps the ledger's piece names (start §2, stable for life) and each ▶ step names its active worker by display name. A piece with no worker yet, or done inline, appears only in the Plan.
- **Quick table:** every subagent and workflow agent by its plain display name. Sort 🔴 needs you or blocked, 🟡 waiting or stalled, 🟢 working, ✅ done and verified. Cells 6 words or fewer.
- **Mini tables:** one `####` per non-✅ worker, rows in the order shown, plus `❓ Needs you` last; leave out ⚠️ and ❓ when empty. ⏱ comes from the spawn time in the ledger and the time of the agent's latest status line, ▸ Now (here and in the Quick table) from the worker's latest status line, 📍 from that line or its `Progress:` line, 🔍 only from what the validator re-checked (SHAs, test counts), else "nothing yet". 🌿 names each repo the worker touches. Uncommitted work on a DONE worker is a ⚠️ Risk.
- A worker's `ready <sha>` is a claim: it stays 🟢 or 🟡 until the validator has verified and merged it. Only then ✅, with just a quick-table row `done · <SHA>`.
- **Plan:** every piece of the whole run, queued ones included, written from the ledger's Plan table on every board, in plan order, each step `<n>. <marker> <piece name> · <tier> · <detail>`: marker, the ledger's piece name unchanged, tier (T0 to T3, or `doc`), then the detail. A ▶ step's detail starts with the display name of whoever is on it now: the builder while working, the QA verifier or Code reviewer while checking (`QA verifier: check setup build, round 0`), the builder during a fix round. A step in the checking state reads `▶ Setup build · T3 · QA verifier: check setup build, round 0`. ✅ done (merged sha, or "approved" for a doc piece), ▶ working or verifying (the worker's `step N of M — label`, or the check and its round), ⏳ queued, ⏸ paused (during a pause), ✖ dropped (with why).
  - A piece is a deliverable of any shape (subagent, workflow); helpers (QA verifier, Code reviewer, Researcher checks) are not pieces.
  - States move one way: queued, working when spawned, verifying from its first ready sha (it stays verifying through checks, fix rounds, rebases and the user's approval), done when merged or, for a doc piece, approved.
  - A fix round after a FAIL adds no piece; work the user adds mid-run adds one. Never move a piece back; never delete a piece: abandoned or split work is dropped.
  - Never list done work as a summary piece. Post the full plan on the first board, before the first spawn.
- **Needs you:** every action the user must take, numbered in the order to do them. Each item starts with one urgency emoji and one kind emoji, then the exact command or action and the chat or place. `✅ Nothing right now.` when empty. The emojis are defined here for the writer only. Never print this legend on a board.
  - Urgency: 🔴 blocking now · 🟡 later or after X (name X).
  - Kind: 🖥 run a command · 🔁 restart or reload · 🗑 Trash or files · ✋ decision · 🔑 sign-in or approval.
- **Standing checks:** recomputed from fresh commands on every board, never copied from the last one.
  - Git safety: one line per repo the run touches, with exactly one of: ✅ committed and on main (and pushed, when the user's task asked for a push); 🟡 committed on a branch not yet merged, written `branch ＠ sha`, with its owner and when it merges; 🔴 uncommitted: the path count and whose they are (a working worker's own worktree edit is its owner's). The line also says nothing the run needs lives only in a scratch folder.
  - To delete later: a list of every extra worktree and branch the run made, each with its owner, why it still exists and when it goes ("after merge", "after QA verdict", "owner retired ⚠"). Take them from `git worktree list --porcelain` and `git for-each-ref refs/heads`. A live worker's or checker's detached worktree is fine; one whose owner is retired or gone is ⚠. A removed entry leaves the list.
  - Merged check: a branch counts as merged when `git branch --merged main` lists it ("only list branches whose tips are reachable from <commit>", git-branch(1)), or when `git cherry main <branch>` prints only `-` lines ("prefixed with - for commits that have an equivalent in <upstream>, and + for commits that do not", git-cherry(1)), which catches the rebase-merged case where the tips differ. Use `--merged` first; use `git cherry` when it does not list the branch; fall back to the tree compare `git diff --quiet main <branch>` (exit 0, same content) when a squash merge leaves no equivalent commits; it can under-report a squash-merged branch whose files main changed later, which is safe for a delete list.
  - Then the Repos table, every repo the run touches.
  - Git facts: `git -C <repo> status --porcelain=v2 --branch` gives `# branch.oid`, `# branch.head`, `# branch.ab +A -B`; no `# branch.upstream` line means no upstream; every other line is one uncommitted path. It reads only that checkout: read a worker's worktree with `git -C <its worktree> status`, for its mini table's 🌿 row. Local branches with no upstream (📤): `git -C <repo> for-each-ref refs/heads --format='%(refname:short) %(upstream:short)'`. A Repos row is ✅ when clean and in sync, ⚠️ otherwise.
  - PC load: CPU idle, 1-minute load over core count, heavy jobs (suites, builds), from `sysctl -n vm.loadavg`, `sysctl -n hw.ncpu`, `top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1` and `ps -Ao %cpu,command` filtered for test suites and builds. ⚠️ when idle is under 15%, or the load is over 1.2 × cores with idle under 35%. It is a report, not a wait: it never holds doc-only work and adds no wait to start's "Count and waits".
- **Results so far:** one line per finished result (a merged and verified sha, an approved doc with its link, a push, a PR), with its link or key fact. Each line starts with the display name of who delivered it (`<Persona>: <piece name>`), then the fact. Each result repeats on every board until the user says "acknowledged" for it (or for all); then it moves to the Acknowledged list in the ledger's `protocol.md` and leaves the board. `None yet.` when empty.
- **🔭 Current state:** 2 to 4 short bullets on what is happening right now. Each names the worker by display name, says what it is doing, what it waits for and what comes next.
- **Answer:** only when replying to the user: the answer to their message, at the bottom, below the closing fence, never inside the board. The full board always comes first, answer at the bottom.
- A tick posts nothing in chat: it rewrites summary.md and updates `last tick`. It posts one short line only when a new 🔴 Needs-you item appears, and still sends the `PushNotification`. A reply to the user always posts the full board in chat, answer below END, and rewrites summary.md at the same moment. There is no other short form.

## summary.md template

Written from the same facts as the chat board, never pasted from it. Bold the key items. Fill every section; `## ⏸ Later` is optional, one line, only when a later backlog (dropped or deferred extras) exists. The Checks rows are Git (one row per repo), To delete later, PC load and Disk. Disk is the Avail column of `df -g ~` (GiB blocks, `man df`). PC reads calm, busy or overloaded.

# 🏭 setup-wizard summary

> **Updated 19:20** · ▶ 1 working · 🟡 1 waiting · 🔴 0 need you · ✅ 2 done · 🖥 PC calm (62% idle) · 💾 33 GB free

## 🎯 Goal right now

**A setup wizard that installs and configures my-app in one run.**

## 🤖 Workers

| | Worker | Doing now | Next |
|:-:|---|---|---|
| ▶ | **Implementer: setup build** | Rewriting setup screens | Smoke, check, amend |
| 🟡 | **QA verifier: check setup build** | Waiting on the ready sha | Verdict |
| ✅ | **Implementer: conductor build** | Done · 07ab1b7 | — |

## 🗺 Plan

| Step | Tier | Who | Status |
|---|---|---|:-:|
| Conductor build | T2 | Implementer: conductor build | ✅ |
| **Setup build** | T3 | Implementer: setup build | ▶ |
| Setup import | T1 | Implementer: setup import | ⏳ |

## 🙋 Needs you

1. 🟡🔁 After QA verifier: check setup build passes: **reload the plugin** with `/reload-plugins` in your own chat
2. 🟡🗑 After the merge: **move `~/.claude/worktrees/wt-my-app-setup-build` to Trash**, in your terminal

## 🛡 Checks

| | Check | State |
|:-:|---|---|
| ✅ | Git | **~/dotfiles** master, clean, nothing only in scratch |
| 🟡 | Git | **my-app** branch `setup-ui` 9f95022, merges after the QA verdict |
| 🟡 | To delete later | worktree `wt-my-app-setup-build`, branch `setup-ui` · after merge |
| ✅ | PC load | calm · CPU 62% idle |
| ✅ | Disk | 33 GB free |

## 📦 Results

- **Implementer: conductor build** merged and verified: 07ab1b7 on master
- **Designer: setup design** approved: [canvas](<canvas link>) v4

## ⏸ Later

Dark-mode setup screens · silent install flag.

## 🔭 Current state

- **Implementer: setup build** is rewriting the setup screens, then runs a smoke test and its check.
- **QA verifier: check setup build** waits for the ready sha; next comes the gate and a verdict.
