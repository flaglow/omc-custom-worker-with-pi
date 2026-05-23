# omc-custom-worker-with-pi

This project is a Claude Code plugin that adds pi CLI workers (any LLM provider) to oh-my-claudecode teams.

## Structure

```
.claude-plugin/plugin.json    — Plugin metadata and skill/command references
.claude-plugin/marketplace.json — Marketplace listing
skills/pi-setup/SKILL.md      — Worker setup/configuration skill
skills/pi-team/SKILL.md       — Team orchestration skill (mixed pi + native workers)
commands/pi-setup.md           — Command dispatch shim for /pi-setup
commands/pi-team.md            — Command dispatch shim for /pi-team
config/worker-bootstrap-prompt.md — System prompt template for pi workers
README.md                      — User-facing documentation
```

## Key Design Decisions

- **manifest.json is critical**: `omc team api claim-task` validates workers against `manifest.json`, not `config.json`. Both files must be created (Phase 4a) and updated (Phase 4c — before spawn) for pi workers.
- **Registration before spawn**: Phase 4c (register) runs BEFORE Phase 4d (spawn tmux pane) to prevent race conditions.
- **omc vs omx**: `omc` and `omx` are aliases. This plugin uses `omc` throughout.
- **Dual registration**: Pi workers are registered via both `omc team api write-worker-identity` AND direct file writes to config.json + manifest.json.
- **Prerequisite gating**: pi CLI and pi-workers.json checks are skipped for all-native teams.
- **Plugin root resolution**: `CLAUDE_PLUGIN_ROOT` → `OMC_PLUGIN_ROOT` → git root → cwd fallback chain.
- **Git commit protocol**: Bootstrap instructs pi workers to stage only their explicitly changed files (`git add -- <paths>`, never `git add -A`) before committing, to avoid contaminating shared-workspace worktrees with other workers' or user changes.
- **claim_token required for failure transitions**: `omc team api transition-task-status` always requires a `claim_token`. The dead-worker exhausted-respawn path must call `claim-task` first to obtain a token before marking the task `failed`.
- **Template variables**: `{{TEAM_NAME}}`, `{{WORKER_NAME}}`, `{{TASK_ID}}`, `{{CWD}}`, `{{STATE_ROOT}}` — substituted via Node.js in SKILL.md Phase 4d.

## Testing

Run integration tests against `omc team api` operations:
```bash
# Validates: create-task, write-worker-identity, claim-task, transition-task-status,
# send-message, mailbox-list, update-worker-heartbeat, get-summary
```

## Conventions

- Worker names must start with `pi-` (e.g., `pi-zai`, `pi-openai`)
- Configuration stored in `~/.claude/pi-workers.json`
- Team state in `.omc/state/team/<team-name>/`
