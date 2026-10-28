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
rule 'start: tick reads answering.md and shape.md' skills/start/SKILL.md 'answering.md, ${CLAUDE_SKILL_DIR}/shape.md'
rule 'start: tick reads the whole skill' skills/start/SKILL.md 'read the whole ${CLAUDE_SKILL_DIR}/SKILL.md'
rule 'start: heartbeat none on stop' skills/start/SKILL.md 'Heartbeat: none'
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
rule 'board: Nothing right now' skills/start/board.md '`Nothing right now.` when empty'
rule 'board: no done summary piece' skills/start/board.md 'Never list done work as a summary piece'
rule 'board: full plan before the first spawn' skills/start/board.md 'Post the full plan on the first board, before the first spawn'
rule 'board: live detached worktree is fine' skills/start/board.md 'a detached worktree whose worker or checker is retired or gone is ⚠️'
rule 'stop: copies the ledger' skills/stop/SKILL.md 'copy the final `protocol.md` and `log.md` into the run'"'"'s note'
rule 'subagent: restarts a dead loop' skills/subagent/SKILL.md '`CronList` doesn'"'"'t list its job'
rule 'workflow: restarts a dead loop' skills/workflow/SKILL.md '`CronList` doesn'"'"'t list its job'
rule 'start: recreate only if not listed' skills/start/SKILL.md 'recreate it only if `CronList` doesn'"'"'t list it'
rule 'board: acknowledged rule' skills/start/board.md 'until the user says "acknowledged" for it'
rule 'board: Git safety check' skills/start/board.md 'Git safety: for each repo the run touches'
rule 'board: PC load check' skills/start/board.md 'PC load: CPU idle, 1-minute load over core count'
rule 'board: every tick with news and every reply' skills/start/board.md 'every tick that has news and in every reply'
rule 'board: quiet tick posts nothing' skills/start/board.md 'A tick with no news posts nothing; it only updates `last tick`. A reply to the user always gets the full board.'
rule 'start: waiting heartbeat' skills/start/SKILL.md 'Heartbeat: none · waiting for <who> since HH:MM'
rule 'start: quiet tick posts nothing' skills/start/SKILL.md 'posts nothing and only updates the Heartbeat line'
rule 'start: re-arm on work' skills/start/SKILL.md 'Re-arm it with the same `/loop 5m` args on the next user message or worker event that opens work'
rule 'board: answer at the bottom' skills/start/board.md 'answer at the bottom'
rule 'start: 5m tick args' skills/start/SKILL.md '5m master-session tick'
rule 'start: answer at the bottom' skills/start/SKILL.md 'the answer at the bottom, below its closing END fence'
rule 'board: opening fence' skills/start/board.md '━━━━━━━━━━ 🏭 BOARD · HH:MM · run <name> ━━━━━━━━━━'
rule 'board: closing fence' skills/start/board.md '━━━━━━━━━━ 🏭 END ━━━━━━━━━━'
rule 'board: answer below the closing fence' skills/start/board.md 'below the closing fence, never inside the board'
rule 'start: CronDelete stops the loop' skills/start/SKILL.md 'CronDelete <job id>'
rule 'start: tick reads board.md' skills/start/SKILL.md '${CLAUDE_SKILL_DIR}/shape.md and ${CLAUDE_SKILL_DIR}/board.md'
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
rule 'worker: claude --agent has no parent' skills/worker/SKILL.md 'In a session the user started with `claude --agent`, there is no parent'
rule 'start: brief has a Scratch line' skills/start/SKILL.md '## Scratch       <scratchpad>/<piece>/ only; clean-up trashes that folder, never the root, protocol.md or log.md'
rule 'worker: never the scratchpad root' skills/worker/SKILL.md 'never the scratchpad root'
rule 'qa-verifier: scratch subfolder only' skills/qa-verifier/SKILL.md 'go only in the scratch subfolder its prompt names'
rule 'shape: own scratch subfolder per subagent' skills/start/shape.md 'Each subagent gets its own `<scratchpad>/<piece>/` scratch subfolder'
rule 'stop: logs pending step first' skills/stop/SKILL.md 'first write its pending step and its worktree'

never='This session never starts sessions or sub-chats and never calls `start_session`'
hits=$(grep -rnE 'start_session|stop_session|notify_when_idle|master-session:subchat' "$root/skills" | sed "s/$never//" | grep -E 'start_session|stop_session|notify_when_idle|master-session:subchat')
if [ -z "$hits" ]; then echo 'ok   skills: no session tools outside the never rule'; else echo 'FAIL skills: session tools outside the never rule'; printf '%s\n' "$hits"; fail=1; fi
if [ -e "$root/skills/subchat" ]; then echo 'FAIL skills/subchat is gone'; fail=1; else echo 'ok   skills/subchat is gone'; fi

tmp=$(mktemp -d)
trap 'rm -r "$tmp"' EXIT
odd="$tmp/a&b|c\\d"
mkdir "$odd"
ln -s "$root/skills" "$odd/skills"
check 'a root with &, | and \ is printed as is' '{"agent_type":"master-session:reviewer"}' "(\`$odd/skills/start/SKILL.md\` section 3" "$odd"

exit $fail
