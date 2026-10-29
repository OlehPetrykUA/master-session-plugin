# summary.md spec

A summary.md is valid only when `summary-check` prints nothing for it. After every rewrite run `python3 <this skill's folder>/scripts/summary-check <run folder>/summary.md` (this folder is `${CLAUDE_SKILL_DIR}` in Claude Code; in Copilot CLI it is `skills/start` inside the plugin folder, two levels up from a skill file) and fix every line it prints before posting. Each line reads `<file>:<line>: <rule id> <message>`; the rule ids below are those names. Exit 0 means valid, 1 means violations, 2 means a usage error or an unreadable file. For the orchestrator, add `--archived <id>[,<id>…]` with the ids of its archived or retired chats. `summary-check --self-test` tests the checker against `tests/summary/`.

Two kinds exist: a master session summary (title 🏭, section 🤖 Workers) and the chat orchestrator summary (title 🎼, section 💬 Chats). U+FE0F (variation selector 16) is removed before anything is compared, so ⚠ and ⚠️ are the same; everything else is compared exactly. Copy the examples at the end and change only the values.

## Must

1. **S-file:** UTF-8; LF line ends only; no tab; the file ends with exactly one `\n`; no trailing whitespace; never two blank lines in a row. No fenced code block (``` or ~~~), no `━`, no horizontal rule (a line of 3 or more `-`, `*` or `_`, spaces allowed). No HTML tag outside inline code, except `<br>` inside a 🛡 Checks State cell. Every line must belong to a form the sections below allow: nothing extra anywhere.
2. **S-title:** line 1 is exactly `# 🏭 <run> summary` (master) or `# 🎼 Orchestrator summary` (orchestrator). `<run>` is the run folder's name without its `YYYY-MM-DD-` prefix and without a trailing `-<digits>` (folder `2026-10-29-copilot-load-2` gives `copilot-load`). An unknown line 1 stops all other checks.
3. **S-header:** line 2 is blank. Line 3 is exactly `> **Updated HH:MM** · ▶ N working · 🟡 N waiting · 🔴 N need you · ⏸ N paused · ✅ N done · 🖥 PC <calm|busy|overloaded> (N% idle) · 💾 N GB free`. HH:MM is 24-hour, every N a non-negative integer, in this order, nothing else; `⏸ N paused` is always present, 0 when none. Line 4 is blank.
4. **S-counts:** ▶, 🟡, ⏸ and ✅ equal the number of Workers or Chats rows with that marker. 🔴 equals the number of 🔴 items in 🙋 Needs you.
5. **S-pc:** idle 40 or more is `calm`; idle under 15 is `overloaded`; idle 15 to 39 is `busy`, or `overloaded` when the load is over 1.2 × the cores.
6. **S-time:** the minute of the file's last write (local time) minus the minute of Updated, modulo 24 hours, is 0 to 10 minutes. Write the stamp from the clock at the moment of the write; never invent or reuse one.
7. **S-sections:** after the header come these `## ` headings, each exactly once, in this order: `## 🎯 Goal right now`, `## 🤖 Workers` (master) or `## 💬 Chats` (orchestrator), `## 🗺 Plan`, `## 🙋 Needs you`, `## 🛡 Checks`, `## 📦 Results`, optional `## ⏸ Later`, `## 🔭 Current state`. No other heading of any level, no text between the header and the first heading, one blank line before and after each heading, and no blank line inside a section's body.
8. **S-goal:** exactly one line; it starts with a bold span and holds exactly one bold span.
9. **S-rows:** the Workers or Chats table header is exactly `| | Worker | Doing now | Next |` (master) or `| | Chat | Doing now | Next |` (orchestrator); the align row is exactly `|:-:|---|---|---|`; then zero or more rows of 4 cells.
   - Marker is one of ▶ 🟡 ⏸ ✅. A blocked worker or chat is 🟡 and its blocker is a 🔴 item in Needs you.
   - Rows are sorted 🟡, ▶, ⏸, ✅.
   - The name cell follows S-names: master always bold, orchestrator always a link.
   - Doing now and Next hold 1 to 10 words each. A ✅ row's Doing now starts with `Done`; its Next is exactly `—`.
10. **S-names:** a master display name is `<Persona>: <short task>`, Persona one of Implementer, Refactorer, Code reviewer, QA verifier, Design checker, Researcher, Investigator, Spec writer, Architect, Designer, Explore, Plan, and the short task 2 to 5 words; it is never a link. An orchestrator chat name is always `[<text>](#local_<uuid>)` with a lowercase 8-4-4-4-12 hex uuid, never bold. A chat with no session yet is not a Chats row; it appears only in Plan with Who `—`.
11. **S-links:** in an orchestrator file every `local_` id sits inside a chat link; a master file has no `#local_` link. Links other than chat links appear only in 📦 Results.
12. **S-archived:** with `--archived`, any listed id anywhere in the file is a violation. Archived or retired chats are never listed.
13. **S-plan:** master header `| Step | Tier | Who | Status |` with align `|---|---|---|:-:|`; orchestrator header `| Step | Who | Status |` with align `|---|---|:-:|`; at least one row. Status is one of ✅ ▶ ⏳ ⏸ ✖. Tier is `T0`, `T1`, `T2`, `T3` or `doc`, optionally followed by ` risk`. A ▶ row's Step is one bold span covering the whole cell; other Steps hold no bold. A ✖ row's Step ends with ` (dropped: <why>)`. Master Who is a plain (not bold) display name per S-names, `Validator` or `—`. Orchestrator Who is a chat link, `Orchestrator` or `—`.
14. **S-needs:** either the single line `✅ Nothing right now.`, or items numbered 1, 2, 3 … without gaps, each exactly `<n>. <urgency><kind> **<what>**: <how and where> (<when>)`. Urgency is 🔴 or 🟡; kind is one of 🖥 🔁 🗑 ✋ 🔑; no space between the two emojis; the line ends with the `(<when>)` group. A 🔴 item's when is exactly `now`; a 🟡 item's when is not `now`. All 🔴 items come before all 🟡 items.
15. **S-checks:** header exactly `| | Check | State |`, align `|:-:|---|---|`. Rows in this fixed order: one or more `Git`, then exactly one each of `To delete later`, `Leftovers`, `PC load`, `Disk`; no other row names. Markers are ✅ 🟡 🔴 ⚠️.
    - Git: State starts with a bold repo name and holds exactly one bold span (one repo per row).
    - To delete later: marker ✅ exactly when State is `none`, else 🟡 or ⚠️.
    - Leftovers: State is parts joined by `<br>`. The last part is `🗑 In the Trash: 0 items`, `🗑 In the Trash: 1 item, <size>` or `🗑 In the Trash: <n> items, <size>` (n 2 or more), optionally followed by ` (<details>)`; size is `<number> <KB|MB|GB|TB>`. Before it comes either the single part `none open`, or one or more leftover parts followed by any `⚠ keep in Trash: <path>` parts. Marker ⚠️ when any ⚠ part exists (and Needs you then holds a 🔴🗑 item), else ✅ when `none open`, else 🟡.
    - PC load: State exactly `<word> · CPU N% idle` with the header's word and N; marker ✅ calm, 🟡 busy, ⚠️ overloaded.
    - Disk: State exactly `N GB free` with the header's N; marker ✅ or ⚠️.
16. **S-results:** either the single line `None yet.`, or `- ` bullets. Each bullet starts with a name: master a bold display name per S-names or `**Validator**`; orchestrator a chat link or `**Orchestrator**`. `  - ` sub-bullets (two spaces) are allowed.
17. **S-later:** when present, exactly one line: items joined by ` · `, ending with `.`.
18. **S-state:** 2 to 4 `- ` bullets, no sub-bullets, each starting with a name as in S-results.

## Where the values come from

Write it from the same facts as the chat board, never pasted from it. The Leftovers row lists the open rows of `protocol.md` → Leftovers (`| Path | Size | Owner | Why | When it goes |`), each as path, size, owner and when it goes, then `🗑 In the Trash: <n> items, <size>` summed from the `🗑` rows. Disk is the Avail column of `df -g ~` (GiB blocks, `man df`). `## ⏸ Later` appears only when a later backlog (dropped or deferred extras) exists.

## Master example

```markdown
# 🏭 demo-run summary

> **Updated 12:00** · ▶ 1 working · 🟡 1 waiting · 🔴 1 need you · ⏸ 1 paused · ✅ 1 done · 🖥 PC calm (62% idle) · 💾 33 GB free

## 🎯 Goal right now

**A setup wizard that installs my-app in one run.**

## 🤖 Workers

| | Worker | Doing now | Next |
|:-:|---|---|---|
| 🟡 | **QA verifier: check setup build** | Waiting on the ready sha | Gate and verdict |
| ▶ | **Implementer: setup build** | Rewriting the setup screens | Smoke test, then check |
| ⏸ | **Researcher: install flags** | Paused until the build lands | Answer the flag question |
| ✅ | **Implementer: conductor build** | Done · 07ab1b7 on master | — |

## 🗺 Plan

| Step | Tier | Who | Status |
|---|---|---|:-:|
| Conductor build | T2 | Implementer: conductor build | ✅ |
| **Setup build** | T3 risk | Implementer: setup build | ▶ |
| Setup check | T1 | QA verifier: check setup build | ⏳ |
| Install flags | doc | Researcher: install flags | ⏸ |
| Silent install (dropped: not needed) | T0 | — | ✖ |

## 🙋 Needs you

1. 🔴🔁 **Reload the plugin**: run `/reload-plugins` in your own chat (now)
2. 🟡🗑 **Move the old worktree to the Trash**: `wt-my-app-setup-build`, in your terminal (after the merge)

## 🛡 Checks

| | Check | State |
|:-:|---|---|
| ✅ | Git | **my-app** master, clean |
| 🟡 | Git | **dotfiles** branch `setup-ui` 9f95022, merges after the verdict |
| 🟡 | To delete later | worktree `wt-my-app-setup-build` after the merge |
| 🟡 | Leftovers | `~/my-app/dist` 786 MB, Implementer: setup build, after merge<br>🗑 In the Trash: 2 items, 1.2 GB (`~/Downloads/old.zip` 1.2 GB) |
| ✅ | PC load | calm · CPU 62% idle |
| ✅ | Disk | 33 GB free |

## 📦 Results

- **Implementer: conductor build** merged and verified: 07ab1b7 on master
- **Validator** approved the setup design: [canvas](https://example.com/canvas) v4
  - Light and dark states both match

## ⏸ Later

Dark-mode setup screens · silent install flag.

## 🔭 Current state

- **Implementer: setup build** is rewriting the setup screens, then runs a smoke test and its check.
- **QA verifier: check setup build** waits for the ready sha; next comes the gate and a verdict.
```

## Orchestrator example

```markdown
# 🎼 Orchestrator summary

> **Updated 12:00** · ▶ 1 working · 🟡 1 waiting · 🔴 1 need you · ⏸ 1 paused · ✅ 1 done · 🖥 PC busy (28% idle) · 💾 120 GB free

## 🎯 Goal right now

**Finish the skills work**, then start the setup cleanup.

## 💬 Chats

| | Chat | Doing now | Next |
|:-:|---|---|---|
| 🟡 | [Setup cleanup](#local_11111111-1111-4111-8111-111111111111) | Waiting for the skills chat | Design one structure |
| ▶ | [Skills work](#local_22222222-2222-4222-8222-222222222222) | Writing the strict summary spec | Check script and tests |
| ⏸ | [Game port](#local_33333333-3333-4333-8333-333333333333) | Paused by you | Resume on your word |
| ✅ | [Hook review](#local_44444444-4444-4444-8444-444444444444) | Done · both fixes merged | — |

## 🗺 Plan

| Step | Who | Status |
|---|---|:-:|
| Hook review | [Hook review](#local_44444444-4444-4444-8444-444444444444) | ✅ |
| **Strict summary spec** | [Skills work](#local_22222222-2222-4222-8222-222222222222) | ▶ |
| One structure in the agents folder | [Setup cleanup](#local_11111111-1111-4111-8111-111111111111) | ⏳ |
| Game app hand-off | [Game port](#local_33333333-3333-4333-8333-333333333333) | ⏸ |
| Toolkit review | — | ⏳ |
| Weekly report (dropped: not wanted) | Orchestrator | ✖ |

## 🙋 Needs you

1. 🔴🔁 **Restart the app**: new agent definitions load only after a restart (now)
2. 🟡🗑 **Old CLI versions**: about 674 MB in `~/.local/share/claude/versions` (when convenient)

## 🛡 Checks

| | Check | State |
|:-:|---|---|
| ✅ | Git | **plugin** main 360e0fd, clean |
| ✅ | To delete later | none |
| ✅ | Leftovers | none open<br>🗑 In the Trash: 1 item, 4 KB |
| 🟡 | PC load | busy · CPU 28% idle |
| ✅ | Disk | 120 GB free |

## 📦 Results

None yet.

## 🔭 Current state

- [Skills work](#local_22222222-2222-4222-8222-222222222222) is writing the strict summary spec, then the check script.
- [Setup cleanup](#local_11111111-1111-4111-8111-111111111111) waits for it; next comes the design.
- **Orchestrator** keeps the others paused until the skills chat is done.
```
