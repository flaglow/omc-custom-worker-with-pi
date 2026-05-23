# Bootstrap & Integration Review — omc-custom-worker-with-pi (Task 3)

**Reviewer:** pi-zai-1  
**Task ID:** 3  
**Date:** 2026-05-24  
**Scope:** `config/worker-bootstrap-prompt.md`, `.claude-plugin/plugin.json`, `skills/pi-setup/SKILL.md` — correctness, integration quality, edge cases, and improvements.

---

## Executive Summary

The three target files are **well-designed and largely correct**. The bootstrap prompt template is complete and protocol-faithful. The plugin.json metadata is valid with one version discrepancy. The pi-setup skill has a solid interactive flow with one code-level gap. I found **0 critical, 1 medium, 6 low, and 4 informational findings** across the three files, plus **2 cross-file integration issues**.

**Overall Quality: B+**

---

## File 1: `config/worker-bootstrap-prompt.md` (92 lines)

### Correctness ✅

| Aspect | Status | Detail |
|--------|--------|--------|
| Template variables | ✅ | All 5 variables (`{{TEAM_NAME}}`, `{{WORKER_NAME}}`, `{{TASK_ID}}`, `{{CWD}}`, `{{STATE_ROOT}}`) used correctly throughout |
| Claim-task protocol | ✅ | Correct JSON structure, save-token instruction present |
| Work phase | ✅ | Clear instruction to use tools; git commit safety for shared workspace |
| Heartbeat | ✅ | Periodic update with PID/turn_count; correct JSON structure |
| Completion transition | ✅ | `from: in_progress, to: completed` with result field |
| Failure transition | ✅ | `from: in_progress, to: failed` with error field |
| Inbox reading | ✅ | Simple `cat` of inbox.md |
| Send message | ✅ | Correct `send-message` JSON |
| Mailbox check | ✅ | Correct `mailbox-list` JSON |
| Mark delivered | ✅ | Correct `mailbox-mark-delivered` JSON |
| Important rules | ✅ | All 6 rules are concise and actionable |

**Verdict: Complete and well-designed.**

### Findings

| # | Severity | Finding |
|---|----------|---------|
| B-1 | LOW | **Hardcoded `leader-fixed` as message target** (line 72). The `send-message` example uses `"to_worker":"leader-fixed"`. While consistent with current omc behavior, a `{{LEADER_ID}}` template variable would be more robust if the leader naming convention changes. |

---

## File 2: `.claude-plugin/plugin.json` (31 lines)

### Correctness ✅

| Aspect | Status | Detail |
|--------|--------|--------|
| JSON validity | ✅ | Well-formed JSON |
| Required fields | ✅ | name, version, description, author, repository, license all present |
| Skill references | ✅ | `./skills/pi-setup/` and `./skills/pi-team/` — both exist and contain SKILL.md |
| Command references | ✅ | `./commands/pi-setup.md` and `./commands/pi-team.md` — both exist |
| Keywords | ✅ | 10 relevant keywords for discoverability |

### Findings

| # | Severity | Finding |
|---|----------|---------|
| P-1 | **MEDIUM** | **Version mismatch with marketplace.json.** `plugin.json` has `"version": "0.1.2"` while `marketplace.json` has `"version": "0.1.1"` (appears twice: once in the plugin entry and once at root level). This can cause installers to report stale versions, create confusion about which version is deployed, or break version-aware update checks. **Fix:** Sync both files to the same version number before each release. |
| P-2 | LOW | **No minimum omc version constraint.** README specifies "oh-my-claudecode v4.4.0+" but plugin.json has no `engines` or `peerDependencies` field. Claude Code plugins don't have a standard mechanism for this yet, but adding a comment or documentation note would help. |

---

## File 3: `skills/pi-setup/SKILL.md` (201 lines)

### Correctness ✅

