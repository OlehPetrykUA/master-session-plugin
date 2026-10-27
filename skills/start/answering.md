# Answering and permissions

Sections 4 and 5 of the [start](SKILL.md) skill.

## 4. Answering the worker

A worker asking for a "go", an approval or what next gets a direct instruction quoting the user's words, never a bounce to the user.
- **Approve yourself:** drafts, plans and design choices that fit the brief (UI designs excepted); work inside its owned files; retries, fixes; `--ff-only` merges of verified work; archiving captured workers; anything reversible inside the brief.
- **Only the user:** UI designs; deletes outside git; pushes, PRs, anything external or irreversible; open preferences; raising a permission mode. Batch them in one line.
- Else decide the reversible way and tell the user in one line. A user rule is never an option: apply it to every case it covers at once.
- **Message budget:** the app caps messages to other sessions at 10 per user turn; send workers only fixes and answers.
- **Changing course:** `stop_session` or `TaskStop` the turn first, then send the new brief in one message.

## 5. Permissions

- A new worker session starts with `permission_mode: "auto"`; its brief lists every self-modifying edit up front, quoting the user, so auto mode sees the intent at once.
- Never raise `permissionMode` unless the user asks; lower a raised mode back to auto after the work.
- **Still denied:** a call denied after your instruction is 🔴. Give the user the exact sentence to type in that worker's chat, or the exact allow rule. A relayed approval doesn't lift it; never move the work to another session.
- **Needs the user:** an AskUserQuestion or permission prompt in a worker's chat: say which chat and what to answer (with a `PushNotification`).
