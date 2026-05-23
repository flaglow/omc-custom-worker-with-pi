# Architecture Review: omc-custom-worker-with-pi Plugin

**Reviewer:** pi-zai-1  
**Date:** 2026-05-23  
**Scope:** config/worker-bootstrap-prompt.md, skills/pi-team/SKILL.md Phases 3–5, omc team API call correctness, worker registration & task lifecycle

## Summary

The plugin is well-architected with clear separation of concerns, correct registration-before-spawn ordering, and robust error handling in the dead-worker respawn path. After several rounds of prior fixes (commits 2fafd50, 7ee8cd8, e5384fb), the critical and high-severity issues have been resolved. This review identifies **0 critical**, **3 medium**, and **8 low** findings.

---

## Findings

### MEDIUM-1: Phase 4a heredocs produce invalid JSON if not manually substituted

**File:** `skills/pi-team/SKILL.md`, lines 154–186  
**Severity:** Medium  
**Category:** Correctness

The config.json and manifest.json heredocs use `<< 'CFGEOF'` and `<< 'MANEOF'` (single-quoted delimiters, no shell expansion). The content contains placeholder tokens like `"<TEAM_NAME>"`, `"<main task>"`, `"<ISO>"`, `<total>` that are not valid JSON values. For example:

```json
  "name": "<TEAM_NAME>",     // line 156 — literal string if not substituted
  "worker_count": <total>,   // line 171 — invalid JSON (bare token, no quotes)
```

Since `CFGEOF` is single-quoted, bash will NOT expand `$TEAM_NAME` either. These are instructional placeholders meant for Claude to replace when executing. However:

1. **Inconsistency with Phase 4c**: Phase 4c (lines 307–343) uses Node.js with `process.env` for proper variable substitution — a much more robust pattern.
2. **Cascading failure**: If Phase 4a writes literal `<TEAM_NAME>` into JSON, Phase 4c's `JSON.parse(fs.readFileSync(...))` will either succeed with wrong data or fail if `<total>` makes the JSON syntactically invalid.

**Recommendation:** Rewrite Phase 4a to use Node.js (like Phase 4c) or use unquoted heredocs with `$VARIABLE` references and careful escaping of literal `$` in JSON values.

---

### MEDIUM-2: Phase 5 heartbeat JSON contains non-executable `<increment>` placeholder

**File:** `skills/pi-team/SKILL.md`, lines 449–455  
**Severity:** Medium  
**Category:** Correctness

The heartbeat update command contains:
```bash
omc team api update-worker-heartbeat --input '{
  "team_name": "'"$TEAM_NAME"'",
  "worker": "'"$WORKER_NAME"'",
  "pid": '"$PID"',
  "turn_count": <increment>,
  "alive": true
}' --json
```

`<increment>` is not valid JSON and not a shell variable. If Claude executes this verbatim, the `--input` JSON will be malformed, causing the API call to fail. The monitor loop will silently lose heartbeat tracking.

**Recommendation:** Replace `<increment>` with `$TURN_COUNT` (a shell variable that the monitoring loop increments), e.g., `"turn_count": '"$TURN_COUNT"'`.

---

### MEDIUM-3: Bootstrap prompt omits project-level instructions

**File:** `config/worker-bootstrap-prompt.md`, entire file  
**Severity:** Medium  
**Category:** Completeness

The bootstrap prompt instructs workers on the omc team API lifecycle but does not tell them to:
1. Read the project's `AGENTS.md` for project-specific conventions
2. Read `README.md` for project context
3. Survey the codebase before starting work

Workers launched into unfamiliar codebases may produce work that violates project conventions (e.g., wrong file structure, incorrect import patterns). The current prompt goes straight from "claim task" to "do the work" without any orientation step.

**Recommendation:** Add a step between Step 1 (claim) and Step 2 (work) that instructs workers to read `AGENTS.md` and familiarize themselves with the project structure before beginning their task.

---

### LOW-1: Phase 5 `PANE_PID` variable is misleadingly named

**File:** `skills/pi-team/SKILL.md`, lines 442–444  
**Severity:** Low  
**Category:** Code clarity

```bash
tmux display-message -t "$PANE_ID" -p '#{pane_pid}' 2>/dev/null
PANE_PID=$?
```

`PANE_PID` captures the exit code of `tmux display-message` (0 = pane exists, non-zero = pane gone), NOT the actual pane PID. The variable name suggests it holds a process ID. The subsequent `if [ "$PANE_PID" -eq 0 ]` check is functionally correct but confusing.

**Recommendation:** Rename to `PANE_EXISTS=$?` or `PANE_CHECK=$?`.

