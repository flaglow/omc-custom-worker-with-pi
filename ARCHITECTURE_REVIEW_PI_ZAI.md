# Architecture & Protocol Review: omc-custom-worker-with-pi

**Reviewer:** pi-zai-1  
**Date:** 2026-05-23  
**Scope:** `omc team api` integration, manifest.json handling, bootstrap template completeness, overall correctness

---

## Summary

The plugin is well-structured and functional. It successfully integrates pi CLI workers into the omc team ecosystem. The dual-registration pattern (write-worker-identity + direct Node.js writes) works correctly in practice, and the bootstrap template is complete and well-designed. Below are findings ranging from medium-severity issues to minor nits.

---

## Findings

### MEDIUM-1: Dual write to config.json/manifest.json produces "canonicalized duplicate" warning

**File:** `skills/pi-team/SKILL.md:300-337`

Phase 4c performs **two** writes for the same worker:
1. `omc team api write-worker-identity` (line 300) — internally updates config.json and manifest.json
2. Node.js heredoc script (lines 305-337) — reads, filters duplicates, and re-writes config.json and manifest.json

The `write-worker-identity` call adds the worker entry first. Then the Node.js script runs and adds it again (though it deduplicates via `.filter`). This produces a `[team] canonicalized duplicate worker entries` warning from `omc team api get-summary`.

**Impact:** Benign but noisy. The dedup logic in the Node.js script prevents actual corruption.

**Recommendation:** Either skip `write-worker-identity` and rely solely on the Node.js writes, or remove the Node.js writes and extend `write-worker-identity` to handle all fields (provider, model, pane_id). The current dual approach creates a maintenance risk — if one write path is updated without the other, they'll diverge.

---

### MEDIUM-2: identity.json becomes stale — missing provider/model/worker_cli/pane_id fields

**File:** `config/worker-bootstrap-prompt.md` (no issue here)  
**File:** `skills/pi-team/SKILL.md:300-304` (write-worker-identity)

The `write-worker-identity` call creates `workers/pi-zai-1/identity.json` with these fields:
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

But manifest.json has the **correct** and **enriched** entry:
```json
{
  "name": "pi-zai-1",
  "pane_id": "%26",
  "worker_cli": "pi",
  "provider": "zai",
  "model": "glm-5.1",
  ...
}
```

**Discrepancies:**
- `identity.json` has `pane_id: "pending"` (never updated)
- `identity.json` is missing `worker_cli`, `provider`, `model`

The PANE_ID update Node.js script (Phase 4d, post-spawn) updates config.json and manifest.json but **does not update identity.json**.

**Impact:** Any code or debugging that reads `identity.json` to determine the worker's provider/model will get incomplete data.

**Recommendation:** After the pane_id update script, also update identity.json. Or have write-worker-identity accept and persist the extended fields.

---

### MEDIUM-3: Phase 4a config.json/manifest.json templates are incomplete vs what omc team actually writes

**File:** `skills/pi-team/SKILL.md:156-228`

The config.json template in Phase 4a omits several fields that omc team V2 writes:
- `tmux_window_owned`
- `resolved_routing`
- `resize_hook_name`
- `resize_hook_target`
- `hud_pane_id`

The manifest.json template omits:
- `resize_hook_name`
- `resize_hook_target`

**Impact:** When Phase 3 (native launch) is skipped and Phase 4a creates fresh state files, these fields will be missing. This could cause issues if the omc runtime expects them. Currently it works because the runtime uses defensive defaults, but future omc versions may require these fields.

**Recommendation:** Add the missing fields with sensible defaults (e.g., `resize_hook_name: null`, `hud_pane_id: null`).

---

### MEDIUM-4: approvals/ directory missing from Phase 4a mkdir

**File:** `skills/pi-team/SKILL.md:149`

```bash
mkdir -p .omc/state/team/${TEAM_NAME}/{tasks,workers,mailbox,dispatch,approvals}
```

The `approvals` subdirectory is specified in the mkdir but is not actually created by omc team's native launch (confirmed: the current team state has no `approvals/` directory). This is harmless but the mkdir includes a directory the omc runtime doesn't use.

Conversely, if `approvals` is needed, the native omc team launch doesn't create it, suggesting inconsistency.

**Impact:** Minimal — directory creation is idempotent and harmless.

---

### LOW-1: No test infrastructure

**File:** `AGENTS.md:29-33`

AGENTS.md references testing:
```
## Testing
Run integration tests against `omc team api` operations:
```

But there are no test files, no `package.json`, and no test runner in the repository. This is aspirational documentation.

