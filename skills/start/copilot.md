# In Copilot CLI

Copilot CLI loads this plugin too, without `start_session`, SendMessage, the report tool, the status mod, `/loop`, `ScheduleWakeup`, `Workflow`, Claude Docs or Artifacts (the design canvas). It leaves `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` as written: read them as the plugin folder (two levels up from any skill file) and that skill's folder. The skills that need a Copilot change link their section here.

Persona subagents everywhere: the `task` tool with `agent_type: "master-session:<persona>"` and `model` set to a Copilot model id, such as this session's own. Copilot rejects the agents' `sonnet` and `opus`, and its error lists the ids. `/tasks` shows them. The agents carry `reasoning-effort` for Copilot beside `effort` for Claude Code.

Worktrees live at `$HOME/.copilot/worktrees/wt-<repo>-<branch>`. Never `/delegate` a repo hosted outside GitHub, such as Azure DevOps: it sends the session to GitHub and opens a pull request there.

## start

Run the same protocol with what Copilot has:
- **Workers:** give the user the brief to paste into a session they open with `/new`, or `/fork` when it needs this chat. The worker reports in its own chat in the report format; the user relays it.
- **Persona subagents:** the `task` tool, as above; `/fleet` runs several in parallel.
- **Loop and board:** no heartbeat. Do a tick on every user turn and every subagent result, and post the chat board as [board.md](board.md) shows.

## worker

Copilot has no report tool and no SendMessage. Put each update, question and `ready <sha>` in your own chat, in the report format, for the user to relay to the parent. Without a Monitor, check your start condition and master each time the user writes.

## subchat

Copilot can't start a session or arm a loop. Write the brief as the subchat skill's step 1 says, give it to the user to paste into a session they open with `/new` (or `/fork` to keep this chat), and list the worker by the name they give it. It reports in its own chat; check on it whenever the user writes.

## subagent

Call the `task` tool instead of `Agent`, with `name`, `description` and `prompt` as in the subagent skill's step 1. There is no loop to arm: relay the result when it comes back.

## workflow

Copilot has no `Workflow` tool or `workflow-authoring` skill. Announce the plan the same way (agents, phases), then run the personas as parallel `task` calls, or ask the user to run it with `/fleet`.

## info

Copilot has no status mod and no loop. Post the board as [board.md](board.md) shows, then say in one line that Copilot runs no loop, so the board updates when the user writes.

## spec-writer

Copilot has no Claude Docs. Write the spec to `docs/specs/<feature>.md` in a worktree at `$HOME/.copilot/worktrees/wt-<repo>-spec-<feature>`, with the same sections and changelog, commit it with a one-line conventional message, and return the path and sha instead of the doc link.

## architect

Copilot has no Claude Docs. Add the section to `docs/specs/<feature>.md` in a worktree at `$HOME/.copilot/worktrees/wt-<repo>-design-<feature>`, with the same changelog, commit it with a one-line conventional message, and return the path and sha instead of the doc link.

## designer

Copilot has no Artifacts, so no design canvas, and the Design checker has no canvas to compare with. Stop the T3 piece at the design step and ask the user to run the Designer pass in Claude Code; never draw the design in a file instead.

## Install

Copilot over ACP, as in JetBrains IDEs, loads no plugins from a local-folder marketplace; the interactive `copilot` and `copilot -p` do. `start`, `info`, `stop`, `subchat`, `subagent` and `workflow` are for the user to type, so `copilot -p` doesn't run them. `stop force` and `info ask` need the status mod, so they do nothing here.
