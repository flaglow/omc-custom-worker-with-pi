# omc-custom-worker-with-pi

**Add pi CLI workers to oh-my-claudecode teams.** Use any LLM provider supported by [pi](https://github.com/earendil-works/pi-coding-agent) (zai, openai, etc.) alongside native claude, codex, and gemini workers.

## Installation

```bash
# 1. Install oh-my-claudecode (if not already installed)
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode

# 2. Install this plugin
/plugin marketplace add https://github.com/flaglow/omc-custom-worker-with-pi
/plugin install omc-custom-worker-with-pi

# 3. Setup pi workers
/omc-custom-worker-with-pi:pi-setup
```

## Usage

### Pure pi workers
```bash
/omc-custom-worker-with-pi:pi-team 3:pi-zai "implement auth module"
```

### Mixed workers (pi + omc-native)
```bash
/omc-custom-worker-with-pi:pi-team 2:pi-zai, 1:codex, 1:gemini "fix auth bugs"
```

### Model override
```bash
/omc-custom-worker-with-pi:pi-team 1:pi-zai/glm-5-turbo "quick analysis"
```

### All native workers (passthrough)
```bash
/omc-custom-worker-with-pi:pi-team 2:codex, 1:gemini "review code"
```

## Architecture

```
/pi-team 2:pi-zai, 1:codex, 1:gemini "task"
         │
         ├─ omc-native [1:codex, 1:gemini]
         │   → omc team (V2 runtime manages lifecycle)
         │
         ├─ pi-custom [2:pi-zai]
         │   → tmux + pi --append-system-prompt (Claude manages)
         │   → Same omc team api protocol (claim/complete/heartbeat)
         │
         └─ Claude = unified monitor
             → heartbeat updates for pi workers
             → dead worker detection & respawn
             → result aggregation
             → omc team shutdown on completion
```

**Key insight:** `pi-` prefixed workers are managed by Claude directly via tmux + `omc team api`. All other workers go through the standard `omc team` command. Claude monitors everything through `omc team status`.

## Plugin Structure

```
.claude-plugin/plugin.json       — Plugin manifest
.claude-plugin/marketplace.json  — Marketplace listing
skills/pi-setup/
  SKILL.md                       — Worker configuration skill
  scripts/                       — Setup helper scripts
skills/pi-team/
  SKILL.md                       — Team orchestration skill
  scripts/                       — Orchestration helper scripts
config/worker-bootstrap-prompt.md — System prompt template for pi workers
```

Skills use `${CLAUDE_SKILL_DIR}/scripts/` for portable script references. Both skills declare `disable-model-invocation: true` (user-invoked only) and `allowed-tools` for frictionless execution.

## Setup Flow (`/pi-setup`)

1. **Detect pi CLI** → install if missing
2. **List providers** → `pi --list-models`
3. **Select provider** → e.g., `zai`
4. **Select model** → e.g., `glm-5.1`
5. **Name worker** → e.g., `pi-zai`
6. **Save config** → `~/.claude/pi-workers.json` + `~/.pi/agent/settings.json`
7. **Repeat** → create more workers

## Configuration

### `~/.claude/pi-workers.json`
```json
{
  "version": 1,
  "workers": {
    "pi-zai": {
      "provider": "zai",
      "model": "glm-5.1",
      "binary": "pi",
      "createdAt": "2026-05-23T12:00:00Z"
    },
    "pi-openai": {
      "provider": "openai",
      "model": "gpt-5",
      "binary": "pi",
      "createdAt": "2026-05-23T12:05:00Z"
    }
  }
}
```

## Prerequisites

- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) v4.4.0+
- [pi](https://github.com/earendil-works/pi-coding-agent) v0.75+
- [tmux](https://github.com/tmux/tmux)

## How It Works

1. **Worker bootstrap:** Pi workers receive a system prompt via `--append-system-prompt` that instructs them to follow the omc team API protocol (claim tasks, update heartbeat, report completion). Workers are registered in manifest.json **before** spawning to prevent race conditions.

2. **Team integration:** Pi workers are registered via `omc team api write-worker-identity`, and both `config.json` and `manifest.json` are updated so that `omc team api claim-task` recognizes the worker. Workers are visible in `omc team status` alongside native workers.

3. **Monitoring:** Claude actively monitors pi workers by checking pane liveness and updating heartbeats. Dead workers are auto-respawned (up to 3 attempts with exponential backoff).

4. **Lifecycle:** Pi workers run in interactive REPL mode inside tmux panes, using their bash tool to call `omc team api` commands — the same protocol claude/codex/gemini workers follow. Workers commit their changes via git before reporting task completion.

5. **CLI note:** This plugin uses `omc` commands throughout. `omx` is an alias for `omc` and both work identically.

## Comparison

| Feature | Native workers (claude/codex/gemini) | Pi workers |
|---|---|---|
| Launch | `omc team` | tmux + pi CLI |
| Task lifecycle | omc team api | omc team api (identical) |
| Heartbeat | AGENTS.md bootstrap | --append-system-prompt bootstrap |
| Monitoring | omc V2 runtime | Claude (active monitoring) |
| Auto-respawn | No (V2 limitation) | Yes (Claude manages) |
| `omc team status` | ✅ | ✅ |
| `omc team shutdown` | ✅ | ✅ |

## License

MIT