---

### LOW-2: Phase 3 `grep -oP` uses Perl regex (macOS incompatibility)

**File:** `skills/pi-team/SKILL.md`, line 116  
**Severity:** Low  
**Category:** Portability

```bash
TEAM_NAME=$(printf "%s" "$NATIVE_OUTPUT" | grep -oP 'Team started: *\K.*')
```

The `-P` (Perl regex) flag is not available on macOS's BSD grep. This would fail on macOS systems.

**Recommendation:** Use `sed` or `awk` instead, e.g.:
```bash
TEAM_NAME=$(printf "%s" "$NATIVE_OUTPUT" | sed -n 's/.*Team started: *//p')
```

---

### LOW-3: Phase 5 uses deprecated `expr` for arithmetic

**File:** `skills/pi-team/SKILL.md`, line 467  
**Severity:** Low  
**Category:** Modernization

```bash
RESTART_COUNT=$(expr ${RESTART_COUNT:-0} + 1)
```

`expr` is a legacy external command. Modern bash uses arithmetic expansion.

**Recommendation:** Use `RESTART_COUNT=$(( (${RESTART_COUNT:-0}) + 1 ))`.

---

### LOW-4: Phase 4d `tmux send-keys ""` sends empty message

**File:** `skills/pi-team/SKILL.md`, line 427  
**Severity:** Low  
**Category:** Behavioral

```bash
tmux send-keys -t "$PANE_ID" "" Enter
```

This sends an empty string + Enter to the pi REPL. Depending on how pi handles empty input, this could be interpreted as a blank user message rather than a "start" signal. Most REPLs handle this gracefully, but it's an unnecessary no-op — pi starts in interactive mode and will be ready for the actual task assignment (which arrives via inbox).

**Recommendation:** Either remove this line or document why it's needed (e.g., "trigger pi to display its prompt").

---

### LOW-5: Bootstrap template substitution has theoretical double-expansion risk

**File:** `skills/pi-team/SKILL.md`, lines 358–363  
**Severity:** Low  
**Category:** Security (defense-in-depth)

```javascript
for (const key of ["TEAM_NAME", "WORKER_NAME", "TASK_ID", "CWD", "STATE_ROOT"]) {
  text = text.split(`{{${key}}}`).join(process.env[key] || "");
}
```

If a variable value (e.g., `TEAM_NAME`) contained `{{TASK_ID}}`, it would be substituted on the next iteration. In practice this is mitigated because `TEAM_NAME` is generated from `sed 's/[^a-z0-9]/-/g'` (alphanumeric + hyphens only) and `TASK_ID` is validated against `^[a-zA-Z0-9_-]+$`. The remaining variables (`CWD`, `STATE_ROOT`) could theoretically contain `{{` but this is extremely unlikely in practice.

**Recommendation:** No action required. The input validation is sufficient. For defense-in-depth, iterate in a single pass or use a regex replacer with a callback.

---

### LOW-6: Phase 4a path uses `${TEAM_NAME}` but no sanitization before mkdir

**File:** `skills/pi-team/SKILL.md`, line 149  
**Severity:** Low  
**Category:** Security (defense-in-depth)

```bash
mkdir -p .omc/state/team/${TEAM_NAME}/{tasks,workers,mailbox,dispatch,approvals}
```

For the pi-only path (no Phase 3), `TEAM_NAME` is generated in Phase 1 via sanitization (`sed 's/[^a-z0-9]/-/g'`), so it's safe. However, for the mixed-team path, `TEAM_NAME` comes from Phase 3's `grep -oP` extraction from `omc team` output. Phase 3 does validate it with `[[ "$TEAM_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]` (line 120), so path traversal is prevented.

**Recommendation:** No action required. Both code paths validate the team name.

---

### LOW-7: Phase 4c `write-worker-identity` called before manifest.json exists in pi-only path

**File:** `skills/pi-team/SKILL.md`, lines 295–305  
**Severity:** Low  
**Category:** Ordering

In the pi-only path (no Phase 3), the sequence is: Phase 4a (create dirs + write config/manifest) → Phase 4c (register worker). The `write-worker-identity` API call happens before the Node.js direct file writes in the same Phase 4c block. If `write-worker-identity` internally reads manifest.json, it should find it (Phase 4a created it). This ordering is correct. However, if Phase 4a writes invalid JSON (see MEDIUM-1), `write-worker-identity` could fail or behave unexpectedly.

**Recommendation:** Address MEDIUM-1 first; this becomes moot.

---

### LOW-8: No timeout on Phase 5 monitor loop