**Recommendation:** Either add integration tests (even a shell script that exercises `omc team api` operations) or remove the Testing section from AGENTS.md to avoid confusion.

---

### LOW-2: pi-setup SKILL.md lacks explicit code for writing pi-workers.json

**File:** `skills/pi-setup/SKILL.md:91-103`

The skill shows the JSON format but doesn't provide a code block for writing to `~/.claude/pi-workers.json`. It provides code for updating `~/.pi/agent/settings.json` (with `mkdirSync`), but the pi-workers.json write is left as an exercise for Claude to figure out.

This also means there's no `mkdirSync` for `~/.claude/` — if the directory doesn't exist, the write will fail.

**Recommendation:** Add a Node.js code block (similar to the settings.json update) that:
1. Creates `~/.claude/` if it doesn't exist
2. Reads existing pi-workers.json or creates new
3. Merges the new worker entry
4. Writes back atomically

---

### LOW-3: Bootstrap template uses hardcoded `leader-fixed` as message target

**File:** `config/worker-bootstrap-prompt.md:72`

```bash
omc team api send-message --input '{"team_name":"{{TEAM_NAME}}","from_worker":"{{WORKER_NAME}}","to_worker":"leader-fixed",...}'
```

The leader worker ID `leader-fixed` is hardcoded. This works because the plugin always creates a leader with that ID, but it should arguably be a template variable `{{LEADER_ID}}` for future-proofing.

**Impact:** Low — consistent with how the plugin works today.

---

### LOW-4: Worker index collision with native workers

**File:** `skills/pi-team/SKILL.md:277`

```bash
WORKER_NAME="pi-${NAME}-${INDEX}"
```

The `INDEX` variable is not shown being set per-worker. If multiple pi workers of the same type are spawned, the index must increment. Additionally, the manifest.json shows `pi-zai-1` has `index: 1`, same as `worker-1` (also `index: 1`). While `index` is just metadata and `name` is the unique key, this could confuse debugging.

**Impact:** Low — name is the unique identifier, but index collisions are untidy.

---

### INFO-1: No .gitattributes or LICENSE reference inconsistency

The project has a `LICENSE` file but the .gitignore excludes `.claude/` and `.omc/` directories, which is correct. The `.claude-plugin/plugin.json` references skills and commands with relative paths that all resolve correctly.

### INFO-2: Bootstrap template completeness

The bootstrap template (`config/worker-bootstrap-prompt.md`) is **complete and well-designed**:
- ✅ All 5 template variables (TEAM_NAME, WORKER_NAME, TASK_ID, CWD, STATE_ROOT) are used
- ✅ All template variables are substituted in Phase 4d
- ✅ Full lifecycle protocol (claim → work → heartbeat → complete/fail)
- ✅ Communication methods (inbox, send-message, mailbox, mark-delivered)
- ✅ Git commit requirement before completion
- ✅ Important rules section

### INFO-3: manifest.json validation confirmed working

Tested that `omc team api claim-task` successfully validates pi-zai-1 against manifest.json. The claim succeeded with no `worker_not_found` errors. The Phase 4c (register before spawn) design is working correctly.

---

## Files Reviewed

| File | Lines | Status |
|------|-------|--------|
| `README.md` | 151 | ✅ Accurate, well-documented |
| `AGENTS.md` | 40 | ⚠️ Testing section has no backing tests |
| `.claude-plugin/plugin.json` | 31 | ✅ Correct paths and metadata |
| `.claude-plugin/marketplace.json` | 31 | ✅ Correct |
| `skills/pi-team/SKILL.md` | 549 | ⚠️ See MEDIUM-1 through MEDIUM-4 |
| `skills/pi-setup/SKILL.md` | 199 | ⚠️ See LOW-2 |
| `config/worker-bootstrap-prompt.md` | 90 | ✅ Complete |
| `commands/pi-team.md` | 14 | ✅ Correct dispatch shim |
| `commands/pi-setup.md` | 8 | ✅ Correct dispatch shim |
| `.gitignore` | 15 | ✅ Appropriate exclusions |

---

## Verification

- ✅ `omc team api claim-task` — succeeded for pi-zai-1
- ✅ `omc team api update-worker-heartbeat` — succeeded (3 heartbeats sent)
- ✅ `omc team api list-tasks` — returns all 3 tasks correctly
- ✅ `omc team api get-summary` — pi-zai-1 shows `alive: true`
- ✅ `omc team api mailbox-list` — callable for pi-zai-1
- ✅ manifest.json contains pi-zai-1 entry — claim validation works
- ✅ config.json contains pi-zai-1 entry — consistent with manifest
- ⚠️ identity.json has stale `pane_id: "pending"` — not updated post-spawn
