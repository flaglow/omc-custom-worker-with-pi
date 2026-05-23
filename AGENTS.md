# omc-custom-worker-with-pi

This project is a Claude Code plugin that adds pi CLI workers (any LLM provider) to oh-my-claudecode teams.

## Structure

```
.claude-plugin/plugin.json       — Plugin metadata, skill references, userConfig
.claude-plugin/marketplace.json  — Marketplace listing
skills/pi-setup/
  SKILL.md                       — Worker setup/configuration skill
  scripts/
    read-pi-settings.js          — Read pi settings with secret redaction
    register-worker.js           — Register worker in pi-workers.json
    update-pi-settings.js        — Update pi default settings
skills/pi-team/
  SKILL.md                       — Team orchestration skill (mixed pi + native workers)
  scripts/
    json-string.js               — JSON-safe string wrapper
    parse-workers.js             — Parse and validate worker spec
    register-worker.js           — Register worker in config + manifest
    render-bootstrap.js          — Render bootstrap template with variables
    update-pane-id.js            — Update pane_id after tmux spawn
    build-api-input.js           — Build JSON input for omc team api calls
config/worker-bootstrap-prompt.md — System prompt template for pi workers
hooks/hooks.json                 — SessionStart hook: pi CLI availability check
bin/pi-team-healthcheck          — Quick team worker health check utility
CHANGELOG.md                     — Version history
README.md                        — User-facing documentation
```

## Key Design Decisions

- **manifest.json is critical**: `omc team api claim-task` validates workers against `manifest.json`, not `config.json`. Both files must be created (Phase 4a) and updated (Phase 4c — before spawn) for pi workers.
- **Registration before spawn**: Phase 4c (register) runs BEFORE Phase 4d (spawn tmux pane) to prevent race conditions.
- **omc vs omx**: `omc` and `omx` are aliases. This plugin uses `omc` throughout.
- **Graceful shutdown**: Pi workers receive `write-shutdown-request`, commit partial work, release claims, send final `alive: false` heartbeat, then exit. Leader waits for `read-shutdown-ack` before force shutdown.
- **Monitor snapshot**: Leader persists team state via `write-monitor-snapshot` on each poll cycle for session recovery after compaction.
- **Audit events**: Leader logs `worker_respawned`, `task_completed`, `task_failed` events via `append-event` for observability.
- **Dual heartbeat**: Pi workers self-heartbeat via bootstrap Step 4 (mirrors native worker hook). Leader supplements with tmux pane PID checks as backup. Dead worker detection uses `read-worker-heartbeat` to check self-heartbeat freshness before declaring dead.
- **Prerequisite gating**: pi CLI and pi-workers.json checks are skipped for all-native teams.
- **Plugin root resolution**: Uses standard `${CLAUDE_PLUGIN_ROOT}` provided by Claude Code at runtime. No manual fallback chain needed.
- **Shell interpolation safety**: Values passed to `node -e` use `process.argv` or env vars, never inline string interpolation. Task text is assigned via single-quoted shell variables or `printf %q` to prevent command substitution from untrusted input.
- **Git commit protocol**: Bootstrap instructs pi workers to stage only their explicitly changed files (`git add -- <paths>`, never `git add -A`) before committing, to avoid contaminating shared-workspace worktrees with other workers' or user changes.
- **claim_token required for failure transitions**: `omc team api transition-task-status` always requires a `claim_token`. The dead-worker exhausted-respawn path must call `claim-task` first to obtain a token before marking the task `failed`.
- **Template variables**: `{{TEAM_NAME}}`, `{{WORKER_NAME}}`, `{{TASK_ID}}`, `{{CWD}}`, `{{STATE_ROOT}}` — substituted via Node.js in SKILL.md Phase 4d.
- **Bootstrap reads AGENTS.md**: Pi worker bootstrap prompt (Step 2) reads `AGENTS.md` from the project root before executing the task, so pi workers pick up project-level conventions and constraints automatically.
- **External scripts**: SKILL.md references scripts via `${CLAUDE_SKILL_DIR}/scripts/` for portability across personal, project, and plugin installs. Scripts use `process.argv` or env vars — never inline shell interpolation of untrusted data.
- **userConfig**: Plugin declares `default_provider` and `default_model` via `plugin.json` `userConfig`. Values are accessible as `${user_config.default_provider}` in skill content.

## Testing

Run integration tests against `omc team api` operations:
```bash
# Validates: create-task, write-worker-identity, claim-task, transition-task-status,
# send-message, mailbox-list, update-worker-heartbeat, get-summary
```

## Conventions

- Worker names must match `^pi-[a-z0-9][a-z0-9-]*$` (e.g., `pi-zai`, `pi-openai`) — lowercase alphanumeric and hyphens only after the `pi-` prefix; no uppercase or underscores
- Configuration stored in `~/.claude/pi-workers.json`
- Team state in `.omc/state/team/<team-name>/`
- Skills use `disable-model-invocation: true` to prevent accidental execution
- Skills declare `allowed-tools` for frictionless operation
- All plugin-relative paths use `${CLAUDE_PLUGIN_ROOT}` (standard Claude Code variable)
- Skill-local scripts use `${CLAUDE_SKILL_DIR}/scripts/`
