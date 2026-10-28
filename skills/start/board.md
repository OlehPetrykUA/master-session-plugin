# Chat status board

The board posted on every tick that has news and in every reply to the user. Every part is always shown, in this order; the board opens with the BOARD fence line and closes with the END fence line right after the Summary, so its boundaries are plain; a reply to the user adds the Answer at the bottom, below the closing fence, so the user never scrolls up. Copy this shape exactly.

```
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
| ▸ Now | rewriting setup.sh screens (+27 −32) |
| 🔍 Verified | mockups match spec; worktree holds only its edit |
| 🌿 Git | my-app wt-my-app-setup-build, detached · 1 uncommitted · last 9f95022 |
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
Nothing right now.

**🛡 Standing checks**
- ✅ Git safety: main checkouts clean; 1 uncommitted path only in Implementer: setup build's own worktree; no stray worktrees; nothing only in scratch
- ✅ PC load: CPU 62% idle · load 5.1 / 10 cores · no suites or builds

| | 📦 Repo | 🌿 Branch | ✏️ Uncommitted | ⇅ Ahead/behind | 🔖 Last |
|---|---|---|---|---|---|
| ✅ | ~/dotfiles | master | 0 | no upstream | ab8ae48 |
| ✅ | my-app | master | 0 | no upstream | 07ab1b7 |

**📦 Results so far**
- Implementer: conductor build merged and verified: 07ab1b7 on master
- Designer: setup design approved: [canvas](<canvas link>) v4

**Summary:** Implementer: setup build is on its screens, then a smoke run and its check; nothing needs you.
━━━━━━━━━━ 🏭 END ━━━━━━━━━━

**Answer:** yes, Implementer: conductor build is on master as 07ab1b7 and its check passed.
```

- **Header:** the fence line `━━━━━━━━━━ 🏭 BOARD · HH:MM · run <name> ━━━━━━━━━━` (the ledger's run name), then the line `🟢 N working · 🟡 N waiting · 🔴 N need you · ✅ N done · next tick HH:MM`: the counts of Quick-table rows by marker and the next tick time from the Heartbeat line.
- **Closing fence:** `━━━━━━━━━━ 🏭 END ━━━━━━━━━━`, right after the Summary line.
- **Names:** every worker is shown by its display name `<Persona>: <short task>` ([shape.md Names](shape.md#names)) in every place on the board that names who is doing something: the Quick table rows, the mini table headings, each Plan step, Needs you, Standing checks, Results lines, the Summary line and the Answer. The board lists only subagents and workflow agents, every name as plain text with no link. Agent IDs never show on the board. The Plan keeps the ledger's piece names (start §2, stable for life) and each ▶ step names its active worker by display name. A piece with no worker yet, or done inline, appears only in the Plan.
- **Quick table:** every subagent and workflow agent by its plain display name. Sort 🔴 needs you or blocked, 🟡 waiting or stalled, 🟢 working, ✅ done and verified. Cells 6 words or fewer.
- **Mini tables:** one `####` per non-✅ worker, rows in the order shown, plus `❓ Needs you` last; leave out ⚠️ and ❓ when empty. ⏱ comes from the spawn time in the ledger and the time of the agent's latest status line, ▸ Now (here and in the Quick table) from the worker's latest status line, 📍 from that line or its `Progress:` line, 🔍 only from what the validator re-checked (SHAs, test counts), else "nothing yet". 🌿 names each repo the worker touches. Uncommitted work on a DONE worker is a ⚠️ Risk.
- A worker's `ready <sha>` is a claim: it stays 🟢 or 🟡 until the validator has verified and merged it. Only then ✅, with just a quick-table row `done · <SHA>`.
- **Plan:** every piece of the whole run, queued ones included, written from the ledger's Plan table on every board, in plan order, each step `<n>. <marker> <piece name> · <tier> · <detail>`: marker, the ledger's piece name unchanged, tier (T0 to T3, or `doc`), then the detail. A ▶ step's detail starts with the display name of whoever is on it now: the builder while working, the QA verifier or Code reviewer while checking (`QA verifier: check setup build, round 0`), the builder during a fix round. A step in the checking state reads `▶ Setup build · T3 · QA verifier: check setup build, round 0`. ✅ done (merged sha, or "approved" for a doc piece), ▶ working or verifying (the worker's `step N of M — label`, or the check and its round), ⏳ queued, ⏸ paused (during a pause), ✖ dropped (with why).
  - A piece is a deliverable of any shape (subagent, workflow); helpers (QA verifier, Code reviewer, Researcher checks) are not pieces.
  - States move one way: queued, working when spawned, verifying from its first ready sha (it stays verifying through checks, fix rounds, rebases and the user's approval), done when merged or, for a doc piece, approved.
  - A fix round after a FAIL adds no piece; work the user adds mid-run adds one. Never move a piece back; never delete a piece: abandoned or split work is dropped.
  - Never list done work as a summary piece. Post the full plan on the first board, before the first spawn.
- **Needs you:** numbered, each with the exact command or action; `Nothing right now.` when empty.
- **Standing checks:** recomputed from fresh commands on every board, never copied from the last one; one line each with ✅ or ⚠️.
  - Git safety: for each repo the run touches, no uncommitted path outside a working worker's own worktree; every worktree is on a named branch or is a live worker's or checker's detached worktree (`git worktree list --porcelain`), which is ✅ even with an unmerged ready sha; a detached worktree whose worker or checker is retired or gone is ⚠️; merged work is pushed when the user's task asked for a push; nothing the run needs lives only in a scratch folder. Then the Repos table, every repo the run touches.
  - Git facts: `git -C <repo> status --porcelain=v2 --branch` gives `# branch.oid`, `# branch.head`, `# branch.ab +A -B`; no `# branch.upstream` line means no upstream; every other line is one uncommitted path. It reads only that checkout: read a worker's worktree with `git -C <its worktree> status`, for its mini table's 🌿 row. Local branches with no upstream (📤): `git -C <repo> for-each-ref refs/heads --format='%(refname:short) %(upstream:short)'`. A Repos row is ✅ when clean and in sync, ⚠️ otherwise.
  - PC load: CPU idle, 1-minute load over core count, heavy jobs (suites, builds), from `sysctl -n vm.loadavg`, `sysctl -n hw.ncpu`, `top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1` and `ps -Ao %cpu,command` filtered for test suites and builds. ⚠️ when idle is under 15%, or the load is over 1.2 × cores with idle under 35%. It is a report, not a wait: it never holds doc-only work and adds no wait to start's "Count and waits".
- **Results so far:** one line per finished result (a merged and verified sha, an approved doc with its link, a push, a PR), with its link or key fact. Each line starts with the display name of who delivered it (`<Persona>: <piece name>`), then the fact. Each result repeats on every board until the user says "acknowledged" for it (or for all); then it moves to the Acknowledged list in the ledger's `protocol.md` and leaves the board. `None yet.` when empty.
- **Summary:** one plain sentence: where the run is, what comes next, whether anything needs the user; it names each actor it mentions by display name.
- **Answer:** only when replying to the user: the answer to their message, at the bottom, below the closing fence, never inside the board. The full board always comes first, answer at the bottom.
- A tick with no news posts nothing; it only updates `last tick`. A reply to the user always gets the full board. There is no short form.
