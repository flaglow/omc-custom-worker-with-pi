# Security & Quality Review: skills/pi-setup/SKILL.md

**Reviewer:** pi-zai-2  
**Date:** 2026-05-24  
**File:** `skills/pi-setup/SKILL.md`  
**Scope:** Security, correctness, error handling, validation, JSON I/O

---

## Summary

The pi-setup skill provides interactive worker configuration stored in `~/.claude/pi-workers.json`. It is a **skill file** (instructions for a Claude AI agent), not a standalone shell script — all code snippets are bash/node commands the agent executes on the user's behalf. This distinction matters: the primary attack surface is **indirect injection through user-supplied values** that the agent interpolates into shell commands.

Overall the skill is well-structured with good practices (using `process.argv` for safe argument passing, secrets redaction in settings display, `chmod 0o600` on sensitive files). However, there are several findings ranging from medium to informational.

---

## Findings

### [M1] MEDIUM — No shell-safe quoting for user-provided arguments

**Location:** Step 3, "Save and merge worker configuration" code block

```bash
' '<worker-name>' '<provider>' '<model>'
```

**Problem:** The placeholders use single quotes around user-supplied values. When the AI agent fills these in, a value containing a single quote (e.g., a provider or model name like `foo'bar`) would break out of quoting, potentially allowing shell injection or command failure.

The companion skill `skills/pi-team/SKILL.md` correctly uses `printf '%q'` for safe quoting in Phase 4d:
```bash
PROVIDER_ARG=$(printf '%q' "$PROVIDER")
MODEL_ARG=$(printf '%q' "$MODEL")
```

**Impact:** Shell injection if a provider/model name contains single quotes or shell metacharacters. In practice, provider and model names are typically safe (alphanumeric with hyphens/dots), but defense-in-depth demands safe quoting.

**Recommendation:** Use the same `printf '%q'` pattern from pi-team, or pass values via environment variables:
```bash
WORKER_NAME='<worker-name>' PROVIDER='<provider>' MODEL='<model>' node -e '
  const [workerName, provider, model] = 
    [process.env.WORKER_NAME, process.env.PROVIDER, process.env.MODEL];
  ...
'
```
Or use `process.argv` with `printf '%q'`-quoted arguments.

---

### [M2] MEDIUM — Silent overwrite of existing worker configurations

**Location:** Step 3, worker config write

```javascript
config.workers[workerName] = {
    provider,
    model,
    binary: "pi",
    createdAt: new Date().toISOString()
};
```

**Problem:** If a worker with the same name already exists, it is silently overwritten without warning. The error table mentions "Worker pi-zai already exists" as an error, but the actual code performs no duplicate check — it just sets the property.

**Impact:** Accidental data loss. A user who mistypes a provider name for an existing worker would destroy the existing configuration without realizing it.

**Recommendation:** Add an explicit check before overwriting:
```javascript
if (config.workers[workerName]) {
  console.error("ERROR: Worker " + workerName + " already exists. Remove it first or use a different name.");
  process.exit(1);
}
```

---

### [M3] MEDIUM — No file permissions on pi-workers.json

**Location:** Step 3, worker config write

```javascript
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
```

**Problem:** The settings.json write correctly calls `fs.chmodSync(settingsPath, 0o600)`, but pi-workers.json is written with default permissions (typically `0644` — world-readable). This file contains provider names and model identifiers that could leak information about the user's infrastructure.

**Impact:** Information exposure to other users on multi-user systems.

**Recommendation:** Add `fs.chmodSync(configPath, 0o600)` after writing pi-workers.json, consistent with the settings.json handling.

---

### [M4] MEDIUM — Non-atomic file writes risk corruption

**Location:** Step 3, both `writeFileSync` calls (pi-workers.json and settings.json)

**Problem:** Both files are written with `fs.writeFileSync` directly to the target path. If the process is interrupted (SIGKILL, power loss, disk full), the file may be truncated or contain partial JSON, destroying the previous configuration.

**Impact:** Configuration loss requiring manual reconstruction.

