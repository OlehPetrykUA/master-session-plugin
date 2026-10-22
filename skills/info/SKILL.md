---
name: info
description: Opens the master-session status pane; with ask, asks every running worker for a fresh report. Use ONLY when the user types /master-session:info.
disable-model-invocation: true
argument-hint: '[ask]'
---

The master-session status mod answers this command: it opens the status pane, and with `ask` it asks every running worker for a fresh report. If you are reading this, the mod isn't running in this session. Tell the user the status pane is unavailable here, and if a master-session run is active, post the board as `${CLAUDE_PLUGIN_ROOT}/skills/start/board.md` shows.
