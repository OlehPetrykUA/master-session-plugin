# Answering and permissions

Sections 4 and 5 of the [start](SKILL.md) skill.

## 4. Answering the worker

A worker asking for a "go", an approval or what next gets a direct instruction quoting the user's words, never a bounce to the user.
- **Approve yourself:** drafts, plans and design choices that fit the brief (UI designs excepted); work inside its owned files; retries, fixes; `--ff-only` merges of verified work; a push or PR the user's task asks for, quoting its words in the ledger ([section 6](SKILL.md#6-ledger-and-clean-up), Done); anything reversible inside the brief.
- **Only the user:** UI designs; deletes outside git; pushes and PRs the task didn't ask for, anything external or irreversible; open preferences; raising a permission mode. Batch them in one line.
- Else decide the reversible way and tell the user in one line. A user rule is never an option: apply it to every case it covers at once.
- **Out of lane:** a worker that asks to work outside its lane ([lanes.md](lanes.md)) gets "no, out of lane"; the change goes to its owner, as a new brief or to the user.
- Send workers only fixes and answers.
- **Changing course:** `TaskStop` the agent first, then brief a fresh one in full.

## 5. Permissions

- A brief lists every self-modifying edit up front, quoting the user, so auto mode sees the intent at spawn (code.claude.com/docs/en/permission-modes, "How auto mode handles subagents").
- **Prompts:** answer a subagent's permission prompt for that call only.
- **Blocked:** an auto-mode block, or a call still denied after your instruction, is 🔴: give the user the exact allow rule, then resume the agent by ID. A relayed approval doesn't lift it; never move the work to another agent or chat.
- Never raise a permission mode unless the user asks.
