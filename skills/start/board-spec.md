# summary.md spec

A summary.md is valid only when `summary-check` prints nothing for it. Run `python3 <this skill's folder>/scripts/summary-check <run folder>/summary.md` (this folder is `${CLAUDE_SKILL_DIR}`) and fix every line it prints. Each line reads `<file>:<line>: <rule id> <message>`; the rule ids below are those names. Exit 0 means valid, 1 means violations, 2 means a usage error or an unreadable file. For the orchestrator, add `--archived <id>[,<id>…]` with the ids of its archived or retired chats. `summary-check --self-test` tests the checker against the plugin's `tests/summary/`.

A master session (title 🏭, section 🤖 Workers) and a chat orchestrator (title 🎼, section 💬 Chats, a chat that runs other chats) write the same board; the rules say where they differ. A master session needs only its example at the end, and a rule here when the checker prints one. Old forms pass only under rule S-short. U+FE0F (variation selector 16) is removed before anything is compared, so ⚠ and ⚠️ are the same; everything else is compared exactly. Copy the examples at the end and change only the values.

## Must

1. **S-file:** UTF-8; LF line ends only; no tab; the file ends with exactly one `\n`; no trailing whitespace; never two blank lines in a row. No fenced code block (a line whose content starts with ``` or ~~~, also after indentation or a list marker such as `  - ` or `1. `), no `━`, no horizontal rule (a line of 3 or more `-`, `*` or `_`, spaces allowed). No HTML tag outside inline code. Every line must belong to a form the sections below allow: nothing extra anywhere.
2. **S-title:** line 1 is exactly `# 🏭 <run> summary` (master) or `# 🎼 Orchestrator summary` (orchestrator). `<run>` is the run folder's name without its `YYYY-MM-DD-` prefix and without a trailing `-<digits>` (folder `2026-10-29-copilot-load-2` gives `copilot-load`). An unknown line 1 stops all other checks.
3. **S-header:** line 2 is blank. Line 3 is exactly `> **Updated HH:MM** · ▶ N working · 🟡 N waiting · 🔴 N need you · ⏸ N paused · ✅ N done · 🖥 PC <calm|busy|overloaded> (N% idle) · 💾 N GB free`. HH:MM is 24-hour, every N a non-negative integer, in this order, nothing else; `⏸ N paused` is always present, 0 when none. Line 4 is blank.
4. **S-counts:** ▶, 🟡, ⏸ and ✅ equal the number of Workers or Chats rows with that marker. 🔴 equals the number of 🔴 rows in 🙋 Needs you. When the Workers or Chats table (or the Needs-you table) has its own S-rows (or S-needs) violation, its counts are not compared until that is fixed.
5. **S-pc:** idle 40 or more is `calm`; idle under 15 is `overloaded`; idle above 100 is invalid; idle 15 to 39 is `busy`, or `overloaded` when the load is over 1.2 × the cores.
6. **S-time:** the minute of the file's last write (local time) minus the minute of Updated, modulo 24 hours, is 0 to 10 minutes. Write the stamp from the clock at the moment of the write; never invent or reuse one.
   **S-age:** while the header shows `▶ N working` with N over 0, neither Updated nor the file's last write is more than 20 minutes before now (`--max-age <minutes>` or `$SUMMARY_MAX_AGE` changes the limit). A board with nothing working is exempt. Rewrite the board when a subagent or background job starts or finishes, and at least every 20 minutes while work runs.
7. **S-sections:** after the header come these `## ` headings, each exactly once, in this order: `## 🙋 Needs you`, `## 🎯 Goal`, `## 🔭 Current state`, `## 🤖 Workers` (master) or `## 💬 Chats` (orchestrator), `## 🗺 Plan`, `## 🧩 Still open`, `## 🛡 Checks`, optional `## ⏸ Later`. No other heading of any level, no text between the header and the first heading, one blank line before and after each heading, and no blank line inside a section's body.
8. **S-goal:** a table whose first column is a tick: `⬜` not done, `✅` done. Tick a row when its goal is done and checked, not before. Orchestrator: header exactly `| | Chat | Finish line |`, align `|:-:|---|---|`, then one row per chat: its tick, its chat link and its finish line, with a row for every Chats row. It's what the orchestrator checks a DONE against. Master: header exactly `| | Goal |`, align `|:-:|---|`, then 1 to 5 rows, one per piece or group of pieces, each Goal at most 15 words. A longer acceptance list goes in `protocol.md` or the spec note, never here.
9. **S-rows:** the Workers or Chats table header is exactly `| | Worker | Doing now | Next |` (master) or `| | Chat | Doing now | Next |` (orchestrator); the align row is exactly `|:-:|---|---|---|`; then zero or more rows of 4 cells.
   - Marker is one of ▶ 🟡 ⏸ ✅. A blocked worker or chat is 🟡 and its blocker is a 🔴 row in Needs you.
   - Rows are sorted 🟡, ▶, ⏸, ✅.
   - The name cell follows S-names: master always bold, orchestrator always a link.
   - Doing now and Next hold 1 to 10 words each. A ✅ row's Doing now starts with `Done`; its Next is exactly `—`.
10. **S-names:** a master display name is `<Persona>: <short task>`, Persona one of Main chat (the chat doing the work itself), Implementer, Refactorer, Code reviewer, QA verifier, Design checker, Researcher, Investigator, Spec writer, Architect, Designer, Explore, Plan, and the short task 2 to 5 words; it is plain text inside its bold, never a link, inline code or nested emphasis. An orchestrator chat name is always `[<text>](#local_<uuid>)` with a lowercase 8-4-4-4-12 hex uuid, never bold. A chat with no session yet is not a Chats row; it appears only in Plan with Who `—`.
11. **S-links:** in an orchestrator file every `local_` id sits inside a chat link; a master file has no `#local_` link. Links other than chat links appear nowhere.
12. **S-archived:** with `--archived`, any listed id anywhere in the file is a violation. Archived or retired chats are never listed.
13. **S-plan:** header `| Step | Who | Status |` with align `|---|---|:-:|`; at least one row. Status is one of ✅ ▶ ⏳ ⏸ ✖. A ▶ row's Step is one bold span covering the whole cell; other Steps hold no bold. A ✖ row's Step ends with ` (dropped: <why>)`. Master Who is a plain (not bold) display name per S-names, `Main chat` or `—`. Orchestrator Who is a chat link, `Orchestrator` or `—`. An orchestrator chat with no session yet appears only in Plan: its Step names it in plain text and its Who is `—`; it is not a Chats row.
14. **S-needs:** either the single line `✅ Nothing right now.`, or a table: header exactly `| # | | What | How | When |`, align `|---|:-:|---|---|---|`, at least one row of 5 cells, numbered 1, 2, 3 … without gaps. The marker cell is `<urgency><kind>` with no space: urgency 🔴 or 🟡, kind one of 🖥 🔁 🗑 ✋ 🔑. What is plain text, never bold. How says how and where; a command in it is inline code. When: a 🔴 row's is exactly `now`, a 🟡 row's is not `now`. All 🔴 rows come before all 🟡 rows.
    - In any table cell a literal `|` is written `\|`, also inside inline code, or it ends the cell: GFM spec section 4.10 (https://github.github.com/gfm/#tables-extension-) puts a pipe in a cell "by escaping it, including inside other inline spans", its Example 200's `` `\|` `` renders `<code>|</code>`, and by Example 204 excess cells are ignored, so an unescaped pipe silently cuts the command. The raw file holds `\|` and the rendered page shows `|`, so a command is copied from the rendered page. A command with no pipe needs no escape.
15. **S-open:** either the single line `✅ Nothing open.`, or a table: header exactly `| What | Why not fixed | Who fixes it | Next step |`, align `|---|---|---|---|`, at least one row of 4 cells. What is plain text and never repeats a What in 🙋 Needs you. Why not fixed is one of three reasons ([DONE rule](SKILL.md#done-means-nothing-left-to-fix)): needs an action only the user can take, or with no orchestrator their decision, belongs to another owner, or cannot be tested here (say why). Who fixes it names the user or the owner; Next step is the one concrete step. A row leaves only when the item is really fixed. Findings and finished results go to the closing reply or your notes, not here. A summary never says done or finished for work that has a row here.
16. **S-checks:** header exactly `| | Check | State |`, align `|:-:|---|---|`. Rows in this fixed order: one or more `Git`, then exactly one each of `PC load`, `Disk`; no other row names. Markers are ✅ 🟡 🔴 ⚠️.
    - Git: State starts with a bold repo name and holds exactly one bold span (one repo per row).
    - PC load: State exactly `<word> · CPU N% idle` with the header's word and N; marker ✅ calm, 🟡 busy, ⚠️ overloaded.
    - Disk: State exactly `N GB free` with the header's N; marker ✅ or ⚠️.
17. **S-later:** when present, a table: header exactly `| Item |`, align `|---|`, at least one row, one item per row.
18. **S-state:** a table: header exactly `| Who | State |`, align `|---|---|`, 2 to 4 rows of 2 cells (master: 1 to 4). Who is a master bold display name or `**Main chat**`, or an orchestrator chat link or `**Orchestrator**`. State says what it is doing now, what just happened and what is next, in one or two short sentences of at most 30 words.
19. **S-protocol:** a `protocol.md` beside the summary has at most 60 lines: it holds only what must survive a compaction and is rewritten in place, never appended.
20. **S-short:** the old master forms, valid only in a run folder dated up to 2026-11-04 or with no date; a later run writes the board. The old full form is the board with `## 🎯 Goal right now` holding one line that starts with its one bold span, `| Step | Tier | Who | Status |` with align `|---|---|---|:-:|`, Tier `T0` to `T3` or `doc`, optionally followed by ` risk`, 2 to 4 Current state rows, and `Validator` also passing as Who. The short form replaces the rules above (it is chosen by the `## 🧩 Pieces` heading): line 3 is `> <▶ Working|🟡 Waiting|✅ Done>`, optionally with a `**Updated HH:MM** · ` stamp after the `> ` (S-time applies to a stamp), then `## 🙋 Needs you` with `✅ Nothing right now.` or a table, then `## 🎯 Goal` with the run's finish line as one or more `- [ ] <item>` or `- [x] <item>` lines (S-goal when none), then `## 🧩 Pieces` with header `| Piece | Tier | Status |`, align `|---|---|:-:|` and at least one row whose Tier is `S`, `M` or `L` (`T0` and `T1` still pass, for older runs) and whose Status is one of ✅ ▶ ⏳ ⏸ ✖. Optionally last comes `## 🧩 Still open` with `✅ Nothing open.` or the S-open table. Nothing else.

## Where the values come from

Disk is the Avail column of `df -g ~` (GiB blocks, `man df`). `## ⏸ Later` appears only when a later backlog (dropped or deferred extras) exists.

A master session reads these values itself. Updated is `date +%H:%M`; idle is the last `% idle` of `top -l 2 -n 0 -s 1` on macOS, 40 or more calm, 15 to 39 busy, under 15 overloaded; Git is one row per repo the run touches.

## Orchestrator example

```markdown
# 🎼 Orchestrator summary

> **Updated 12:00** · ▶ 1 working · 🟡 1 waiting · 🔴 1 need you · ⏸ 1 paused · ✅ 1 done · 🖥 PC busy (28% idle) · 💾 120 GB free

## 🙋 Needs you

| # | | What | How | When |
|---|:-:|---|---|---|
| 1 | 🔴🔁 | Restart the app | New agent definitions load only after a restart | now |
| 2 | 🟡🗑 | Old CLI versions | About 674 MB in `~/.local/share/claude/versions` | when convenient |

## 🎯 Goal

| | Chat | Finish line |
|:-:|---|---|
| ⬜ | [Setup cleanup](#local_11111111-1111-4111-8111-111111111111) | One structure in the agents folder, merged |
| ⬜ | [Skills work](#local_22222222-2222-4222-8222-222222222222) | Summary spec, checker and tests pass |
| ⬜ | [Game port](#local_33333333-3333-4333-8333-333333333333) | Game app handed off |
| ✅ | [Hook review](#local_44444444-4444-4444-8444-444444444444) | Both fixes merged |

## 🔭 Current state

| Who | State |
|---|---|
| [Skills work](#local_22222222-2222-4222-8222-222222222222) | Writing the strict summary spec; the hook review merged earlier. Next come the check script and its tests. |
| [Setup cleanup](#local_11111111-1111-4111-8111-111111111111) | Waits for the skills chat. Next comes the one-structure design. |
| **Orchestrator** | Keeps the others paused until the skills chat is done |

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

## 🧩 Still open

✅ Nothing open.

## 🛡 Checks

| | Check | State |
|:-:|---|---|
| ✅ | Git | **plugin** main 360e0fd, clean |
| 🟡 | PC load | busy · CPU 28% idle |
| ✅ | Disk | 120 GB free |
```

## Master session example

```markdown
# 🏭 demo-run summary

> **Updated 12:00** · ▶ 1 working · 🟡 1 waiting · 🔴 1 need you · ⏸ 1 paused · ✅ 1 done · 🖥 PC calm (62% idle) · 💾 33 GB free

## 🙋 Needs you

| # | | What | How | When |
|---|:-:|---|---|---|
| 1 | 🔴🔁 | Reload the plugin | Run `/reload-plugins` in your own chat | now |
| 2 | 🟡🖥 | Run the setup script | `./setup.sh \| tee setup.log`, in your terminal | after the merge |

## 🎯 Goal

| | Goal |
|:-:|---|
| ✅ | Conductor build merged on master |
| ⬜ | Setup installs my-app in one run, merged |
| ⬜ | Every install flag named with its source |

## 🔭 Current state

| Who | State |
|---|---|
| **Implementer: setup build** | Rewriting the setup screens; the conductor build merged earlier. Next come a smoke test and its check. |
| **QA verifier: check setup build** | Waits for the ready sha. Next come the gate and a verdict. |
| **Main chat** | Keeps the researcher paused until the build lands |

## 🤖 Workers

| | Worker | Doing now | Next |
|:-:|---|---|---|
| 🟡 | **QA verifier: check setup build** | Waiting on the ready sha | Gate and verdict |
| ▶ | **Implementer: setup build** | Rewriting the setup screens | Smoke test, then check |
| ⏸ | **Researcher: install flags** | Paused until the build lands | Answer the flag question |
| ✅ | **Implementer: conductor build** | Done · 07ab1b7 on master | — |

## 🗺 Plan

| Step | Who | Status |
|---|---|:-:|
| Conductor build | Implementer: conductor build | ✅ |
| **Setup build** | Implementer: setup build | ▶ |
| Setup check | QA verifier: check setup build | ⏳ |
| Install flags | Researcher: install flags | ⏸ |
| Silent install (dropped: not needed) | — | ✖ |

## 🧩 Still open

| What | Why not fixed | Who fixes it | Next step |
|---|---|---|---|
| Setup script fails on Linux | Cannot test here: no Linux machine | You | Run `./setup.sh` on a Linux box and send the log |

## 🛡 Checks

| | Check | State |
|:-:|---|---|
| ✅ | Git | **my-app** master, clean |
| 🟡 | Git | **dotfiles** branch `setup-ui` 9f95022, merges after the verdict |
| ✅ | PC load | calm · CPU 62% idle |
| ✅ | Disk | 33 GB free |
```

Working alone, this chat is the only row: `| ▶ | **Main chat: <short task>** | <doing now> | <next> |`, with one Current state row, `**Main chat**`. With nothing to report, Needs you is `✅ Nothing right now.`, and Still open is `✅ Nothing open.`.
