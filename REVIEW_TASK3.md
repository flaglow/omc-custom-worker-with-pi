# Architecture & Protocol Review — omc-custom-worker-with-pi (Task 3)

**Reviewer:** pi-zai-1  
**Date:** 2026-05-23  
**Task ID:** 3  
**Commit Reviewed:** current HEAD  

---

## Executive Summary

The plugin is **well-designed and largely correct**. The critical register-before-spawn pattern works as verified by this live session. I identified **2 medium-severity issues**, **5 low-severity issues**, and **3 informational observations**. The medium issues involve a stale identity.json (cosmetic but confusing for debugging) and a misleading respawn comment referencing the wrong phase.

---

## Live API Verification

All `omc team api` operations tested during this review:

| Operation | Result | Notes |
|---|---|---|
| `claim-task` | ✅ | Succeeded after manifest.json registration — no `worker_not_found` errors |
| `update-worker-heartbeat` | ✅ | 3+ successful heartbeat calls |
| `create-task` | ✅ | Task 3 was created with correct schema |
| `write-worker-identity` | ✅ | Persisted core fields to identity.json |
| `list-tasks` | ✅ | Returns all 3 tasks correctly |
| `get-summary` | ✅ | Accurate state snapshot |
| `mailbox-list` | ✅ | Callable |
| `send-message` | ✅ | Callable |

**Key validation:** `claim-task` correctly validates workers against `manifest.json`, NOT `config.json` or `identity.json`. The Phase 4c dual-write pattern ensures manifest.json is populated before the worker spawns.

---

## Findings

### MEDIUM-1: identity.json becomes stale — pane_id never updated, provider/model missing

**File:** `skills/pi-team/SKILL.md:269-277` (write-worker-identity call)  
**File:** `skills/pi-team/SKILL.md:349-359` (post-spawn pane_id update)

The `write-worker-identity` API call at Phase 4c creates `workers/pi-zai-1/identity.json` with:
```json
{
  "name": "pi-zai-1",
  "index": 1,
  "role": "executor",
  "assigned_tasks": ["3"],
  "pane_id": "pending",
  "working_dir": "...",
  "team_state_root": "..."
}
```

**Confirmed by live state:** identity.json still has `"pane_id": "pending"` while manifest.json has the real `"pane_id": "%30"`.

The post-spawn Node.js script at Phase 4d updates config.json and manifest.json pane_ids, but does **NOT** update identity.json. Additionally, `provider`, `model`, and `worker_cli` fields are written to config.json/manifest.json via the Phase 4c Node.js dual-write, but `write-worker-identity` doesn't persist them to identity.json.

**Impact:** Any code reading identity.json for provider/model info gets incomplete data. No functional impact currently since `claim-task` reads manifest.json, but this creates a maintenance trap.

**Fix:** Add identity.json to the post-spawn update loop in Phase 4d:

```javascript
// In Phase 4d PANEUPDATE script, add identity.json to the file list:
for (const file of ["config.json", "manifest.json", 
     `workers/${name}/identity.json`]) {
```

---

### MEDIUM-2: Respawn comment references wrong phase

**File:** `skills/pi-team/SKILL.md:484`

```bash
# Rebuild PI_COMMAND with the Phase 4c printf %q block first.
```

Phase 4c is **registration** (write-worker-identity + Node.js dual-write). The `printf '%q'` quoting block is in Phase 4d (spawn). This comment should say "Phase 4d".

**Impact:** Misleading documentation — a developer debugging respawn logic would look at the wrong phase.

**Fix:** Change `Phase 4c` to `Phase 4d` on line 484.

---

### LOW-1: No test infrastructure despite AGENTS.md claiming otherwise

**File:** `AGENTS.md:29-33`

```
## Testing
Run integration tests against `omc team api` operations:
```

There are no test files, no `package.json`, and no test runner in the repository. This is aspirational documentation.

**Fix:** Either add a basic integration test script (e.g., `tests/test-team-api.sh`) or remove/update the Testing section to say "Tests pending."

---

### LOW-2: pi-setup SKILL.md has no explicit code for writing pi-workers.json

**File:** `skills/pi-setup/SKILL.md:91-103`

The skill shows the target JSON format but doesn't provide a code block for writing to `~/.claude/pi-workers.json`. It provides a Node.js block for updating `~/.pi/agent/settings.json` (with `mkdirSync`), but the pi-workers.json write is left implicit. There's also no `mkdirSync` for `~/.claude/`.

**Fix:** Add a Node.js code block that creates `~/.claude/` if needed, reads existing pi-workers.json, merges the new worker entry, and writes back.

---

### LOW-3: Bootstrap template hardcodes `leader-fixed` as message target

**File:** `config/worker-bootstrap-prompt.md:72`

```bash
"to_worker":"leader-fixed"
```

This works because the plugin always creates a leader with that ID, but should arguably be `{{LEADER_ID}}` for future-proofing.

**Impact:** Low — consistent with current behavior.

---

### LOW-4: Worker index collision with native workers

**File:** `skills/pi-team/SKILL.md:277`

```
WORKER_NAME="pi-${NAME}-${INDEX}"
```

Confirmed in live state: `pi-zai-1` has `"index": 1` and `worker-1` also has `"index": 1`. While `name` is the unique key and `index` is just metadata, this could confuse debugging.

**Impact:** Low — no functional impact since `name` is the unique identifier.

---

### LOW-5: Phase 4a config.json template incomplete vs what omc team V2 writes

**File:** `skills/pi-team/SKILL.md:160-195`

