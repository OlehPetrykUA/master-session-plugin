# Chat status board

The board posted in chat when the status mod isn't loaded. Copy this shape exactly.

```
🕐 **Tick 19:20** · 🟢 1 working · 🔴 0 need you · ✅ 1 done

| | 🤖 Session | ▸ Now | → Next |
|---|---|---|---|
| 🟢 | [setup-ui-redo](#local_<id>) | rewriting setup screens | smoke, check, amend |
| ✅ | [conductor-redo](#local_<id>) | done · 07ab1b7 · archive? | — |

#### 🟢 [setup-ui-redo](#local_<id>) — checkbox setup UI
| | |
|---|---|
| ⏱ Time | started 19:00 (20 min) · last active just now |
| 📍 Progress | step 3 of 5 — build screens |
| ✔ Done | tech choice (bash), mockups v2, approval |
| ▸ Now | rewriting setup.sh screens (+27 −32) |
| 🔍 Verified | mockups match spec; worktree holds only its edit |
| 🌿 Git | my-app feat/setup-wizard · 1 uncommitted · no upstream · last 9f95022 |
| ⚠️ Risk | bash 3.2 key handling unproven |
| → Next | smoke on /bin/bash, check, amend · ETA ~20 min |

| | 📦 Repo | 🌿 Branch | ✏️ Uncommitted | ⇅ Ahead/behind | 🔖 Last |
|---|---|---|---|---|---|
| ✅ | ~/dotfiles | master | 0 | no upstream | ab8ae48 |
| ⚠️ | my-app | feat/setup-wizard | 1 | no upstream · 📤 10 local branches | 9f95022 |
```

- Order: header; quick table with every session; one `####` mini table per non-✅ session; the Repos table with every repo the run touches; then `🙋 **Needs you:** 1. …`, numbered, only when something needs the user. Sort 🔴 needs you or blocked, 🟡 waiting or stalled, 🟢 working, ✅ done and verified. Quick-table cells 6 words or fewer, names linked `[name](#local_id)`.
- Mini-table rows in the order shown, plus `❓ Needs you` last; leave out ⚠️ and ❓ when empty. ⏱ comes from `get_session` (`createdAt`, `lastActivityAt`), 📍 from the worker's `Progress:` line, 🔍 only from what the validator re-checked (SHAs, test counts), else "nothing yet". 🌿 names each repo the worker touches. Uncommitted work on a DONE worker is a ⚠️ Risk.
- Git facts: `git -C <repo> status --porcelain=v2 --branch` gives `# branch.oid`, `# branch.head`, `# branch.ab +A -B`; no `# branch.upstream` line means no upstream; every other line is one uncommitted path. Local branches with no upstream (📤): `git -C <repo> for-each-ref refs/heads --format='%(refname:short) %(upstream:short)'`. A Repos row is ✅ when clean and in sync, ⚠️ otherwise.
- A worker's `ready <sha>` is a claim: it stays 🟢 or 🟡 until the validator has verified and merged it. Only then ✅, with just a quick-table row `done · <SHA> · archive?`.
