# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-05-24

### Changed
- Switched to **commit SHA-based versioning** — removed explicit `version` field from `plugin.json` and `marketplace.json`. Every git commit is now automatically a new version, which is ideal for active development.

## [0.2.0] - 2025-05-24

### Added
- `displayName` field in plugin manifest for better UI presentation
- `userConfig` for default provider/model — users get prompted on plugin activation
- `hooks/hooks.json` with SessionStart hook to check pi CLI availability
- `bin/pi-team-healthcheck` executable for quick team worker status checks
- `CHANGELOG.md` for version history tracking
- `when_to_use` frontmatter to both skills for improved auto-detection
- `shell: bash` explicit declaration in both skills
- `arguments` field in pi-team SKILL.md for named parameter access
- **Pi worker self-heartbeat** (bootstrap Step 4) — mirrors native worker hook behavior
- **Idle notification** — pi workers notify leader after task completion
- **Graceful shutdown protocol** (bootstrap Step 7) — `write-shutdown-request` / `read-shutdown-ack`
- **Monitor snapshot** — leader persists team state via `write-monitor-snapshot` each poll
- **Audit event logging** — `append-event` for worker respawn, task completion, task failure
- **Dual heartbeat detection** — leader checks worker self-heartbeat before declaring dead
- **`get-summary`** for single-call team status (replaces multiple API calls)
- **`orphan-cleanup`** for safe post-shutdown state removal

### Changed
- **BREAKING**: Replaced manual `CLAUDE_PLUGIN_ROOT`/`OMC_PLUGIN_ROOT`/git fallback chain with standard `${CLAUDE_PLUGIN_ROOT}` provided by Claude Code runtime
- Extracted inline scripts to `skills/*/scripts/` (9 scripts total) for maintainability and token cost reduction
- Removed legacy `commands/` directory — skills are the standard going forward
- Removed non-standard frontmatter fields (`level`, `aliases`) from SKILL.md files
- Added `disable-model-invocation: true` to both skills to prevent accidental execution
- Added `allowed-tools` to both skills for frictionless operation (no permission popups)
- Version bumped from 0.1.5 to 0.2.0

### Removed
- `commands/pi-setup.md` and `commands/pi-team.md` dispatch shims
- `ARCHITECTURE_REVIEW.md`, `PLUGIN_REVIEW.md`, and all `REVIEW_*.md`/`TASK*_*.md` artifacts
- `test_bash.sh` and `tmp/` scratch files

## [0.1.5] - 2025-05-23

### Fixed
- Security hardening: shell interpolation safety, realpath validation, atomic file writes
- Worker bootstrap prompt: heartbeat and result template fixes
- Pi-team SKILL.md: all review findings addressed
- Pi-setup SKILL.md: security and robustness fixes

## [0.1.0] - 2025-05-23

### Added
- Initial plugin with pi-setup and pi-team skills
- Worker bootstrap prompt template
- Marketplace listing
- Plugin manifest with engines constraint