**Recommendation:** Use write-to-temp-then-rename pattern:
```javascript
const tmpPath = configPath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n");
fs.renameSync(tmpPath, configPath);
// rename is atomic on POSIX when src and dst are on same filesystem
```

---

### [L1] LOW — No JSON schema validation on existing config

**Location:** Step 3, worker config read

```javascript
let config = { version: 1, workers: {} };
if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, "utf8");
  if (raw.trim()) {
    config = JSON.parse(raw);
  }
}
if (!config.workers) config.workers = {};
```

**Problem:** If the existing file contains valid JSON but wrong structure (e.g., `[1,2,3]` or `"hello"`), the `config.workers` check handles the case where it's an object without `workers`, but does not handle the case where `config` is not an object at all. `config.workers` on an array or primitive would return `undefined`, and then `config.workers = {}` would either silently fail (on a primitive) or succeed on an array (adding a named property to an array, which is technically valid but weird).

**Impact:** Unexpected behavior when config file is corrupted with non-object JSON.

**Recommendation:** Add type guard:
```javascript
config = JSON.parse(raw);
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  console.error("ERROR: pi-workers.json has invalid structure. Expected object.");
  process.exit(1);
}
```

---

### [L2] LOW — No TOCTOU protection for concurrent writes

**Location:** Step 3, pi-workers.json read-then-write

**Problem:** There is a time-of-check-to-time-of-use window between reading the existing config and writing the updated config. If two agents or processes run pi-setup simultaneously, one write can be lost.

**Impact:** Low probability in practice (pi-setup is interactive, single-user), but possible in automated/team scenarios.

**Recommendation:** Use `O_EXCL` or advisory file locking (`lockfile` / `flock`) for production hardening. Low priority given the interactive nature of the skill.

---

### [L3] LOW — Worker name validation not enforced in code

**Location:** Step 3

**Problem:** The skill describes the regex `^pi-[a-z0-9][a-z0-9-]*$` and the validation rules in natural language, but provides **no actual code snippet** to enforce it. The agent is expected to validate mentally or in its own code. If the agent skips validation, invalid names could be persisted.

**Impact:** Invalid worker names in config could cause failures downstream in pi-team when used in file paths, tmux commands, or API calls.

**Recommendation:** Add an explicit validation snippet:
```bash
node -e '
const name = process.argv[2];
if (!/^pi-[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error("ERROR: Invalid worker name. Must match ^pi-[a-z0-9][a-z0-9-]*$");
  process.exit(1);
}
' '<worker-name>'
```

---

### [L4] LOW — Reserved name check not implemented

**Location:** Step 3

**Problem:** The skill states worker names must not conflict with reserved names (`claude`, `codex`, `gemini`), but no code enforces this.

**Impact:** A worker named `pi-claude` could cause confusion in worker-type resolution in pi-team (which classifies based on `pi-` prefix).

**Recommendation:** Add reserved name validation to the validation snippet from L3.

---

### [L5] LOW — No validation of provider/model against `pi --list-models` output

**Location:** Step 3

**Problem:** The skill shows `pi --list-models` and `pi --list-models <provider>` for display purposes, but never validates that the user's chosen provider and model actually exist in the output. A typo like `opennai` instead of `openai` would be persisted.

**Impact:** Invalid configuration that fails at runtime when the team actually spawns.

**Recommendation:** Validate user selections against the list output before writing to config:
```bash
# After listing providers
PROVIDER_LIST=$(pi --list-models 2>&1 | awk 'NR>1 {print $1}' | sort -u)
if ! echo "$PROVIDER_LIST" | grep -qx "$PROVIDER"; then
  echo "ERROR: Provider '$PROVIDER' not found in pi --list-models output"
  exit 1
fi
```

---

### [I1] INFO — Duplicated settings.json read code

**Location:** Step 2 and Step 3

**Problem:** The `node <<'NODE'` block that reads and redacts `settings.json` is **duplicated verbatim** in both the "List available providers" and "Update pi's own settings" sections (~40 lines each).

**Impact:** Maintenance burden. Bug fixes must be applied in two places.

**Recommendation:** Factor into a shared helper or reference a single canonical snippet.

---

### [I2] INFO — No backup of existing configuration before modification

**Location:** Step 3

