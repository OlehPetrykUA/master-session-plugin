#!/bin/sh
p=$(sed -n 's/.*"agent_type"[[:space:]]*:[[:space:]]*"\(master-session:\)\{0,1\}\([a-z-]*\)".*/\2/p' | head -n 1)
case "$p" in
  implementer | refactorer) set -- worker "$p" ;;
  reviewer | qa-verifier | design-checker | researcher) set -- "$p" ;;
  *) exit 0 ;;
esac
for s in "$@"; do
  awk 'NR == 1 && /^---$/ { f = 1; next } f && /^---$/ { f = 0; next } !f' "$CLAUDE_PLUGIN_ROOT/skills/$s/SKILL.md" 2>/dev/null |
    sed "s|\${CLAUDE_PLUGIN_ROOT}|$CLAUDE_PLUGIN_ROOT|g"
done
exit 0