The template omits fields present in the actual omc-generated config.json:
- `tmux_window_owned`
- `resolved_routing` (large routing config block)
- `resize_hook_name`, `resize_hook_target`

These are added by omc team's native launch. When Phase 3 is skipped (all-pi-worker teams), these fields will be missing. Currently works due to defensive defaults in the runtime, but future omc versions may require them.

**Impact:** Low — only affects all-pi-worker teams (no native workers). Currently functional.

---

### INFO-1: Dual-write produces benign canonicalization warning

**File:** `skills/pi-team/SKILL.md:269-337`

Phase 4c writes worker data via both `write-worker-identity` (API call) and the Node.js script (direct file writes). The API call adds the worker entry, then the Node.js script reads, deduplicates, and re-writes. This produced a `[team] canonicalized duplicate worker entries: worker-1, worker-2, pi-zai-1` warning when I claimed this task.

**Status:** Benign — the dedup logic in the Node.js script prevents corruption. But noisy.

---

### INFO-2: Phase 3 omc team invocation unverified

**File:** `skills/pi-team/SKILL.md:118-127`

```bash
NATIVE_OUTPUT=$(omc team "$NATIVE_SPEC" "$NATIVE_TASKS" 2>&1)
TEAM_NAME=$(printf "%s" "$NATIVE_OUTPUT" | grep -oP 'Team started: *\K.*')
```

This invocation pattern (`omc team <spec> <tasks>`) hasn't been verified against the actual `omc` CLI. It may need to be `omc team start <spec> <tasks>` or similar. The team name extraction via grep is also fragile for multi-line output.

**Status:** Unverified — may work as-is or may need adjustment.

---

### INFO-3: Bootstrap template is complete and well-designed

**File:** `config/worker-bootstrap-prompt.md`

- ✅ All 5 template variables (TEAM_NAME, WORKER_NAME, TASK_ID, CWD, STATE_ROOT) correctly used
- ✅ Full lifecycle protocol (claim → work → heartbeat → complete/fail)
- ✅ Communication methods (inbox, send-message, mailbox, mark-delivered)
- ✅ Git commit safety instructions
- ✅ 6 essential rules

---

## File-by-File Assessment

| File | Lines | Verdict | Key Issues |
|------|-------|---------|------------|
| `README.md` | 151 | ✅ Accurate | Well-documented architecture, correct usage examples |
| `AGENTS.md` | 40 | ⚠️ | Testing section has no backing tests (LOW-1) |
| `.claude-plugin/plugin.json` | 31 | ✅ | Valid JSON, correct skill/command references |
| `.claude-plugin/marketplace.json` | 31 | ✅ | Correct metadata |
| `skills/pi-team/SKILL.md` | 551 | ⚠️ | MEDIUM-1 (stale identity.json), MEDIUM-2 (wrong phase ref), LOW-5 (incomplete template) |
| `skills/pi-setup/SKILL.md` | 201 | ⚠️ | LOW-2 (no write code for pi-workers.json) |
| `config/worker-bootstrap-prompt.md` | 92 | ✅ | Complete, well-designed |
| `commands/pi-team.md` | 14 | ✅ | Correct dispatch shim |
| `commands/pi-setup.md` | 8 | ✅ | Correct dispatch shim |
| `.gitignore` | 15 | ✅ | Appropriate exclusions |

---

## Protocol Correctness

| Phase | Purpose | Correct? | Notes |
|---|---|---|---|
| Phase 0 | Prerequisites | ✅ | Gated on pi-worker presence for pi-specific checks |
| Phase 1 | Parse & classify | ✅ | Regex handles `pi-name/model` overrides |
| Phase 2 | Task decomposition | ✅ | Clear guidelines per worker type |
| Phase 3 | Launch native workers | ⚠️ | Unverified `omc team` invocation (INFO-2) |
| Phase 4a | Team infrastructure | ⚠️ | Missing some fields vs omc V2 (LOW-5) |
| Phase 4b | Create tasks | ✅ | Uses `omc team api create-task` |
| Phase 4c | Register worker | ✅ | `write-worker-identity` + dual-write, BEFORE spawn |
| Phase 4d | Spawn pane | ✅ | `tmux split-window` + post-spawn pane_id update |
| Phase 4e | Task dispatch | ✅ | `write-worker-inbox` + `tmux send-keys` |
| Phase 5 | Monitor loop | ✅ | Heartbeat + dead-pane detection + respawn |
| Phase 6 | Cleanup | ✅ | `omc team shutdown --force` |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| identity.json stale data used by future code | Medium | Low | Update identity.json in post-spawn script |
| Phase 4c comment misleads debugging | Medium | Low | Fix the comment |
| Phase 4a template missing fields breaks future omc | Low | Medium | Add missing fields with defaults |
| Phase 3 omc invocation syntax wrong | Low-Medium | Medium | Verify against installed omc version |
| Respawn without actual backoff sleep | Low | Low | Works but may hit rate limits |

---

## Recommendations (Priority Order)

1. **Fix identity.json stale pane_id** — Add identity.json to the Phase 4d post-spawn update script (MEDIUM-1)
2. **Fix wrong phase reference** — Change "Phase 4c" to "Phase 4d" in respawn comment at line 484 (MEDIUM-2)
3. **Add pi-workers.json write code** to pi-setup/SKILL.md with `mkdirSync` for `~/.claude/` (LOW-2)
4. **Verify Phase 3 omc team invocation** syntax against installed omc CLI (INFO-2)
5. **Add missing fields to Phase 4a templates** to match omc V2 schema (LOW-5)
6. **Update or remove Testing section** in AGENTS.md (LOW-1)
