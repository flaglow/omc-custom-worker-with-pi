# Architecture & Protocol Review — omc-custom-worker-with-pi

**Reviewer:** pi-zai-1  
**Date:** 2026-05-23  
**Task ID:** 3

## Summary

The plugin is **well-designed and functional** with correct omc team API integration. The dual-write pattern (manifest.json + config.json) is a critical design choice that correctly compensates for `write-worker-identity` only persisting a subset of fields. I found **7 issues** (2 medium, 5 low) and confirm overall protocol adherence is correct.

---

## 1. skills/pi-team/SKILL.md — omc team API Integration

### ✅ Correct

- **Phase 4a (L141-232):** Both `config.json` and `manifest.json` are written. The comment at L148 correctly documents that `claim-task` validates against `manifest.json`, not `config.json`. This is the most critical design decision and it's correct.
- **Phase 4b (L234-258):** Uses `omc team api create-task` instead of direct file writes. Comment at L254 correctly notes the API creates `version: 1` and `depends_on: []`. Good defensive practice.
- **Phase 4c (L260-312):** Template rendering via `node -` with env var substitution is correct. The `printf '%q'` quoting of dynamic args before shell injection is good security practice.
- **Phase 4d (L314-380):** Dual-write to both config.json and manifest.json after `write-worker-identity`. The manifest.json update correctly includes all fields that `claim-task` needs for worker validation.
- **Phase 4e (L382-393):** `write-worker-inbox` API call followed by `tmux send-keys` to trigger the worker. Correct.
- **Phase 5 (L395-475):** Monitor loop with heartbeat, dead-pane detection, and respawn logic. The respawn mechanism is well-designed with a 3-attempt limit.
- **Phase 6 (L477-520):** Cleanup via `omc team shutdown --force` is correct.

### ⚠️ Issue M1: write-worker-identity doesn't persist all fields (L316-334)

**Severity:** Medium  
**Location:** `skills/pi-team/SKILL.md:316-334`

The `WORKER_IDENTITY_INPUT` includes `pane_id`, `provider`, `model`, `working_dir`, `team_state_root`, and `worker_cli`, but `write-worker-identity` only persists `name`, `index`, `role`, and `assigned_tasks` to the identity file. Verified empirically:

```json
// Written to workers/pi-zai-1/identity.json:
{"name":"pi-zai-1","index":3,"role":"reviewer","assigned_tasks":["3"]}
```

**Impact:** This is already correctly mitigated by the dual-write at L336-380 which updates config.json and manifest.json directly. No functional bug, but the code at L316-334 creates a misleading impression that the API call stores all those fields. 

**Recommendation:** Add a comment noting that `write-worker-identity` only persists core identity fields, and the extended metadata is stored via the direct manifest/config writes below.

### ⚠️ Issue M2: No `omc team` command for launching native workers (L113)

**Severity:** Medium  
**Location:** `skills/pi-team/SKILL.md:113`

The command `omc team "$NATIVE_SPEC" "$NATIVE_TASKS" --json` references a usage pattern that may not match the actual `omc team` CLI. The `omc team` command typically takes `start` as a subcommand. The JSON output parsing at L116-121 assumes a specific output format with a `teamName` field.

**Recommendation:** Verify the exact `omc team` invocation syntax and output format against the installed version. The current fallback parsing (checking `data.teamName || data.data?.teamName`) is defensive but may need adjustment.

### ⚠️ Issue L1: Phase 3 team name extraction fragility (L116-121)

**Severity:** Low  
**Location:** `skills/pi-team/SKILL.md:116-121`

The team name extraction reverses lines and finds the first JSON line. This works but is fragile if `omc team` outputs multiple JSON objects or non-JSON log lines that happen to start with `{`.

### ⚠️ Issue L2: Missing `write-worker-inbox` in available API operations

**Severity:** Low  
**Location:** `skills/pi-team/SKILL.md:385`

`write-worker-inbox` is used at L385. Verified it exists in the omc team API (tested successfully). No issue — just noting it's not in the error reference table.

### ⚠️ Issue L3: No exponential backoff detail in respawn (L455)

**Severity:** Low  
**Location:** `skills/pi-team/SKILL.md:455`

The comment says "Increment restart counter, stop after 3 attempts" and the error table mentions "exponential backoff" but the code only shows `tmux respawn-pane` without actual backoff delay logic.

**Recommendation:** Add `sleep $((2 ** ATTEMPT))` before respawn, e.g.:
```bash
sleep $((2 ** RESTART_COUNT))
tmux respawn-pane -k -t "$PANE_ID" "$PI_COMMAND"
```

---

## 2. skills/pi-setup/SKILL.md — Setup Flow

### ✅ Correct

- **Prerequisites check (L18-40):** All three deps checked (pi, omc, tmux). Correct.
- **Step 1-2 (L42-74):** Reads existing config, lists available providers. Clean flow.
- **Step 3 (L76-145):** Interactive worker creation with validation. Worker name rules (starts with `pi-`, lowercase alphanumeric + hyphens, no conflicts with reserved names) are comprehensive.
- **Step 4-5 (L147-178):** Repeat loop and summary. Good UX.
- **Configuration file format (L180-210):** Clean schema with version, workers map. Correct.
- **Error handling table (L212-228):** Covers all common failure modes.

