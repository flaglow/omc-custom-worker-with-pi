# Architecture Review — omc-custom-worker-with-pi (Fresh Independent Review)

**Reviewer:** pi-zai-1  
**Task ID:** 3  
**Date:** 2026-05-23  
**Commit Reviewed:** `a943c09` (HEAD of main)  
**Scope:** plugin.json, SKILL.md files, bootstrap prompt, worker registration protocol, edge cases, overall design quality  

---

## Executive Summary

The plugin is **architecturally sound and production-viable**. It solves a real problem — integrating arbitrary LLM providers into oh-my-claudecode teams via the pi CLI — with a clean split-plane approach. The register-before-spawn protocol is correctly implemented and verified in this live session. I found **0 critical issues, 3 medium issues, 7 low issues, and 4 informational observations**. The medium issues are about robustness and maintainability, not correctness bugs.

**Overall Grade: A-**

---

## 1. plugin.json Structure

**File:** `.claude-plugin/plugin.json`

### Findings

| # | Severity | Finding |
|---|----------|---------|
| 1.1 | ✅ | Valid JSON, well-structured metadata with all required fields (name, version, description, author, repository, license) |
| 1.2 | ✅ | Skill and command references use correct relative paths (`./skills/pi-team/`, `./commands/pi-team.md`) |
| 1.3 | ✅ | Keywords are comprehensive and discoverable |
| 1.4 | ✅ | Version `0.1.1` matches marketplace.json — consistent |

### marketplace.json

| # | Severity | Finding |
|---|----------|---------|
| 1.5 | ✅ | `$schema` reference present for validation |
| 1.6 | ✅ | Category `multi-agent` is appropriate |
| 1.7 | ✅ | Tags match plugin.json keywords |

**No issues found in plugin metadata.**

---

## 2. pi-team SKILL.md — Architecture Analysis

**File:** `skills/pi-team/SKILL.md` (551 lines)

### 2.1 Phase Design Review

| Phase | Purpose | Design Quality | Issues |
|-------|---------|---------------|--------|
| Phase 0 | Prerequisites | ✅ Clean gating — pi checks conditional on worker spec | None |
| Phase 1 | Parse & classify | ✅ Regex handles `pi-name/model` | LOW-4 (index collision) |
| Phase 2 | Task decomposition | ✅ Role-based guidelines | None |
| Phase 3 | Native workers | ⚠️ Fragile parsing | MEDIUM-1 |
| Phase 4a | Team infrastructure | ✅ Dual config.json + manifest.json | MEDIUM-2 |
| Phase 4b | Create tasks | ✅ Uses `omc team api create-task` | None |
| Phase 4c | Register worker | ✅ write-worker-identity + Node.js dual-write | MEDIUM-3 |
| Phase 4d | Spawn pane | ✅ printf '%q' quoting, post-spawn update | LOW-1 |
| Phase 4e | Task dispatch | ✅ write-worker-inbox + tmux send-keys | None |
| Phase 5 | Monitor loop | ✅ Heartbeat + respawn with backoff comment | LOW-2 |
| Phase 6 | Cleanup | ✅ Summary table + shutdown | None |

### 2.2 Security Analysis

