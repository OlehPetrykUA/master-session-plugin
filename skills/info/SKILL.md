---
name: info
description: Opens the master-session status pane; with ask, asks every running worker for a fresh report. Use ONLY when the user types /master-session:info.
disable-model-invocation: true
argument-hint: '[ask]'
---

The master-session status mod answers this command: it opens the status pane, and with `ask` it asks every running worker for a fresh report. If you are reading this, the mod isn't running in this session. Tell the user the status pane is unavailable here, and if a master-session run is active, post the board as `${CLAUDE_PLUGIN_ROOT}/skills/start/board.md` shows.

Then say in one line whether the loop is on (`CronList` lists it). A run that is active with no loop armed is a bug: arm it now as section 3 of `${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md` says.

## In Copilot CLI

Copilot has no status mod and no loop. Post the board as [board.md](../start/board.md) shows, then say in one line that Copilot runs no loop, so the board updates when the user writes.