**File:** `skills/pi-team/SKILL.md`, lines 436–505  
**Severity:** Low  
**Category:** Robustness

The Phase 5 monitoring loop polls every 30 seconds but has no maximum duration or overall timeout. If a pi worker hangs (alive but stuck), the loop runs forever. The dead-pane detection handles crashes, but not zombie workers that are alive but non-responsive.

**Recommendation:** Add a configurable timeout (e.g., 30 minutes) after which the leader checks `last_heartbeat` timestamps and marks stale workers as failed.

---

## What's Working Well

1. **Registration-before-spawn (Phase 4c → 4d)**: Correct ordering prevents `worker_not_found` race condition. Clearly documented in AGENTS.md and code comments.

2. **Dual registration**: Both `write-worker-identity` API and direct config/manifest.json writes ensure consistency across validation paths.

3. **Dead worker respawn with claim-token**: The Phase 5 respawn path correctly calls `claim-task` to obtain a `claim_token` before marking a task as `failed` — a prior bug that's now fixed.

4. **Exponential backoff on respawn**: `sleep $((2 ** RESTART_COUNT))` with a 3-attempt cap is appropriate.

5. **Input validation**: Team names, worker names, and task IDs are all validated against safe character patterns before use in paths or API calls.

6. **Quoting discipline**: `printf '%q'` is used for all dynamic arguments passed to `pi` CLI, preventing shell injection. Heredocs for Node.js code use single-quoted delimiters (`<<'NODE'`), preventing premature shell expansion.

7. **Prerequisite gating**: pi CLI checks are skipped for all-native teams, avoiding false errors.

8. **Template variable substitution via Node.js**: Phase 4d uses a clean, safe pattern with `process.env` rather than nested shell expansion.

---

## API Call Correctness Summary

| API Call | Phase | Status | Notes |
|---|---|---|---|
| `create-task` | 4b | ✅ Correct | Uses `node -e` for safe JSON construction |
| `write-worker-identity` | 4c | ✅ Correct | Runs before spawn; placeholder pane_id |
| `claim-task` | 4d (worker) | ✅ Correct | Worker claims before starting work |
| `transition-task-status` (completed) | Worker bootstrap | ✅ Correct | Includes claim_token |
| `transition-task-status` (failed) | Worker bootstrap | ✅ Correct | Includes claim_token |
| `update-worker-heartbeat` | 5 (leader) | ⚠️ Medium-2 | `<increment>` placeholder not executable |
| `read-task` | 5 (leader) | ✅ Correct | Robust JSON parsing with reverse-line search |
| `list-tasks` | 5 (leader) | ✅ Correct | — |
| `get-summary` | 5 (leader) | ✅ Correct | — |
| `write-worker-inbox` | 4e | ✅ Correct | Uses node for safe JSON |
| `send-message` | Worker bootstrap | ✅ Correct | — |
| `mailbox-list` | Worker bootstrap | ✅ Correct | — |
| `mailbox-mark-delivered` | Worker bootstrap | ✅ Correct | — |

---

## Worker Registration & Task Lifecycle Robustness

### Registration flow ✅
1. Phase 4a creates directory structure + initial config/manifest
2. Phase 4b creates tasks via API (gets task IDs)
3. Phase 4c registers worker via `write-worker-identity` + direct file writes
4. Phase 4d spawns worker pane (after registration is confirmed)

### Task lifecycle flow ✅
1. Worker claims task → gets `claim_token`
2. Worker does work → heartbeats every 2–3 minutes
3. Worker completes → `transition-task-status` with claim_token + result
4. Worker fails → `transition-task-status` with claim_token + error

### Resilience mechanisms ✅
- Dead pane detection via `tmux display-message` exit code
- Automatic respawn with exponential backoff (up to 3 attempts)
- Claim-token obtained before marking failed tasks
- Stale claim handling in error reference table

---

## Files Reviewed

| File | Lines | Focus |
|---|---|---|
| `config/worker-bootstrap-prompt.md` | 1–74 | Security, correctness, completeness |
| `skills/pi-team/SKILL.md` | 1–576 | Phases 3–5, API calls, registration |
| `skills/pi-setup/SKILL.md` | 1–170 | Worker config format, name validation |
| `AGENTS.md` | 1–50 | Design decisions, conventions |
| `.claude-plugin/plugin.json` | 1–23 | Plugin metadata |
| `.claude-plugin/marketplace.json` | 1–30 | Marketplace metadata |
| `commands/pi-setup.md` | 1–14 | Dispatch shim |
| `commands/pi-team.md` | 1–14 | Dispatch shim |
| `README.md` | 1–120 | Documentation accuracy |