- ✅ All dynamic arguments passed through `printf '%q'` before shell injection — prevents command injection
- ✅ No hardcoded API keys or credentials
- ✅ `--append-system-prompt` used correctly (not `--system-prompt` which would override pi's base prompt)
- ⚠️ Bootstrap template is passed as a CLI argument (`--append-system-prompt <rendered-text>`). If the template grows very large, it could exceed shell argument length limits (~128KB on Linux, ~2MB on macOS). Currently at ~3KB this is fine.

### 2.3 Concurrency Model

The design is a **shared-workspace model** where all workers write to the same git working tree. The skill correctly:
- Instructs workers to commit only their own changes
- Warns about overwriting other workers' uncommitted changes
- Does NOT use git worktrees (worktree_mode: "disabled")

This is the correct tradeoff for simplicity. Worktree mode would avoid merge conflicts but requires more setup.

---

## 3. pi-setup SKILL.md — Architecture Analysis

**File:** `skills/pi-setup/SKILL.md` (201 lines)

### 3.1 Flow Quality

The interactive setup flow is well-designed:
1. Check existing config → 2. List providers → 3. Create worker (loop) → 4. Summary

### 3.2 Validation

- ✅ Worker name must start with `pi-`
- ✅ Suffix must be ≥1 character
- ✅ Lowercase alphanumeric + hyphens only
- ✅ No conflicts with reserved names (claude, codex, gemini)
- ✅ No duplicate worker names

### 3.3 Issues

See MEDIUM-4 (pi-workers.json write not provided as code block).

---

## 4. Bootstrap Prompt Template

**File:** `config/worker-bootstrap-prompt.md` (92 lines)

### 4.1 Template Variables

| Variable | Used in Template | Substituted in Phase 4d | Correct |
|----------|-----------------|------------------------|---------|
| `{{TEAM_NAME}}` | 8 occurrences | ✅ | ✅ |
| `{{WORKER_NAME}}` | 10 occurrences | ✅ | ✅ |
| `{{TASK_ID}}` | 8 occurrences | ✅ | ✅ |
| `{{CWD}}` | 1 occurrence | ✅ | ✅ |
| `{{STATE_ROOT}}` | 2 occurrences | ✅ | ✅ |

### 4.2 Protocol Completeness

| Protocol Step | Covered | Quality |
|---------------|---------|---------|
| Claim task | ✅ | Complete with save-claim-token instruction |
| Do work | ✅ | Clear instruction to use tools |
| Git commit before completion | ✅ | Good shared-workspace warning |
| Heartbeat updates | ✅ | Periodic, with PID/turn_count instructions |
| Report completion | ✅ | Includes result format |
| Report failure | ✅ | Includes error format |
| Read inbox | ✅ | cat-based (simple, reliable) |
| Send messages | ✅ | To leader-fixed |
| Check mailbox | ✅ | |
| Mark delivered | ✅ | Prevents duplicate processing |
| Important rules (6 items) | ✅ | Concise, actionable |

### 4.3 Issues

See LOW-3 (hardcoded `leader-fixed`).

---

## 5. Worker Registration Protocol Correctness

### 5.1 Dual Registration Pattern

The plugin uses a **dual-write** pattern:
1. `omc team api write-worker-identity` — creates `identity.json`, updates internal omc state
2. Node.js script — directly writes `config.json` and `manifest.json`

**Verified correct** — I claimed my task successfully because manifest.json had my entry before my pane was spawned. The Phase 4c → 4d ordering is enforced both by comments and by the sequential structure of the skill.

### 5.2 Live Verification

| Check | Result |
|-------|--------|
| `manifest.json` has pi-zai-1 with correct fields | ✅ name, index, role, assigned_tasks, pane_id, worker_cli, provider, model |
| `config.json` has pi-zai-1 with matching fields | ✅ |
| `identity.json` created with core fields | ✅ name, index, role, assigned_tasks |
| `claim-task` succeeded | ✅ token `7f0725b3-9b77-492b-a57e-23dcd6def2d4` |
| `update-worker-heartbeat` succeeded | ✅ (5 calls) |
| "canonicalized duplicate" warning | ⚠️ Present — see MEDIUM-3 |

---

## 6. Edge Cases Analysis

### 6.1 Edge Cases Handled

| Edge Case | Handling | Quality |
|-----------|----------|---------|
| All pi workers, no native | Phase 3 skipped, Phase 4a creates infra | ✅ Explicit |
| All native workers, no pi | Phase 4 skipped, pi checks gated | ✅ |
| Single worker | Noted — no decomposition needed | ✅ |
| Model override (`pi-zai/glm-5-turbo`) | Regex strips `/model` suffix | ✅ |
| Dead worker respawn | 3 attempts with exponential backoff | ✅ |
| Worker already claimed task | Error table entry | ✅ |
| Mixed team already running | Can join existing team | ✅ |

### 6.2 Edge Cases NOT Handled or Under-Specified

| Edge Case | Issue | Severity |
|-----------|-------|----------|
| Worker name collision across pi-workers.json reloads | No locking on pi-workers.json | LOW |
| Empty worker spec (`0:pi-zai`) | No validation that count ≥ 1 | LOW |
| Unknown provider in pi-workers.json | No validation at registration time | LOW |
| Concurrent pi-team invocations | Team name includes timestamp, so unlikely to collide, but no mutex | LOW |
| pi-workers.json deleted between Phase 0 and Phase 4c | No re-validation | LOW |

---

## 7. Detailed Findings

### MEDIUM-1: Phase 3 team name extraction is fragile

**File:** `skills/pi-team/SKILL.md`, Phase 3  
**Lines:** ~137-145

```bash
TEAM_NAME=$(printf "%s" "$NATIVE_OUTPUT" | grep -oP 'Team started: *\K.*')
```

The assumption that `omc team` outputs `Team started: <name>` is unverified against the actual omc CLI. Based on the error reference table entry `"omc team status: not found"`, the actual output format may differ. Additionally, if the format changes between omc versions, this parsing will silently break.

**Recommendation:** Add a validation check:
```bash
[ -n "$TEAM_NAME" ] || { echo "ERROR: unable to resolve omc team name from output:\n$NATIVE_OUTPUT"; exit 1; }
```
(This is actually present in the skill! Good. But the parsing itself should also be documented as fragile.)

### MEDIUM-2: Phase 4a template config.json/manifest.json may drift from omc runtime expectations

**File:** `skills/pi-team/SKILL.md`, Phase 4a  
**Lines:** ~156-228

The templates hardcode a specific schema. Comparing against the actual `config.json` written by omc team for this session, several fields are present in the live config but missing from the template:
- `tmux_window_owned`
- `resize_hook_name` / `resize_hook_target`
- `hud_pane_id` (present as `null`)
- `resolved_routing` (complex nested object)

The templates work today because omc uses defensive defaults for missing fields, but this is a **maintenance hazard** — future omc versions may require these fields.

**Recommendation:** Add a comment in the template noting it may need updating when omc is upgraded. Consider reading omc's actual schema from a canonical source.

### MEDIUM-3: Dual registration produces "canonicalized duplicate" warning

**File:** `skills/pi-team/SKILL.md`, Phase 4c

Every call to `omc team api get-summary` for this team produces:
```
[team] canonicalized duplicate worker entries: worker-1, worker-2, pi-zai-1
```

This happens because `write-worker-identity` writes the worker entry first, then the Node.js script re-writes it with extended fields. The omc runtime detects the dual entry and canonicalizes it.

**Impact:** Benign but noisy. Logs fill with warnings. Could mask real issues.

**Recommendation:** The Node.js script's `.filter((entry) => entry?.name !== worker.name)` dedup logic is correct, but the timing creates a brief window where the entry appears twice. Consider either:
- Removing the `write-worker-identity` call and relying solely on Node.js writes (simpler, fewer moving parts)
- Or removing the Node.js writes and extending `write-worker-identity` to persist all fields (provider, model, worker_cli, pane_id)

### LOW-1: identity.json never gets pane_id or extended fields updated

**File:** Phase 4d post-spawn update  
**Evidence:** `identity.json` shows `pane_id: "pending"` while manifest.json shows `pane_id: "%34"`

The post-spawn Node.js script updates config.json and manifest.json but skips identity.json. No current code reads pane_id from identity.json, but this is an inconsistency that could confuse debugging.

### LOW-2: Respawn sleep is a comment, not code

**File:** `skills/pi-team/SKILL.md`, Phase 5

The comment says `# Exponential backoff: sleep 2^attempt seconds before retry` but there is no `sleep` command in the code block. This is prescriptive rather than executable.

**Recommendation:** Add `sleep $((2 ** RESTART_COUNT))` before the respawn command.

### LOW-3: Bootstrap template hardcodes `leader-fixed`

**File:** `config/worker-bootstrap-prompt.md:72`

The `to_worker` in `send-message` is hardcoded to `"leader-fixed"`. This should be a template variable `{{LEADER_ID}}` for future-proofing, though it's consistent with how the plugin creates leaders today.

### LOW-4: Worker index collision with native workers

**File:** `skills/pi-team/SKILL.md`

In the live manifest, `worker-1` has `index: 1` and `pi-zai-1` also has `index: 3`. The index is scoped per-worker-type but the manifest doesn't distinguish. The `name` field is the unique key, so this doesn't cause bugs, but it's untidy.

### LOW-5: pi-setup doesn't provide code for writing pi-workers.json

**File:** `skills/pi-setup/SKILL.md`

Code is provided for updating `~/.pi/agent/settings.json` (with `mkdirSync`) but not for writing `~/.claude/pi-workers.json`. If `~/.claude/` doesn't exist, the write will fail. The skill leaves it to Claude to figure out the write logic, which is inconsistent with the explicit settings.json code block.

### LOW-6: No validation of provider/model at registration time

**File:** `skills/pi-team/SKILL.md`, Phase 0

Phase 0 reads `pi-workers.json` but doesn't validate that the provider and model in the JSON are currently available (e.g., `pi --list-models` could have changed since setup). A stale configuration would fail at spawn time with a potentially confusing error.

### LOW-7: pi-setup settings.json overwrite condition

**File:** `skills/pi-setup/SKILL.md`

The Node.js code only sets `defaultProvider`/`defaultModel` if missing, which is good. But if the user has intentionally set different defaults in pi, running pi-setup for a new worker won't disturb them. ✅ This is actually handled correctly.

---

## 8. Design Quality Assessment

### 8.1 Strengths

1. **Register-before-spawn protocol** — The critical insight that manifest.json must be updated before the worker pane starts is correctly implemented and well-documented. This prevents the `worker_not_found` race condition.

2. **Clean separation of concerns** — pi workers are managed by Claude via tmux + omc team api, native workers by omc team. The split is clean and each path is independent.

3. **Dual-write with dedup** — While the canonicalized-duplicate warning is noisy (MEDIUM-3), the dedup logic in the Node.js script prevents actual data corruption.

4. **Security-conscious argument handling** — `printf '%q'` on all dynamic arguments before shell injection is correct and consistent.

5. **Template variable approach** — The bootstrap template uses simple `{{VAR}}` substitution via Node.js, which is easy to understand and maintain.

6. **Prerequisite gating** — Conditionally checking pi CLI and pi-workers.json only when pi workers are present is the right optimization.

7. **Auto-respawn** — The monitor loop's dead-pane detection and respawn with backoff (up to 3 attempts) is a robust feature that native omc workers don't have.

### 8.2 Architectural Concerns

1. **Template drift risk** — The Phase 4a config.json/manifest.json templates are a snapshot of omc's current schema. They will silently become stale as omc evolves. There's no schema versioning or validation mechanism.

2. **Dual-write maintenance burden** — Having two code paths (write-worker-identity API + Node.js file writes) for the same data is a maintenance risk. Any future field additions need to be updated in both places.

3. **No schema validation** — The plugin reads `pi-workers.json` and trusts its structure. Corrupted or manually-edited JSON could cause cryptic failures downstream.

4. **Shell-script-heavy orchestration** — The entire orchestration is expressed as bash/node one-liners in a markdown file. This is correct for the omc skill format, but makes debugging difficult when something goes wrong. There are no unit tests or validation scripts.

---

## 9. Comparison to Prior Reviews

Two prior reviews exist (`ARCHITECTURE_REVIEW.md` and `ARCHITECTURE_REVIEW_PI_ZAI.md`). My findings are largely consistent but I've added:

- **New findings:** LOW-6 (no provider/model validation at registration time), more detailed edge case analysis (section 6.2)
- **Agreement with prior reviews:** The dual-write warning (MEDIUM-3), identity.json staleness (LOW-1), respawn sleep gap (LOW-2), and template drift (MEDIUM-2) are confirmed
- **Resolution note:** The critical race condition (register-before-spawn) identified in the first review was fixed and is verified working in this live session

---

## 10. Files Reviewed

| File | Lines | Verdict |
|------|-------|---------|
| `.claude-plugin/plugin.json` | 31 | ✅ Correct |
| `.claude-plugin/marketplace.json` | 31 | ✅ Correct |
| `skills/pi-team/SKILL.md` | 551 | ⚠️ 3 medium, 4 low issues |
| `skills/pi-setup/SKILL.md` | 201 | ⚠️ 1 low issue |
| `config/worker-bootstrap-prompt.md` | 92 | ✅ Complete |
| `commands/pi-team.md` | 14 | ✅ Correct dispatch shim |
| `commands/pi-setup.md` | 8 | ✅ Correct dispatch shim |
| `README.md` | 151 | ✅ Accurate and comprehensive |
| `AGENTS.md` | 40 | ⚠️ Testing section aspirational |
| `.gitignore` | 15 | ✅ Appropriate |
| `LICENSE` | — | ✅ MIT |

---

## 11. Summary Table

| ID | Severity | Component | Description | Status |
|----|----------|-----------|-------------|--------|
| MEDIUM-1 | Medium | pi-team/SKILL.md Phase 3 | Team name extraction from omc output is fragile | Open |
| MEDIUM-2 | Medium | pi-team/SKILL.md Phase 4a | Config/manifest templates may drift from omc schema | Open |
| MEDIUM-3 | Medium | pi-team/SKILL.md Phase 4c | Dual registration produces "canonicalized duplicate" warning | Open |
| LOW-1 | Low | pi-team/SKILL.md Phase 4d | identity.json never gets pane_id updated | Open |
| LOW-2 | Low | pi-team/SKILL.md Phase 5 | Respawn sleep is comment-only, not code | Open |
| LOW-3 | Low | bootstrap-prompt.md | Hardcoded `leader-fixed` | Open |
| LOW-4 | Low | pi-team/SKILL.md Phase 1 | Worker index collision with native workers | Open |
| LOW-5 | Low | pi-setup/SKILL.md | No code block for writing pi-workers.json | Open |
| LOW-6 | Low | pi-team/SKILL.md Phase 0 | No provider/model validation at registration time | Open |
| LOW-7 | Low | AGENTS.md | Testing section has no backing test files | Open |

---

## Verification

- ✅ `claim-task` succeeded — manifest.json registration confirmed
- ✅ `update-worker-heartbeat` — 5 successful calls
- ✅ `list-tasks` — all 3 tasks visible with correct state
- ✅ `get-summary` — pi-zai-1 shown as alive
- ✅ `mailbox-list` — callable
- ✅ manifest.json contains pi-zai-1 with correct extended fields
- ✅ config.json matches manifest.json for pi-zai-1
- ⚠️ identity.json has stale `pane_id: "pending"`
- ⚠️ "canonicalized duplicate" warning on every get-summary call
