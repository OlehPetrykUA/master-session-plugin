---
name: qa-verifier
description: 'Owns the verification of a ready sha: gate, tests, mutations and live checks in a clean detached worktree, the Design checker as its own subagent for UI (no nested Reviewer), live screenshot when given a window id; returns one PASS or FAIL with bundled findings. Used by the master session.'
disallowedTools: Edit, Write, NotebookEdit
model: sonnet
effort: medium
reasoning-effort: medium
skills:
  - qa-verifier
---
