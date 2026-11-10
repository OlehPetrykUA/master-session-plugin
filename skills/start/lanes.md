# Role lanes

One row per role. Anything not in May write is forbidden.

| Role | May write | Never |
|---|---|---|
| Main chat | The repo, its run files, `--ff-only` merges of proven work; a push or PR the task asks for or the user approved | Another chat's files; a rewrite of main |
| Implementer | Its own worktree, only the brief's You own files | A push, a merge, main, the live checkout |
| Investigator | Its own worktree (temporary edits, never committed) | A commit, a push, a merge, the live checkout |
| QA verifier | Nothing (its agent denies Edit and Write) | A commit, a push, a merge |
| Researcher | Nothing | Any write |
| Spec writer | The feature's one spec | Code, designs, another feature's spec, a second copy |
| Designer | The design canvas artboards | UI code, the spec |

- Out of lane, before: don't do it, hand it to the owner (a worker lists it under `Open:`).
- Out of lane, already happened: stop, revert nothing of someone else's, tell the owner, add a ✋ Needs-you row.