**Problem:** When updating pi-workers.json, no backup of the previous version is created. Combined with M4 (non-atomic writes), this means a failure could leave no recoverable state.

**Recommendation:** Consider writing a backup copy before modification:
```javascript
if (fs.existsSync(configPath)) {
  fs.copyFileSync(configPath, configPath + '.bak');
}
```

---

### [I3] INFO — `pi --list-models` error handling is implicit

**Location:** Step 2

```bash
pi --list-models 2>&1 | awk 'NR>1 {print $1}' | sort -u | grep -v '^$'
```

**Problem:** If `pi --list-models` fails (e.g., API key not configured, network error), the error output goes through the `awk`/`sort`/`grep` pipeline silently. The user may see an empty list with no indication of failure.

**Impact:** Confusing UX — empty provider list could be interpreted as "no providers available" rather than "pi not configured."

**Recommendation:** Check exit code separately:
```bash
LIST_OUTPUT=$(pi --list-models 2>&1) || {
  echo "ERROR: pi --list-models failed. Ensure pi is configured with a valid API key.";
  exit 1;
}
echo "$LIST_OUTPUT" | awk 'NR>1 {print $1}' | sort -u | grep -v '^$'
```

---

### [I4] INFO — Missing trailing newline consistency

**Location:** Step 3, settings.json write

```javascript
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
// No trailing "\n"
```

vs. pi-workers.json write:
```javascript
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
// Has trailing "\n"
```

**Impact:** Minor inconsistency. Missing trailing newline in settings.json is not harmful but is untidy.

---

## Severity Summary

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| M1 | MEDIUM | Security | No shell-safe quoting for user-provided arguments |
| M2 | MEDIUM | Correctness | Silent overwrite of existing worker configs |
| M3 | MEDIUM | Security | No file permissions (0o600) on pi-workers.json |
| M4 | MEDIUM | Reliability | Non-atomic file writes risk corruption |
| L1 | LOW | Reliability | No JSON schema validation on existing config |
| L2 | LOW | Concurrency | No TOCTOU protection for concurrent writes |
| L3 | LOW | Validation | Worker name regex not enforced in code |
| L4 | LOW | Validation | Reserved name check not implemented |
| L5 | LOW | Validation | Provider/model not validated against list output |
| I1 | INFO | Maintainability | Duplicated settings.json read code |
| I2 | INFO | Reliability | No backup before modification |
| I3 | INFO | UX | `pi --list-models` failure handled silently |
| I4 | INFO | Style | Trailing newline inconsistency |

---

## Positive Observations

1. **`process.argv` usage**: All node snippets correctly use `process.argv` for value passing instead of string interpolation into the source code — this is the right pattern and prevents code injection into the node process.

2. **Secrets redaction**: The `isSecretKey()`/`redact()` functions properly mask API keys, tokens, and credentials when displaying settings. The normalization approach (strip non-alphanumeric, lowercase) catches common obfuscation patterns.

3. **ENOENT handling**: The settings reader gracefully handles missing files with `e.code === 'ENOENT'` and exits cleanly.

4. **Non-destructive defaults**: The settings update only sets `defaultProvider`/`defaultModel` when missing, preserving user preferences.

5. **`chmod 0o600`** on settings.json: Good security practice for files that may contain sensitive configuration.

6. **Directory creation**: `fs.mkdirSync(path.dirname(configPath), { recursive: true })` handles the case where `~/.claude/` doesn't exist yet.

---

## Comparison with pi-team/SKILL.md

The pi-team skill demonstrates more mature security patterns that should be backported to pi-setup:

| Pattern | pi-setup | pi-team |
|---------|----------|---------|
| Shell argument quoting | Single-quoted placeholders | `printf '%q'` |
| Team name validation | Not applicable | `case` statement validation |
| Task ID validation | Not applicable | Regex `^[a-zA-Z0-9_-]+$` |
| Atomic registration | Not applicable | Explicit ordering (4c before 4d) |
| Plugin root validation | Not present | `realpath` with fallback chain |

The pi-setup skill would benefit from adopting the `printf '%q'` pattern (M1) and similar validation rigor.
