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
check 'master-session:implementer gets the worker protocol' '{"agent_type":"master-session:implementer"}' '# Worker session protocol'
check 'master-session:reviewer gets its skill' '{"session_id":"x","agent_type": "master-session:reviewer","source":"resume"}' '# Reviewer'
check 'master-session:designer gets its skill' '{"agent_type":"master-session:designer"}' '# Designer'
check 'master-session:spec-writer gets its skill' '{"agent_type":"master-session:spec-writer"}' '# Spec writer'
check 'master-session:architect gets its skill' '{"agent_type":"master-session:architect"}' '# Architect'
check 'bare reviewer, a user agent, gets nothing' '{"agent_type":"reviewer"}' ''
check 'another plugin reviewer gets nothing' '{"agent_type":"other:reviewer"}' ''
check 'master-session:start gets nothing' '{"agent_type":"master-session:start"}' ''
check 'no agent gets nothing' '{"session_id":"x","source":"startup"}' ''
check 'bad input gets nothing' 'not json' ''
check 'empty input gets nothing' '' ''

step=$(grep -F '**Status pane:**' "$root/skills/start/SKILL.md")

has() {
  if printf '%s' "$step" | grep -qF -- "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi
}

has 'AC31 step 6 lists plan[]' '`plan[]`: every piece of the whole run, written from the ledger on every board call, queued ones included'
has 'AC31 step 6 lists name, the five states and progress' '`name`, `state` (queued, working, verifying, done, dropped), `tier` (T0 to T3, or `doc`), `progress` ("step N of M — label"'
has 'step 6 lists run' '`run`: a short name for this run, the same on every board call of the run'
has 'AC32 step 6 says a piece is a deliverable of any shape' 'A piece is a deliverable of any shape'
has 'AC32 step 6 says helpers are not pieces' 'helpers (QA verifier, Code reviewer, Researcher checks) are not pieces'
has 'AC32 step 6 says a fix round adds no piece' 'A fix round after a FAIL adds no piece'
has 'AC32 step 6 says user work extends the plan' 'work the user adds mid-run adds one'

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
rule 'start: tick reads answering.md and shape.md' skills/start/SKILL.md 'answering.md and ${CLAUDE_SKILL_DIR}/shape.md'
rule 'start: tick reads the whole skill' skills/start/SKILL.md 'read the whole ${CLAUDE_SKILL_DIR}/SKILL.md'
rule 'subchat: argument-hint is only the task' skills/subchat/SKILL.md "argument-hint: '<task>'"
rule 'subagent: argument-hint is only the task' skills/subagent/SKILL.md "argument-hint: '<task>'"
rule 'qa-verifier: full suite never rerun' skills/qa-verifier/SKILL.md 'never rerun it'

tmp=$(mktemp -d)
trap 'rm -r "$tmp"' EXIT
odd="$tmp/a&b|c\\d"
mkdir "$odd"
ln -s "$root/skills" "$odd/skills"
check 'a root with &, | and \ is printed as is' '{"agent_type":"master-session:reviewer"}' "(\`$odd/skills/start/SKILL.md\` section 3" "$odd"

exit $fail