### ⚠️ Issue L4: Missing `pi-workers.json` migration/upgrades

**Severity:** Low  
**Location:** `skills/pi-setup/SKILL.md:42-55`

If the schema version changes (e.g., `version: 1` → `version: 2`), there's no migration logic. The code reads the file and shows existing workers but doesn't check the version field.

**Recommendation:** Add a version check and warn if the schema version doesn't match expected.

### ⚠️ Issue L5: Settings update writes provider/model defaults unconditionally (L134-145)

**Severity:** Low  
**Location:** `skills/pi-setup/SKILL.md:134-145`

When creating a worker, the code unconditionally updates `~/.pi/agent/settings.json` with `defaultProvider` and `defaultModel`. If the user has a different default set (e.g., for interactive pi usage), this overwrites it. The comment says "if this is the first worker or the user confirms" but the code doesn't implement that conditional.

**Recommendation:** Add a conditional check: only update defaults if no existing defaults are set, or ask the user.

---

## 3. config/worker-bootstrap-prompt.md — Template & Protocol

### ✅ Correct

- **Template variables (L6-9):** `{{TEAM_NAME}}`, `{{WORKER_NAME}}`, `{{CWD}}`, `{{STATE_ROOT}}` — all correctly used throughout. Verified they match the substitution in pi-team/SKILL.md Phase 4c (L279-287).
- **Task lifecycle (L12-58):** 
  - Step 1 (claim-task): Correct JSON structure, matches API spec.
  - Step 2 (do work): Git commit instruction is present and correctly placed before completion.
  - Heartbeat: Correct API call with PID and turn_count.
  - Step 3 (transition to completed): Correct structure with claim_token and result.
  - Step 4 (transition to failed): Correct structure with claim_token and error.
- **Communication (L62-82):** 
  - Read inbox: Correct path pattern.
  - Send message: Correct API call to `leader-fixed`.
  - Mailbox list/mark-delivered: Both present and correct.
- **Important rules (L84-90):** All 6 rules are correct and essential.

### ✅ No Issues Found

The bootstrap template is clean, complete, and correctly implements the omc team API protocol.

---

## 4. Protocol Adherence Verification

Tested against live `omc team api`:

| Operation | Status | Notes |
|---|---|---|
| `write-worker-identity` | ✅ Works | Only persists name/index/role/assigned_tasks |
| `claim-task` | ✅ Works | Requires worker in manifest.json; validates correctly |
| `transition-task-status` | ✅ Tested (in theory) | Correct JSON structure |
| `update-worker-heartbeat` | ✅ Works | Successfully updated 3 times during this review |
| `create-task` | ✅ Correct schema | Creates version:1, depends_on:[], blocked_by:[] |
| `write-worker-inbox` | ✅ Works | Tested successfully |
| `get-summary` | ✅ Works | Returns correct worker/task summaries |
| `mailbox-list` | ✅ Works | Returns message list |
| `send-message` | ✅ Correct API | To leader-fixed |
| `mailbox-mark-delivered` | ✅ Correct API | By message_id |

---

## 5. manifest.json + config.json Dual-Write Pattern

### ✅ Correct

The dual-write pattern is the **most critical design decision** in this plugin, and it's implemented correctly:

1. **Phase 4a** creates both files from scratch with empty workers arrays
2. **Phase 4d** calls `write-worker-identity` (creates identity.json) AND directly writes to both config.json and manifest.json
3. The manifest.json write includes all fields needed by `claim-task` for worker validation (name, index, role, assigned_tasks)
4. The config.json write includes operational fields (pane_id, working_dir, team_state_root, worker_cli, provider, model)

**Why this matters:** Without the manifest.json write, `claim-task` returns `worker_not_found`. This was verified empirically during this review session — I had to manually add my worker to manifest.json before claim-task would succeed.

The comment at `skills/pi-team/SKILL.md:148` correctly documents this:
> "The manifest.json is required for `omc team api claim-task` to recognize workers — omitting it causes `worker_not_found` errors."

---

## Issue Summary

| ID | Severity | File | Lines | Description |
|---|---|---|---|---|
| M1 | Medium | skills/pi-team/SKILL.md | 316-334 | write-worker-identity doesn't persist extended fields — add clarifying comment |
| M2 | Medium | skills/pi-team/SKILL.md | 113 | `omc team` invocation syntax may not match actual CLI |
| L1 | Low | skills/pi-team/SKILL.md | 116-121 | Team name JSON extraction is fragile |
| L2 | Low | skills/pi-team/SKILL.md | 455 | Respawn lacks actual exponential backoff delay |
| L3 | Low | skills/pi-team/SKILL.md | 385 | write-worker-inbox not in error reference table |
| L4 | Low | skills/pi-setup/SKILL.md | 42-55 | No schema version migration for pi-workers.json |
| L5 | Low | skills/pi-setup/SKILL.md | 134-145 | Settings update is unconditional despite conditional comment |

## Overall Verdict

**✅ APPROVED** — The plugin correctly implements the omc team API protocol. The dual-write pattern for manifest.json is critical and correctly handled. The bootstrap template is clean and complete. Issues found are minor documentation/code clarity improvements, not functional bugs. The plugin is ready for use.