| Aspect | Status | Detail |
|--------|--------|--------|
| Prerequisites check | ✅ | pi CLI, omc, tmux all checked with actionable install instructions |
| Existing config read | ✅ | Reads `~/.claude/pi-workers.json` with `2>/dev/null` fallback |
| Provider listing | ✅ | `pi --list-models 2>&1 \| awk 'NR>1 {print $1}' \| sort -u \| grep -v '^$'` — verified working, correctly extracts provider column |
| Per-provider model listing | ✅ | `pi --list-models <provider>` — verified working with pi CLI |
| Worker name validation | ✅ | Must start with `pi-`, ≥1 char suffix, lowercase alphanumeric + hyphens, no reserved names, no duplicates |
| JSON schema | ✅ | Correct pi-workers.json format with version, workers map, per-worker provider/model/binary/createdAt |
| Settings.json update | ✅ | Node.js block with `mkdirSync`, only updates if `defaultProvider`/`defaultModel` are missing |
| Error table | ✅ | Comprehensive (9 entries covering common failure modes) |

### Findings

| # | Severity | Finding |
|---|----------|---------|
| S-1 | LOW | **No code block for writing `~/.claude/pi-workers.json`.** Step 3 shows the target JSON format but doesn't provide a Node.js code block to write it (unlike the explicit settings.json write code). If `~/.claude/` directory doesn't exist, the write will fail. There's no `mkdirSync` for `~/.claude/`. **Fix:** Add a Node.js write block mirroring the settings.json pattern, with `mkdirSync(path.dirname(piWorkersPath), { recursive: true })`. |
| S-2 | LOW | **No duplicate-worker handling code.** The error table lists `Worker pi-zai already exists` but there's no explicit code to check for duplicates before writing or to offer an update/overwrite option. |
| S-3 | LOW | **`binary: "pi"` is hardcoded and never customized.** The worker schema includes a `binary` field always set to `"pi"`, but nothing reads it. If pi is installed under a different name (e.g., via nvm shim, or a wrapper script), this field would be misleading. |
| S-4 | LOW | **No validation that `pi --list-models <provider>` returns models before offering them.** If a provider has no models (API key issue, rate limit), the user would see an empty list with no explanation. |
| S-5 | INFO | **Worker deletion/update flow is missing.** The setup creates workers but there's no `/pi-setup --remove` or update mechanism. Users must manually edit `~/.claude/pi-workers.json` to remove or change a worker. |

---

## Cross-File Integration Quality

### Integration Point 1: plugin.json → skills/pi-setup/ → bootstrap prompt

**Flow:** `plugin.json` references `./skills/pi-setup/` which creates `~/.claude/pi-workers.json`. Later, `skills/pi-team/SKILL.md` reads this config in Phase 0 and uses it to build worker registrations. The `config/worker-bootstrap-prompt.md` is consumed by pi-team Phase 4d.

| Aspect | Status | Detail |
|--------|--------|--------|
| Config file path consistency | ✅ | Both skills reference `~/.claude/pi-workers.json` |
| Provider/model field names | ✅ | Consistent: `provider`, `model`, `binary`, `createdAt` |
| Worker name convention | ✅ | Both enforce `pi-` prefix |
| Template variable naming | ✅ | 5 variables in bootstrap template match what pi-team Phase 4d substitutes |

### Integration Point 2: command shims → skills

**Flow:** `commands/pi-setup.md` and `commands/pi-team.md` dispatch to their respective SKILL.md files.

| Aspect | Status | Detail |
|--------|--------|--------|
| Path resolution | ⚠️ | Commands say "Read the full bundled skill instructions from the active plugin: `skills/pi-setup/SKILL.md`" but don't provide an absolute resolution mechanism. The pi-team command adds fallback resolution (`CLAUDE_PLUGIN_ROOT`/`OMC_PLUGIN_ROOT`, package root, installed plugin directory) but pi-setup does not. **FIX:** Add the same fallback resolution to pi-setup.md. |

---

## Edge Cases Analysis

### Cases Handled Well ✅

| Edge Case | How | File |
|-----------|-----|------|
| pi not installed | Prerequisites check with install command | pi-setup |
| omc not installed | Prerequisites check | pi-setup |
| tmux not installed | Prerequisites check | pi-setup |
| No existing pi-workers.json | `cat 2>/dev/null` fallback | pi-setup |
| Missing settings.json | `mkdirSync` + conditional field updates | pi-setup |
| Corrupted JSON | Error table entry | pi-setup |
| Invalid worker name | Validation rules | pi-setup |
| Reserved name collision | Validation rules | pi-setup |
| Provider not found | `pi --list-models nonexistent` returns "No models matching" | pi-setup |
| Shared workspace git safety | Explicit instructions + rules | bootstrap |

