#!/bin/sh
root=$(cd "$(dirname "$0")/.." && pwd)
fail=0

check() {
  out=$(printf '%s' "$2" | CLAUDE_PLUGIN_ROOT="${4:-$root}" sh "$root/hooks/persona.sh")
  rc=$?
  if [ -z "$3" ]; then [ -z "$out" ]; else printf '%s\n' "$out" | grep -qF -- "$3"; fi
  if [ $? -eq 0 ] && [ "$rc" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1 (exit $rc)"; fail=1; fi
}

check 'master-session:implementer gets its Mission' '{"agent_type":"master-session:implementer"}' '**Mission:** build one deliverable'
check 'master-session:implementer gets the worker protocol' '{"agent_type":"master-session:implementer"}' '# Worker protocol'
check 'master-session:reviewer gets its skill' '{"session_id":"x","agent_type": "master-session:reviewer","source":"resume"}' '# Reviewer'
check 'master-session:designer gets its skill' '{"agent_type":"master-session:designer"}' '# Designer'
check 'master-session:spec-writer gets its skill' '{"agent_type":"master-session:spec-writer"}' '# Spec writer'
check 'master-session:architect gets its skill' '{"agent_type":"master-session:architect"}' '# Architect'
check 'master-session:investigator gets its skill' '{"agent_type":"master-session:investigator"}' '# Investigator'
check 'bare reviewer, a user agent, gets nothing' '{"agent_type":"reviewer"}' ''
check 'another plugin reviewer gets nothing' '{"agent_type":"other:reviewer"}' ''
check 'master-session:start gets nothing' '{"agent_type":"master-session:start"}' ''
check 'no agent gets nothing' '{"session_id":"x","source":"startup"}' ''
check 'bad input gets nothing' 'not json' ''
check 'empty input gets nothing' '' ''

rule() {
  if grep -qF -- "$3" "$root/$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi
}

rule 'start: argument-hint is only the task' skills/start/SKILL.md "argument-hint: '<task>'"
rule 'designer: single source of truth' skills/designer/SKILL.md 'single source of truth'
rule 'designer: untouched' skills/designer/SKILL.md 'untouched'
rule 'designer: fold' skills/designer/SKILL.md 'fold'
rule 'implementer: NEEDS_CONTEXT' skills/implementer/SKILL.md 'NEEDS_CONTEXT'
rule 'reviewer: Visuals' skills/reviewer/SKILL.md '**Visuals:**'
rule 'start: git worktree list' skills/start/SKILL.md 'git worktree list'
rule 'start: running count line' skills/start/SKILL.md 'Count: N running (ready:'
rule 'start: one full gate' skills/start/SKILL.md 'has had one full gate'
rule 'start: Your checks' skills/start/SKILL.md '## Your checks'
rule 'start: Checker gate' skills/start/SKILL.md '## Checker gate'
rule 'start: tick reads answering.md and shape.md' skills/start/shape.md 'answering.md, ${CLAUDE_SKILL_DIR}/shape.md'
rule 'start: tick reads the whole skill' skills/start/shape.md 'read the whole ${CLAUDE_SKILL_DIR}/SKILL.md'
rule 'start: heartbeat none on stop' skills/start/shape.md 'Heartbeat: none'
rule 'subagent: argument-hint is only the task' skills/subagent/SKILL.md "argument-hint: '<task>'"
rule 'qa-verifier: full suite never rerun' skills/qa-verifier/SKILL.md 'never rerun it'
rule 'start: plan list has Investigate' skills/start/shape.md 'Investigate (if a bug'"'"'s cause is unknown'
rule 'start: doc tier covers investigate' skills/start/shape.md '`doc` for investigate, spec, design and architect pieces'
rule 'investigator: never fixes' skills/investigator/SKILL.md 'You find the cause; you never fix it.'
rule 'investigator: no suite unless suite-runner' skills/investigator/SKILL.md "unless the brief names you the run's suite-runner"
rule 'investigator: validator approves the report' skills/investigator/SKILL.md 'the validator approves the report'
rule 'board: plan lists every piece' skills/start/board.md 'every piece of the whole run, queued ones included, written from the ledger'"'"'s Plan table on every board'
rule 'board: plan markers' skills/start/board.md '✅ done (merged sha, or "approved" for a doc piece), ▶ working or verifying'
rule 'board: a piece is a deliverable of any shape' skills/start/board.md 'A piece is a deliverable of any shape'
rule 'board: helpers are not pieces' skills/start/board.md 'helpers (QA verifier, Code reviewer, Researcher checks) are not pieces'
rule 'board: states move one way' skills/start/board.md 'States move one way: queued, working when spawned, verifying from its first ready sha'
rule 'board: a fix round adds no piece' skills/start/board.md 'A fix round after a FAIL adds no piece'
rule 'board: user work extends the plan' skills/start/board.md 'work the user adds mid-run adds one'
rule 'board: never delete a piece' skills/start/board.md 'never delete a piece: abandoned or split work is dropped'
rule 'board: workers use the display name' skills/start/board.md 'every worker is shown by its display name `<Persona>: <short task>`'
rule 'board: plain names, no links' skills/start/board.md 'The board lists only subagents and workflow agents, every name as plain text with no link.'
rule 'board: plan keeps ledger names' skills/start/board.md 'The Plan keeps the ledger'"'"'s piece names'
rule 'board: plan step format' skills/start/board.md '`<n>. <marker> <piece name> · <tier> · <detail>`'
rule 'board: checking step example' skills/start/board.md '`▶ Setup build · T3 · QA verifier: check setup build, round 0`'
rule 'board: results start with the deliverer' skills/start/board.md 'Each line starts with the display name of who delivered it'
rule 'board: each working step names its worker' skills/start/board.md 'each ▶ step names its active worker'
rule 'board: plain markdown, never a code block' skills/start/board.md 'never inside a code block'
if grep -q '^```' "$root/skills/start/board.md"; then echo 'FAIL board: no code fence'; fail=1; else echo 'ok   board: no code fence'; fi
rule 'board: agent ids never show' skills/start/board.md 'Agent IDs never show on the board.'
rule 'board: time from spawn and status line' skills/start/board.md '⏱ comes from the spawn time in the ledger and the time of the agent'"'"'s latest status line'
rule 'shape: persona-first display name' skills/start/shape.md '`<Persona>: <short task>`'
rule 'shape: name never shows on the board' skills/start/shape.md 'It never shows on the board.'
if grep -rqF -i -- 'no persona word' "$root/skills"; then echo 'FAIL skills: no "no persona word"'; fail=1; else echo 'ok   skills: no "no persona word"'; fi
rule 'board: Nothing right now' skills/start/board.md '`✅ Nothing right now.` when empty'
rule 'board: section order' skills/start/board.md '**Order:** header, Quick table, mini tables, 📋 Plan, 🙋 Needs you, 🛡 Standing checks, 📦 Results so far, 🔭 Current state, END fence; the Answer follows below it.'
rule 'board: urgency legend' skills/start/board.md 'Urgency: 🔴 blocking now · 🟡 later or after X (name X).'
rule 'board: kind legend' skills/start/board.md 'Kind: 🖥 run a command · 🔁 restart or reload · 🗑 Trash or files · ✋ decision · 🔑 sign-in or approval.'
rule 'board: legend never printed' skills/start/board.md 'Never print this legend on a board.'
if sed -n '/ BOARD · /,/ END ━/p' "$root/skills/start/board.md" | grep -q '^Urgency:' || grep -q '^Urgency:' "$root/README.md"; then echo 'FAIL board: no printed legend in examples'; fail=1; else echo 'ok   board: no printed legend in examples'; fi
rule 'board: to delete later' skills/start/board.md 'To delete later: a list of every extra worktree and branch'
rule 'board: git cherry merged check' skills/start/board.md '`git cherry main <branch>` prints only `-` lines'
rule 'board: branch merged check' skills/start/board.md '`git branch --merged main` lists it'
rule 'board: tree compare fallback' skills/start/board.md '`git diff --quiet main <branch>`'
rule 'board: current state' skills/start/board.md '**🔭 Current state:** 2 to 4 short bullets'
rule 'board: example current state' skills/start/board.md '**🔭 Current state**'
order_ok() {
  awk 'BEGIN{n=0} /^━+ 🏭 END/ {if(!end)end=n+1} !end{split("**📋 Plan**|**🙋 Needs you**|**🛡 Standing checks**|**📦 Results so far**|**🔭 Current state**",h,"|"); if($0==h[n+1])n++} END{exit !(n==5&&end==6)}' "$1"
}
if order_ok "$root/skills/start/board.md"; then echo 'ok   board: example section order'; else echo 'FAIL board: example section order'; fail=1; fi
if grep -rqF -- 'Summary' "$root/skills/start/board.md" "$root/README.md"; then echo 'FAIL board: no Summary'; fail=1; else echo 'ok   board: no Summary'; fi
rule 'board: no done summary piece' skills/start/board.md 'Never list done work as a summary piece'
rule 'board: full plan before the first spawn' skills/start/board.md 'Post the full plan on the first board, before the first spawn'
rule 'board: live detached worktree is fine' skills/start/board.md 'one whose owner is retired or gone is ⚠'
rule 'stop: copies the ledger' skills/stop/SKILL.md 'copy the final `protocol.md` and `log.md` into the run'"'"'s note'
rule 'stop: writes summary.md' skills/stop/SKILL.md 'write the final board to `summary.md` in the run folder'
rule 'spec: no fence lines' skills/start/board-spec.md 'No fenced code block (a line whose content starts with ``` or ~~~'
rule 'stop: summary.md follows the spec' skills/stop/SKILL.md 'in the format of `${CLAUDE_PLUGIN_ROOT}/skills/start/board-spec.md`'
rule 'stop: summary.md is checked' skills/stop/SKILL.md 'skills/start/scripts/summary-check <run folder>/summary.md` and fix every violation'
rule 'stop: keeps the run folder' skills/stop/SKILL.md 'keep the run folder'
rule 'board: summary.md overwrite' skills/start/board.md 'overwrite `<run folder>/summary.md` (start §6) with the Write tool, in the format of [board-spec.md](board-spec.md)'
rule 'board: summary.md check step' skills/start/board.md 'After every rewrite of summary.md, run `python3 <this skill'"'"'s folder>/scripts/summary-check <run folder>/summary.md` and fix every violation before posting, sending a status line or ending the tick; a summary.md with violations is never left as the latest.'
rule 'board: summary.md check works in Copilot' skills/start/board.md 'in Copilot CLI it is `skills/start` in the plugin folder'
if grep -q '^# 🏭 ' "$root/skills/start/board.md"; then echo 'FAIL board: no summary template heading'; fail=1; else echo 'ok   board: no summary template heading'; fi
if [ -x "$root/skills/start/scripts/summary-check" ]; then echo 'ok   summary-check is executable'; else echo 'FAIL summary-check is executable'; fail=1; fi
if python3 -I "$root/skills/start/scripts/summary-check" --self-test; then echo 'ok   summary-check self-test'; else echo 'FAIL summary-check self-test'; fail=1; fi
for r in S-file S-title S-header S-counts S-pc S-time S-sections S-goal S-rows S-names S-links S-archived S-plan S-needs S-checks S-results S-later S-state; do
  rule "spec: names $r" skills/start/board-spec.md "**$r:**"
done
rule 'spec: valid means summary-check prints nothing' skills/start/board-spec.md 'A summary.md is valid only when `summary-check` prints nothing for it.'
rule 'start: run folder path' skills/start/SKILL.md '`<session cwd>/claude-runs/<YYYY-MM-DD>-<run>/`'
rule 'start: run files hard rule' skills/start/SKILL.md 'Every run creates `<cwd>/claude-runs/<YYYY-MM-DD>-<run>/protocol.md`, `log.md` and `summary.md` before its first spawn (the run folder, section 6) and keeps all three current: summary.md is rewritten on every tick and every reply.'
rule 'start: info/exclude' skills/start/SKILL.md 'add `claude-runs/` once to `$(git rev-parse --git-path info/exclude)`'
rule 'start: gitignore citation' skills/start/SKILL.md '(`git help gitignore`: `$GIT_DIR/info/exclude` holds patterns specific to one user'"'"'s workflow)'
rule 'start: kept after Done' skills/start/SKILL.md 'The folder is kept after Done as the user'"'"'s record'
rule 'subagent: restarts a dead loop' skills/subagent/SKILL.md '`CronList` doesn'"'"'t list its job'
rule 'workflow: restarts a dead loop' skills/workflow/SKILL.md '`CronList` doesn'"'"'t list its job'
rule 'start: recreate only if not listed' skills/start/shape.md 'recreate it only if `CronList` doesn'"'"'t list it'
rule 'board: acknowledged rule' skills/start/board.md 'until the user says "acknowledged" for it'
rule 'board: Git safety check' skills/start/board.md 'Git safety: one line per repo the run touches'
rule 'board: PC load check' skills/start/board.md 'PC load: CPU idle, 1-minute load over core count'
rule 'board: posted in every reply' skills/start/board.md 'posted in chat in every reply to the user; a tick only rewrites summary.md'
rule 'board: tick posts nothing in chat' skills/start/board.md 'A tick posts nothing in chat: it rewrites summary.md'
rule 'board: reply still posts the board' skills/start/board.md 'A reply to the user always posts the full board in chat, answer below END, and rewrites summary.md'
rule 'spec: headings in order' skills/start/board-spec.md '`## 🎯 Goal right now`, `## 🤖 Workers` (master) or `## 💬 Chats` (orchestrator), `## 🗺 Plan`, `## 🙋 Needs you`, `## 🛡 Checks`, `## 📦 Results`, optional `## ⏸ Later`, `## 🔭 Current state`'
rule 'spec: Updated line' skills/start/board-spec.md '> **Updated HH:MM** · ▶ N working · 🟡 N waiting · 🔴 N need you · ⏸ N paused · ✅ N done'
rule 'board: points to the spec' skills/start/board.md '[board-spec.md](board-spec.md)'
rule 'start: waiting heartbeat' skills/start/shape.md 'Heartbeat: none · waiting for <who> since HH:MM'
rule 'start: quiet tick posts nothing' skills/start/SKILL.md 'The tick posts nothing in chat except one short line when a new 🔴 Needs-you item appears'
rule 'start: re-arm on work' skills/start/shape.md 'Re-arm it with the same `/loop 5m` args on the next user message or worker event that opens work'
rule 'board: answer at the bottom' skills/start/board.md 'answer at the bottom'
rule 'start: 5m tick args' skills/start/shape.md '5m master-session tick'
rule 'start: answer at the bottom' skills/start/SKILL.md 'the answer at the bottom, below its closing END fence'
rule 'board: opening fence' skills/start/board.md '━━━━━━━━━━ 🏭 BOARD · HH:MM · run <name> ━━━━━━━━━━'
rule 'board: closing fence' skills/start/board.md '━━━━━━━━━━ 🏭 END ━━━━━━━━━━'
rule 'board: answer below the closing fence' skills/start/board.md 'below the closing fence, never inside the board'
rule 'start: CronDelete stops the loop' skills/start/SKILL.md 'CronDelete <job id>'
rule 'start: tick reads board.md' skills/start/shape.md '${CLAUDE_SKILL_DIR}/shape.md, ${CLAUDE_SKILL_DIR}/board.md'
rule 'start: tick reads lanes.md' skills/start/shape.md '${CLAUDE_SKILL_DIR}/board.md and ${CLAUDE_SKILL_DIR}/lanes.md, and <run folder>/protocol.md'
for r in Validator Implementer Refactorer Investigator 'QA verifier' 'Code reviewer' 'Design checker' Researcher 'Spec writer' Architect Designer Orchestrator; do
  if grep -q "^| $r[ |]" "$root/skills/start/lanes.md"; then echo "ok   lanes: row $r"; else echo "FAIL lanes: row $r"; fail=1; fi
done
rule 'lanes: lane check line' skills/start/lanes.md '`lane check: <role> · <action> <path> · in my lane?`'
rule 'lanes: out-of-lane log line' skills/start/lanes.md '`lane: <role> stopped <action> <path> → <owner>`'
rule 'lanes: already happened stop' skills/start/lanes.md '1. stop;'
rule 'lanes: already happened revert nothing' skills/start/lanes.md '2. revert nothing that belongs to someone else;'
rule 'lanes: already happened owner' skills/start/lanes.md '3. tell the owner;'
rule 'lanes: already happened needs-you' skills/start/lanes.md '4. add a ✋ Needs-you item for the user;'
rule 'lanes: already happened log' skills/start/lanes.md '5. log it.'
rule 'lanes: hard ban proposed' skills/start/lanes.md 'a PreToolUse lane guard is proposed, not installed'
rule 'lanes: no skill writes the marker' skills/start/lanes.md 'no skill writes the marker'
rule 'start: Lanes sentence' skills/start/SKILL.md '**Lanes:** every role works only inside its lane ([lanes.md](lanes.md)) and runs the lane check before every write by any tool or shell command.'
rule 'worker: Lane bullet' skills/worker/SKILL.md '**Lane:** your lane is the Implementer or Refactorer row of [lanes.md](../start/lanes.md). Run the lane check before every write by any tool or shell command: Edit, Write, NotebookEdit, a shell write, a git command that changes files or refs (commit, merge, rebase, reset, branch or tag changes, worktree add/remove), a push, or a move to the Trash;'
rule 'lanes: validator Trash move' skills/start/lanes.md 'its cron jobs; moving Leftovers rows to the Trash with `trash` (section 6) |'
rule 'start: validator Trash move' skills/start/SKILL.md 'its cron jobs and moving Leftovers rows to the Trash with `trash` (section 6).'
rule 'lanes: mutual rule' skills/start/lanes.md 'The validator never edits the orchestrator'"'"'s files, and the orchestrator never edits the validator'"'"'s files (its run folder) or this plugin'"'"'s skills.'
rule 'lanes: architect no file edits' skills/start/lanes.md 'read-only git | File edits outside that Copilot spec file (on Claude Code its agent denies Edit and Write); code'
for r in Implementer Refactorer; do
  row=$(grep "^| $r |" "$root/skills/start/lanes.md")
  for s in '| `git worktree add --detach` of its own worktree; commits in that worktree;' 'a rebase onto master before `ready` (worker skill, Ready to merge) or when the validator says so' 'deleting its own merged branch (`git branch -d`, or `-D` when the git-safety hook proves it merged); `git worktree remove` of its own worktree and `git worktree prune`'; do
    if printf '%s' "$row" | grep -qF -- "$s"; then echo "ok   lanes: $r ${s%% (*}"; else echo "FAIL lanes: $r ${s%% (*}"; fail=1; fi
  done
done
orch=$(grep '^| Orchestrator ' "$root/skills/start/lanes.md")
for s in '`start_session` and `detach_session` only on user turns' 'The owning chat pushes; it pushes only if that chat is retired and the user approved' 'a gap goes back to its chat'; do
  if printf '%s' "$orch" | grep -qF -- "$s"; then echo "ok   lanes: Orchestrator $s"; else echo "FAIL lanes: Orchestrator $s"; fail=1; fi
done
rule 'lanes: spec writer creates doc' skills/start/lanes.md 'the project'"'"'s spec doc and its overview tab when none exists'
rule 'lanes: spec writer Copilot worktree' skills/start/lanes.md '`docs/specs/<feature>.md` in its own `wt-<repo>-spec-<feature>` worktree'
rule 'lanes: architect no-spec tab' skills/start/lanes.md 'with no spec, the feature'"'"'s tab (and the doc when the project has none) with the brief'"'"'s ACs quoted'
rule 'lanes: architect Copilot worktree' skills/start/lanes.md '`docs/specs/<feature>.md` in its own `wt-<repo>-design-<feature>` worktree'
rule 'lanes: designer creates canvas' skills/start/lanes.md 'the project'"'"'s canvas when none exists; its scratch subfolder'
rule 'lanes: check before every write' skills/start/lanes.md 'before every write by any tool or shell command: Edit, Write, NotebookEdit, a shell write, a git command that changes files or refs (commit, merge, rebase, reset, branch or tag changes, worktree add/remove), a push, or a move to the Trash, checks:'
for p in implementer:Implementer refactorer:Refactorer reviewer:'Code reviewer' qa-verifier:'QA verifier' design-checker:'Design checker' researcher:Researcher investigator:Investigator spec-writer:'Spec writer' architect:Architect designer:Designer; do
  n=$(grep -cF -- "- **Lane:** the ${p#*:} row of [lanes.md](../start/lanes.md)." "$root/skills/${p%%:*}/SKILL.md")
  if [ "$n" -eq 1 ]; then echo "ok   ${p%%:*}: one Lane line"; else echo "FAIL ${p%%:*}: one Lane line ($n)"; fail=1; fi
done
rule 'start: ledger head order' skills/start/SKILL.md 'Run (name, repos, master ref, validator local_id); User'"'"'s words'
rule 'start: protocol.md' skills/start/SKILL.md '`protocol.md` (the head)'
rule 'start: log.md' skills/start/SKILL.md '`log.md` (the appended log)'
rule 'start: copy the ledger at wrap-up' skills/start/SKILL.md 'At Wrap-up, and before this session could be deleted or archived, copy the final `protocol.md` and `log.md`'
rule 'stop: CronDelete' skills/stop/SKILL.md 'CronDelete'
rule 'worker: status line on every change' skills/worker/SKILL.md 'On every change, push one status line to the parent'
rule 'worker: status line next' skills/worker/SKILL.md '· next: <next step>'
rule 'worker: status line needs' skills/worker/SKILL.md '· needs: <nothing | the question>'
rule 'worker: subagent sends to main' skills/worker/SKILL.md 'SendMessage `to: "main"`'
rule 'start: tick is only a safeguard' skills/start/SKILL.md 'The tick is only a safeguard.'
rule 'start: validator pushes status lines up' skills/start/SKILL.md 'push it the same status line on every change'
rule 'start: never starts sessions or sub-chats' skills/start/SKILL.md 'This session never starts sessions or sub-chats and never calls `start_session`; every persona runs as a subagent or workflow agent here.'
rule 'start: own chat goes to the chat orchestrator' skills/start/SKILL.md 'splitting work into chats belongs to the chat orchestrator'
rule 'stop: stops subagents with TaskStop' skills/stop/SKILL.md 'then stop it with `TaskStop`'
rule 'answering: brief lists self-modifying edits' skills/start/answering.md 'A brief lists every self-modifying edit up front, quoting the user, so auto mode sees the intent at spawn (code.claude.com/docs/en/permission-modes, "How auto mode handles subagents").'
rule 'start: stall needs a stale status line too' skills/start/SKILL.md 'and its latest status line'
rule 'start: report goes to main' skills/start/SKILL.md 'to main (SendMessage `to: "main"`)'
rule 'worker: claude --agent has no parent' skills/worker/SKILL.md 'In a session the user started with `claude --agent` (Copilot: `copilot --agent master-session:<persona>`), there is no parent'
rule 'start: brief has a Scratch line' skills/start/SKILL.md '## Scratch       <scratchpad>/<piece>/ only; clean-up trashes that folder, never the root, the run folder, protocol.md, log.md or summary.md'
rule 'worker: never the scratchpad root' skills/worker/SKILL.md 'never the scratchpad root, the run folder `claude-runs/`'
rule 'qa-verifier: scratch subfolder only' skills/qa-verifier/SKILL.md 'go only in the scratch subfolder its prompt names'
rule 'shape: own scratch subfolder per subagent' skills/start/shape.md 'Each subagent gets its own `<scratchpad>/<piece>/` scratch subfolder'
rule 'stop: logs pending step first' skills/stop/SKILL.md 'first write its pending step and its worktree'
rule 'start: Leftovers bullet' skills/start/SKILL.md '- **Leftovers:** everything the run puts on disk outside git'
rule 'start: nothing to the Trash unlisted' skills/start/SKILL.md 'Nothing goes to the Trash unlisted'
rule 'start: keep rows never trashed' skills/start/SKILL.md 'A `keep: <reason>` row is never moved to the Trash'
rule 'start: protocol head has Leftovers' skills/start/SKILL.md 'Acknowledged (results the user acknowledged); Leftovers (below);'
rule 'start: Leftovers table header' skills/start/SKILL.md '| Path | Size | Owner | Why | When it goes |'
rule 'start: du measures size' skills/start/SKILL.md 'Size comes from `du -sh <path>`'
rule 'spec: Leftovers row' skills/start/board-spec.md '| 🟡 | Leftovers |'
rule 'board: Trash line' skills/start/board.md '🗑 In the Trash: 2 items, 1.2 GB'
rule 'start: report has Leftovers line' skills/start/SKILL.md 'Leftovers: `leftover: <path> <size>` lines, or "none"'
rule 'start: Done rule needs Leftovers settled' skills/start/SKILL.md 'every Leftovers row is `🗑` or `keep: <reason>`, or the table is the single `(none yet)` row,'
rule 'start: empty Leftovers row' skills/start/SKILL.md 'An empty list is the one row `(none yet)`'
rule 'start: six When values' skills/start/SKILL.md '`after merge`, `after QA verdict`, `at Done`, `owner retired ⚠`, `keep: <reason>` or `🗑 HH:MM`'
rule 'start: keep under ~/.Trash' skills/start/SKILL.md 'one whose path is under `~/.Trash` is ⚠ and a 🔴🗑 Needs-you item'
rule 'start: validator logs own trash moves' skills/start/SKILL.md 'only you move leftovers to the Trash, with `trash`, and you log each move yourself'
rule 'start: man du cite' skills/start/SKILL.md '`man du`: `-s` "Display an entry for each specified file", `-h` "Human-readable'
rule 'start: open means not trashed' skills/start/SKILL.md 'Open means not `🗑`.'
rule 'start: heartbeat link' skills/start/SKILL.md '[shape.md](shape.md#heartbeat)'
rule 'worker: never trashes a leftover' skills/worker/SKILL.md 'A worker never moves a leftover to the Trash'
rule 'worker: report Leftovers lines' skills/worker/SKILL.md 'Leftovers is your `leftover: <path> <size>` lines, or `none`.'
rule 'board: To delete later open rows' skills/start/board.md 'open means not `🗑`, keep rows included and shown as `keep: <reason>`'
rule 'stop: unfinished Leftovers stay open' skills/stop/SKILL.md 'lists every unfinished Leftovers row (not `🗑`) as still open'
rule 'readme: Leftovers example' README.md '  - Leftovers: `~/Downloads/old-build.zip` 1.2 GB · 🗑 11:40'
rule 'worker: report has Leftovers' skills/worker/SKILL.md 'Evidence / Leftovers / Open'
for s in $(cd "$root" && ls skills); do
  if grep -qF 'copilot.md' "$root/skills/$s/SKILL.md"; then echo "ok   copilot: $s links copilot.md"; else echo "FAIL copilot: $s links copilot.md"; fail=1; fi
done
if grep -n 'agent denies Edit' "$root"/skills/start/lanes.md | grep -v 'on Claude Code its agent denies' | grep -q .; then echo 'FAIL lanes: denial is Claude Code only'; fail=1; else echo 'ok   lanes: denial is Claude Code only'; fi
rule 'personas: denial is Claude Code only' skills/start/personas.md 'On Claude Code the read-only personas'"'"' agents deny Edit, Write and NotebookEdit; Copilot ignores that field'
rule 'copilot: read-only personas get every tool' skills/start/copilot.md 'Copilot ignores `disallowedTools`'
rule 'copilot: briefs say no edits' skills/start/copilot.md 'each brief says "no edits"'
rule 'copilot: personas section' skills/start/copilot.md '## personas'
rule 'copilot: persona worktrees' skills/start/copilot.md '`$HOME/.copilot/worktrees/` wherever a skill says `$HOME/.claude/worktrees/`'
rule 'copilot: nested task model' skills/start/copilot.md '**Nested `task` calls:** always with a Copilot `model`'
rule 'copilot: docs and memory CLI fallbacks' skills/start/copilot.md 'basic-memory tool search-notes|read-note|write-note|edit-note|build-context'
rule 'copilot: web_fetch' skills/start/copilot.md "Copilot's \`web_fetch\`"
rule 'copilot: stop section' skills/start/copilot.md '## stop'
rule 'copilot: stop has no cron' skills/start/copilot.md 'There is no cron to delete'
rule 'copilot: stop with /tasks or Esc' skills/start/copilot.md 'with `/tasks` or by pressing Esc twice'
rule 'copilot: fix rounds are fresh tasks' skills/start/copilot.md 'Copilot has no resume by ID. Each fix round, rebase or post-merge clean-up is a fresh `task`'
rule 'copilot: no write_agent reliance' skills/start/copilot.md 'Do not rely on `write_agent`'
rule 'lanes: validator Copilot run folder' skills/start/lanes.md 'on Copilot `~/.copilot/scratch/<run>/`: protocol.md'
rule 'copilot: haiku model' skills/start/copilot.md '| haiku | `claude-haiku-5.5` |'
rule 'copilot: sonnet model' skills/start/copilot.md '| sonnet | `claude-sonnet-5.5` |'
rule 'copilot: opus model' skills/start/copilot.md '| opus | `claude-opus-5.5` |'
rule 'copilot: always pass model' skills/start/copilot.md 'Always pass `model` on Copilot'
rule 'copilot: subagent passes model' skills/start/copilot.md 'a Copilot `model` (see Models) as in the subagent skill'"'"'s step 1'
rule 'copilot: workflow passes model' skills/start/copilot.md 'each with a Copilot `model` even though the workflow skill says to leave it unset'
rule 'copilot: run_dynamic_workflow' skills/start/copilot.md '`run_dynamic_workflow` and `copilot workflow run`'
rule 'worker: copilot --agent has no parent' skills/worker/SKILL.md '(Copilot: `copilot --agent master-session:<persona>`)'
rule 'copilot: unregistered persona via skill tool' skills/start/copilot.md "load the persona's skill with the skill tool"
if grep -qF -- '/skills reload' "$root/skills/start/copilot.md"; then echo 'FAIL copilot: no unproven /skills reload'; fail=1; else echo 'ok   copilot: no unproven /skills reload'; fi
if grep -qF -- 'Edit tools are' "$root/skills/start/copilot.md"; then echo 'FAIL copilot: no unproven edit tool names'; fail=1; else echo 'ok   copilot: no unproven edit tool names'; fi
rule 'copilot: no SendMessage route back' skills/start/copilot.md 'no route from a subagent back to the main session was seen'

never='This session never starts sessions or sub-chats and never calls `start_session`'
hits=$(grep -rnE 'start_session|stop_session|notify_when_idle|master-session:subchat' "$root/skills" | grep -v '^[^:]*/skills/start/lanes\.md:[0-9]*:| Orchestrator ' | sed "s/$never//" | grep -E 'start_session|stop_session|notify_when_idle|master-session:subchat')
if [ -z "$hits" ]; then echo 'ok   skills: no session tools outside the never rule'; else echo 'FAIL skills: session tools outside the never rule'; printf '%s\n' "$hits"; fail=1; fi
if [ -e "$root/skills/subchat" ]; then echo 'FAIL skills/subchat is gone'; fail=1; else echo 'ok   skills/subchat is gone'; fi

tmp=$(mktemp -d)
trap 'rm -r "$tmp"' EXIT
odd="$tmp/a&b|c\\d"
mkdir "$odd"
ln -s "$root/skills" "$odd/skills"
check 'a root with &, | and \ is printed as is' '{"agent_type":"master-session:reviewer"}' "(\`$odd/skills/start/SKILL.md\` section 3" "$odd"

exit $fail
