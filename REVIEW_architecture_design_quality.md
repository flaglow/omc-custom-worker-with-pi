# Architecture, Documentation & Design Quality Review

**Reviewer:** pi-zai-1 (Task 2)  
**Date:** 2026-05-24  
**Scope:** plugin.json, SKILL.md files, README, CHANGELOG, bootstrap prompt, hooks, scripts, healthcheck

---

## Overall Assessment: **Excellent (8.5/10)**

This is a well-architected, thoroughly documented plugin with strong attention to edge cases, security, and operational resilience. The design shows clear iteration through real-world usage. Below are findings organized by category.

---

## 1. Plugin Manifest (`plugin.json`)

**Strengths:**
- Clean manifest with proper `engines` constraints (claude-code >=1.0.0, omc >=4.4.0)
- `userConfig` for default_provider/default_model is elegant — lets users configure at plugin level
- Good keyword coverage for discoverability
- Commit SHA-based versioning is pragmatic for active development

**Suggestions:**
1. **Add `version` back as optional.** While commit SHA versioning works, consumers and marketplace UI may expect a semver field. Consider `"version": "0.2.0-dev"` for the unreleased branch.
2. **Missing `icon` field.** Marketplace display benefits from an icon URL or emoji.
3. **Consider adding `permissions` declaration** if Claude Code supports it — the plugin effectively requests tmux control, shell execution, and file I/O; making this explicit aids trust.

---

## 2. `skills/pi-team/SKILL.md` — The Core Orchestrator

**Strengths:**
- **6-phase execution model** is comprehensive and well-sequenced
- Phase ordering is logical: parse → decompose → launch native → launch pi → monitor → cleanup
- **Registration-before-spawn** (4c before 4d) prevents race conditions — excellent
- Error reference table is thorough (11 entries with cause/fix)
- Edge cases section covers the important permutations
- `allowed-tools` is properly scoped to prevent permission popup friction
- `disable-model-invocation: true` prevents accidental auto-triggering

**Suggestions:**

4. **Phase 2 (Task Decomposition) is underspecified.** The skill says "Split the main task into totalWorkers independent subtasks" but doesn't specify the output format or where subtasks are stored. There's no script for this — it relies entirely on Claude's judgment. Consider adding a structured decomposition template or output schema.

5. **Phase 3 team name collision with Phase 4a.** If native workers launch via `omc team`, the team name comes from `omc team` output. If pi-only, the name is generated differently. The logic for coordinating between these two paths isn't fully clear — what happens when Phase 3 produces a different team name than the one generated in Phase 1? The code shows extraction via `grep 'Team started:'` but error handling could be stronger.

6. **Phase 5 monitor loop has no timeout.** The poll-every-30-seconds loop has a terminal condition (all tasks terminal) but no maximum duration. For long-running or stuck tasks, the leader could loop forever. Consider adding a configurable `max_monitor_duration` or `max_poll_count`.

7. **Phase 5b heartbeat freshness check uses inline node scripts.** The heartbeat age calculation uses a substantial inline `node -e` block. Consider extracting this to a script (like the other helpers) for consistency and testability.

8. **`get-summary` underutilized.** Phase 5 introduces `get-summary` as "one call to replace multiple API calls" but then Phase 5a still calls `list-tasks` separately and Phase 5b calls `read-task` and `read-worker-heartbeat` individually. The summary could replace most of these per-worker calls.

9. **Shell safety in Phase 4d task instruction.** The `TASK_INSTRUCTION` includes team name, task ID, and subtask description in a heredoc that flows through `printf` to a temp file. While this is better than shell interpolation, the subtask description could contain characters that break the heredoc delimiter (e.g., if the description contains `PI_LAUNCHER_EOF`). Using a different delimiter or ensuring no content matches would be safer.

10. **Missing `bin/` reference in README.** The `bin/pi-team-healthcheck` utility is mentioned in AGENTS.md and the file tree but not explained in README's usage section.

---

## 3. `skills/pi-setup/SKILL.md` — Worker Configuration

**Strengths:**
- Clear 5-step flow with validation at each stage
- Worker name validation regex is strict and correct (`^pi-[a-z0-9][a-z0-9-]*$`)
- Reserved name protection prevents confusion with native workers
- Repeated worker creation (Step 3↔4 loop) is well-handled

**Suggestions:**

11. **No way to remove or update a worker.** The setup skill can create workers but there's no documented way to delete or modify one. The register script warns about overwriting but doesn't confirm with the user. Consider adding an update/remove capability or at minimum documenting manual `~/.claude/pi-workers.json` editing.

12. **`pi --list-models` output parsing is fragile.** The `awk 'NR>1 {print $1}' | sort -u` pipeline assumes a specific output format from `pi --list-models`. If pi's CLI output changes, this breaks. Consider a more robust parsing approach or a `pi --list-providers --json` flag.

---

## 4. `config/worker-bootstrap-prompt.md` — Pi Worker System Prompt

**Strengths:**
- Complete 7-step lifecycle protocol
- Self-heartbeat requirement (Step 4) mirrors native workers
- Shutdown protocol (Step 7) with claim release and `alive: false`
- Inbox/mailbox communication pattern is well-specified
- "Important Rules" section provides clear non-negotiables

**Suggestions:**

13. **Step 3 git commit guidance could be stronger.** It says "commit only your changes" but doesn't specify what to do if git fails (e.g., dirty tree from other workers). Consider adding: "If git commit fails due to conflicts, report failure via Step 6 rather than attempting force resolution."

14. **No error recovery for failed `claim-task`.** Step 1 says "Save the claimToken" but doesn't specify what to do if claim fails (e.g., task already claimed by another worker). A retry-or-fail strategy would help.

