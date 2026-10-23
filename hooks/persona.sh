#!/bin/sh
p=$(sed -n 's/.*"agent_type"[[:space:]]*:[[:space:]]*"master-session:\([a-z-]*\)".*/\1/p' | head -n 1)
case "$p" in
  implementer | refactorer) set -- worker "$p" ;;
  reviewer | qa-verifier | design-checker | researcher | spec-writer | architect | designer) set -- "$p" ;;
  *) exit 0 ;;
esac
for s in "$@"; do
  awk '
    BEGIN { t = "${CLAUDE_PLUGIN_ROOT}" }
    NR == 1 && /^---$/ { f = 1; next }
    f { if (/^---$/) f = 0; next }
    {
      out = ""
      while ((i = index($0, t)) > 0) {
        out = out substr($0, 1, i - 1) ENVIRON["CLAUDE_PLUGIN_ROOT"]
        $0 = substr($0, i + length(t))
      }
      print out $0
    }
  ' "$CLAUDE_PLUGIN_ROOT/skills/$s/SKILL.md" 2>/dev/null
done
exit 0