### Cases Not Handled ⚠️

| Edge Case | Risk | File | Severity |
|-----------|------|------|----------|
| `~/.claude/` directory doesn't exist during pi-setup | pi-workers.json write fails silently | pi-setup | LOW (S-1) |
| User has multiple pi versions (nvm, local install) | `binary: "pi"` resolves to wrong binary | pi-setup | LOW (S-3) |
| pi-workers.json is manually edited with invalid JSON | pi-team Phase 0 would fail with cryptic parse error | pi-setup | LOW |
| Large number of models for a provider overflows terminal | No pagination on `pi --list-models <provider>` | pi-setup | INFO |
| pi-workers.json contains workers with providers that no longer exist | pi-team Phase 4d spawn fails with confusing error | pi-setup | LOW |
| User runs pi-setup while pi-team is running | No locking; pi-team could read partially-written config | pi-setup | LOW |

---

## Recommendations (Priority Order)

### Actionable Fixes

| # | Priority | Fix | Effort |
|---|----------|-----|--------|
| 1 | **MEDIUM** | Sync version between `plugin.json` (0.1.2) and `marketplace.json` (0.1.1) | 1 min |
| 2 | LOW | Add Node.js write block for `~/.claude/pi-workers.json` with `mkdirSync` to pi-setup Step 3 | 10 min |
| 3 | LOW | Add `{{LEADER_ID}}` template variable to bootstrap prompt | 5 min |
| 4 | LOW | Add same path-resolution fallback in `commands/pi-setup.md` as in `commands/pi-team.md` | 5 min |
| 5 | LOW | Add duplicate-worker check before write in pi-setup | 5 min |
| 6 | LOW | Validate that `pi --list-models <provider>` returns results before offering model selection | 5 min |

### Non-Blocking Improvements

| # | Improvement | Rationale |
|---|-------------|-----------|
| 7 | Add `~/.claude/pi-workers.json` schema validation in pi-team Phase 0 | Catches manual edits early |
| 8 | Add a worker update/remove flow to pi-setup | Users can currently only add, not modify |
| 9 | Consider adding an `engines.omc` or `engines.pi` field to plugin.json | Future-proights against version drift |
| 10 | Add pagination or filtering to model listing in pi-setup | Some providers have 20+ models |

---

## Verification

| Check | Method | Result |
|-------|--------|--------|
| `pi --list-models` provider extraction | Ran `pi --list-models 2>&1 \| awk 'NR>1 {print $1}' \| sort -u` | ✅ Returns `openai, zai` |
| `pi --list-models <provider>` filtering | Ran `pi --list-models openai` | ✅ Returns only openai models |
| `pi --list-models nonexistent` | Ran with invalid provider | ✅ Returns "No models matching" |
| `--append-system-prompt` flag | Verified in `pi --help` | ✅ Flag exists, semantics correct |
| plugin.json → skill path resolution | Checked `ls skills/pi-setup/SKILL.md` | ✅ File exists at referenced path |
| marketplace.json version check | `grep version` both files | ⚠️ Mismatch (0.1.2 vs 0.1.1) |
| Template variable substitution logic | Reviewed pi-team Phase 4d Node.js script | ✅ All 5 variables correctly substituted |
| Live omc team API protocol | Claimed task, sent heartbeats, listed tasks | ✅ All working per bootstrap instructions |

---

## Files Reviewed

| File | Lines | Verdict | Key Issues |
|------|-------|---------|------------|
| `config/worker-bootstrap-prompt.md` | 92 | ✅ Complete | LOW: hardcoded leader-fixed |
| `.claude-plugin/plugin.json` | 31 | ⚠️ | MEDIUM: version mismatch with marketplace.json |
| `.claude-plugin/marketplace.json` | 31 | ⚠️ | Same version mismatch |
| `skills/pi-setup/SKILL.md` | 201 | ⚠️ | LOW: missing write code for pi-workers.json |
| `commands/pi-setup.md` | 8 | ✅ | Missing path-resolution fallback |
| `commands/pi-team.md` | 14 | ✅ | Has path-resolution fallback |
| `AGENTS.md` | 40 | ✅ | Accurate project documentation |
| `README.md` | 151 | ✅ | Comprehensive and accurate |