15. **Missing: what to do when no task is assigned.** The bootstrap assumes a task ID is always provided. If the task dispatch fails or the inbox is empty, the worker has no explicit guidance beyond "keep working" (rule 7). Consider adding a "no task" timeout behavior.

---

## 5. Scripts (`skills/pi-team/scripts/`)

**Strengths:**
- All 6 scripts are clean, well-commented, and use env vars / `process.argv` (never shell interpolation of untrusted data)
- `register-worker.js` uses atomic file writes (write-to-tmp + rename) — excellent for crash safety
- `read-pi-settings.js` has thorough secret redaction with recursive scanning
- `update-pane-id.js` validates required env vars with clear error messages

**Suggestions:**

16. **`register-worker.js` uses `writeJsonAtomic` but `update-pane-id.js` doesn't.** `update-pane-id.js` does direct `writeFileSync` without atomic write. If the process crashes mid-write, the file could be corrupted. For consistency, extract `writeJsonAtomic` into a shared utility.

17. **`json-string.js` is essentially `JSON.stringify(process.argv[2])`.** This 3-line script is fine for safety, but consider merging it into `build-api-input.js` as a utility function to reduce the number of tiny scripts.

18. **`parse-workers.js` regex could miss edge cases.** The regex `(\d+):([a-z0-9-]+(?:\/[A-Za-z0-9._-]+)?)` allows model overrides with uppercase (which is correct for model IDs), but the base name only allows lowercase. This is consistent with the naming convention but worth documenting.

---

## 6. `hooks/hooks.json`

**Strengths:**
- Simple, unobtrusive SessionStart check
- Warns without blocking if pi is not installed

**Suggestions:**

19. **Hook doesn't check `~/.claude/pi-workers.json`.** It only checks if `pi` is installed. A more useful check might also verify that `pi-workers.json` exists and has at least one worker configured, since pi is useless for this plugin without workers.

---

## 7. `bin/pi-team-healthcheck`

**Strengths:**
- Standalone utility for quick status checks
- Clean output with ✓/✗ indicators

**Suggestions:**

20. **Hardcoded `$CONFIG` path in shell string passed to `node -e` is a shell injection vector.** The line `require('fs').readFileSync('$CONFIG', 'utf8')` interpolates `$CONFIG` directly. While the variable is constructed from team name (which is validated elsewhere), a more robust approach would pass it via `process.argv`.

21. **Missing heartbeat check.** The healthcheck only checks pane liveness via tmux. It doesn't call `omc team api read-worker-heartbeat` or `get-summary` for a more complete picture. Since this is a quick utility, this may be intentional, but the name "healthcheck" implies more thorough checking.

---

## 8. README

**Strengths:**
- Clear installation, usage, and architecture sections
- The architecture diagram is excellent — ASCII art showing the dual-path (omc-native vs pi-custom) management
- Comparison table is informative
- Configuration examples are practical

**Suggestions:**

22. **No troubleshooting section.** The README covers happy paths but doesn't help users diagnose common issues (worker not appearing, pane dying, task stuck in `in_progress`). A short troubleshooting section or a link to the SKILL.md Error Reference would help.

23. **Missing link to pi CLI.** The README references pi but doesn't explain what it is beyond a hyperlink. A one-sentence description ("pi is a CLI agent harness that supports multiple LLM providers") would help users who land on this README first.

24. **Version history is only in CHANGELOG.** Consider adding a "Requirements" or "Compatibility" section to the README that specifies tested versions of omc, pi, and tmux.

---

## 9. CHANGELOG

**Strengths:**
- Follows Keep a Changelog format
- Clear categorization (Added/Changed/Removed)
- Includes both breaking changes and migration notes

**Suggestions:**

25. **Date on Unreleased entry says "2025-05-24" but should be "2026-05-24".** This is a minor typo — the current date is 2026, not 2025.

---

## 10. AGENTS.md

**Strengths:**
- Comprehensive "Key Design Decisions" section — this is extremely valuable for any contributor
- Clear file structure diagram
- Testing section references specific API operations
- Conventions section is precise (regex, paths, skill patterns)

**Suggestions:**

26. **Consider adding a "Known Limitations" section.** Items like: no worktree support, max 20 workers, single-team-per-session constraint, and omc V2's lack of native auto-respawn would help set expectations.

---

## Summary of Priority Improvements

| Priority | # | Suggestion |
|----------|---|-----------|
| High | 6 | Add monitor loop timeout to prevent infinite polling |
| High | 16 | Use atomic writes in `update-pane-id.js` for crash safety |
| High | 20 | Fix shell injection vector in `bin/pi-team-healthcheck` |
| Medium | 4 | Add structured decomposition template for Phase 2 |
| Medium | 8 | Fully leverage `get-summary` to reduce API call overhead in Phase 5 |
| Medium | 11 | Add worker removal/update capability to pi-setup |
| Medium | 22 | Add troubleshooting section to README |
| Low | 9 | Harden heredoc delimiter against content collision |
| Low | 19 | Enhance SessionStart hook to check pi-workers.json |
| Low | 25 | Fix year typo in CHANGELOG (2025 → 2026) |

---

## Positive Highlights

Things that are done **exceptionally well**:
- **Registration-before-spawn ordering** prevents the #1 race condition in multi-agent systems
- **Atomic file writes** in `register-worker.js` show production-grade thinking
- **Secret redaction** in `read-pi-settings.js` is thorough and recursive
- **Template variable system** (`{{TEAM_NAME}}`, etc.) with `render-bootstrap.js` is clean and extensible
- **Dual heartbeat** (self-heartbeat + leader pane-check) provides robust liveness detection
- **Graceful shutdown protocol** with claim release and ack flow is well-designed
- **SKILL.md error reference table** is a model for operational documentation
