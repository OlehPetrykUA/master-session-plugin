# In Copilot CLI

Copilot CLI loads this plugin too, from the same skills and agents, with one source for both tools. It has no `SendMessage`, `/loop`, `CronCreate`, Claude Code's `Workflow` tool or API, Claude Docs or Artifacts (the design canvas). Its main session has `list_agents`, `read_agent` and `write_agent`, but no route from a subagent back to the main session was seen. It leaves `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` as written: read them as the plugin folder (two levels up from any skill file) and that skill's folder. The skills that need a Copilot change link their section here.

Persona subagents everywhere: the `task` tool with `agent_type: "master-session:<persona>"` and `model` set to a Copilot model id. The persona arrives through the agent's `skills:` frontmatter. `/tasks` shows the subagents. The agents carry `reasoningEffort` for Copilot beside `effort` for Claude Code. A validator session starts with `copilot --reasoning-effort xhigh`.

## Models

Always pass `model` on Copilot, even where a skill says to leave it unset. Without one Copilot passes the agent's frontmatter `sonnet` or `opus` and fails with "Model 'sonnet' is not available". Its own error lists the ids, as of CLI 1.0.105:

| Claude Code | Copilot `model` |
|---|---|
| haiku | `claude-haiku-5.5` |
| sonnet | `claude-sonnet-5.5` |
| opus | `claude-opus-5.5` |

Pick the row the persona's agent names, or this session's own model when the tier table sets none.

## Read-only personas

Copilot ignores `disallowedTools`: the QA verifier, Code reviewer, Design checker, Researcher and Architect agents get every tool. Their lane in [lanes.md](lanes.md) and the lane check before each write are the only guard, so each brief says "no edits" for them.

## personas

Persona skills ([implementer](../implementer/SKILL.md), [refactorer](../refactorer/SKILL.md), [researcher](../researcher/SKILL.md), [reviewer](../reviewer/SKILL.md), [design-checker](../design-checker/SKILL.md), [qa-verifier](../qa-verifier/SKILL.md), [investigator](../investigator/SKILL.md)) run on Copilot with these changes:
- **Worktrees:** `$HOME/.copilot/worktrees/` wherever a skill says `$HOME/.claude/worktrees/`.
- **Nested `task` calls:** always with a Copilot `model`, as in Models above.
- **Docs and memory:** see Docs first below.
- **Read-only personas:** no edits, as in Read-only personas above.

## Docs first

Copilot reports the MCP servers it blocks by policy at start. Where the Context7, web search or memory MCP is blocked, use the command-line fallbacks the user's own instructions name, such as a `context7` CLI for docs, a `searxng` CLI for search and `basic-memory tool search-notes|read-note|write-note|edit-note|build-context` for memory, and Copilot's `web_fetch` to read a page. Copilot has no web search tool of its own. Cite the source in the report as usual.

## start

Run the same protocol with what Copilot has:
- **Persona subagents:** the `task` tool, as above; `/fleet` runs several in parallel.
- **Loop and board:** no heartbeat. Do a tick on every user turn and every subagent result, and post the chat board as [board.md](board.md) shows; its header's next tick reads "on your next message".
- **Ledger:** Copilot keeps the run folder (start §6) at `~/.copilot/scratch/<run>/` instead of `claude-runs/`, with the same `protocol.md`, `log.md` and `summary.md`.
- **Fix rounds, rebases and clean-up:** Copilot has no resume by ID. Each fix round, rebase or post-merge clean-up is a fresh `task` with the handover brief of [shape.md](shape.md) ("continue in <worktree> at <sha> …"), in the same worktree, so no worktree leaks. Do not rely on `write_agent` for `task` subagents.
- **Waits:** a background `bash` with `read_bash` and `stop_bash` stands in for `Monitor`; there is no push notification, so the board is the signal. To check a stalled agent, use `list_agents` and `read_agent` or `/tasks`, not `stat` on an output file.
- **Plugin checks:** the engine is `copilot --plugin-dir <worktree>`.

## stop

There is no cron to delete (the Heartbeat is none). Write each running piece's pending step and worktree to `log.md` in `~/.copilot/scratch/<run>/`, stop the running agents with `/tasks` or by pressing Esc twice (Copilot 1.0.105 has no `TaskStop`), then write `summary.md` and the final board as the stop skill says.

## worker

Copilot has no `SendMessage`. A `task` subagent sends no status lines: its final message is its report, with each question and `ready <sha>` in the report format.

## subagent

Call the `task` tool instead of `Agent`, with `name`, `description`, `prompt` and a Copilot `model` (see Models) as in the subagent skill's step 1, even though that step leaves `model` unset. There is no loop to arm: relay the result when it comes back.

## workflow

Copilot has `run_dynamic_workflow` and `copilot workflow run`, but not Claude Code's `Workflow` tool or API, nor the `workflow-authoring` skill. Announce the plan the same way (agents, phases), then run the personas as parallel `task` calls, each with a Copilot `model` even though the workflow skill says to leave it unset, or ask the user to run it with `/fleet`.

## spec-writer

Copilot has no Claude Docs. Write the spec to `docs/specs/<feature>.md` in a worktree at `$HOME/.copilot/worktrees/wt-<repo>-spec-<feature>`, with the same sections and changelog, commit it with a one-line conventional message, and return the path and sha instead of the doc link.

## architect

Copilot has no Claude Docs. Add the section to `docs/specs/<feature>.md` in a worktree at `$HOME/.copilot/worktrees/wt-<repo>-design-<feature>`, with the same changelog, commit it with a one-line conventional message, and return the path and sha instead of the doc link.

## designer

Copilot has no Artifacts, so no design canvas, and the Design checker has no canvas to compare with. Stop the T3 piece at the design step and ask the user to run the Designer pass in Claude Code; never draw the design in a file instead.

## Install

Copilot over ACP, as in JetBrains IDEs, loads no plugins from a local-folder marketplace; the interactive `copilot` and `copilot -p` do. `start`, `stop`, `subagent` and `workflow` are for the user to type, so `copilot -p` doesn't run them. A persona session is `copilot --agent master-session:<persona>`; a persona with no registered agent runs as a `task` whose brief tells it to load the persona's skill with the skill tool.

In Copilot the four commands show as `/master-session:start`, `/master-session:stop`, `/master-session:subagent` and `/master-session:workflow`, one colon after the plugin name as in Claude Code; `copilot skill list` prints the bare skill names, and the personas and the worker skill have `user-invocable: false`, so they stay out of the slash menu by design.
