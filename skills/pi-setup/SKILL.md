---
name: pi-setup
description: Setup pi CLI as a custom worker for omc teams. Configure providers, models, and register custom worker names.
when_to_use: Use when setting up pi workers, configuring providers, registering worker names, or when pi-workers.json is missing or needs updating.
argument-hint: ""
disable-model-invocation: true
allowed-tools:
  - Bash(pi *)
  - Bash(omc *)
  - Bash(node *)
  - Bash(command *)
  - Bash(npm *)
  - Bash(cat *)
  - Bash(mkdir *)
  - Bash(tmux *)
shell: bash
---

# Pi Worker Setup

Configure pi CLI as a custom worker type for oh-my-claudecode teams. Creates worker definitions stored in `~/.claude/pi-workers.json` that can be used with `/pi-team`.

**Supporting scripts are in `${CLAUDE_SKILL_DIR}/scripts/`.**

## Prerequisites Check

Before starting setup, verify:

1. **pi CLI installed:**
```bash
command -v pi >/dev/null 2>&1 && pi --version
```
If not installed:
```bash
npm install -g @earendil-works/pi-coding-agent
```
After installation, run `pi` once to complete login/API key setup interactively.

2. **omc installed:**
```bash
command -v omc >/dev/null 2>&1 && omc --version
```

3. **tmux installed:**
```bash
command -v tmux >/dev/null 2>&1
```

## Setup Flow

### Step 1: Check existing configuration

```bash
cat ~/.claude/pi-workers.json 2>/dev/null
```

If the file exists and has workers, show them:
```
Currently registered pi workers:
  - pi-zai (provider: zai, model: glm-5.1)
  - pi-openai (provider: openai, model: gpt-5)
```

### Step 2: List available providers

If `${user_config.default_provider}` is set (from plugin userConfig), use it as the suggested default.

```bash
pi --list-models 2>&1 | awk 'NR>1 {print $1}' | sort -u | grep -v '^$'
```

Check pi's current default configuration (secrets redacted):
```bash
node "${CLAUDE_SKILL_DIR}/scripts/read-pi-settings.js"
```

### Step 3: Create a custom worker (repeat loop)

Ask the user:

**"Which provider would you like to configure?"**
(Show the provider list from Step 2)

After the user selects a provider, show available models:
```bash
pi --list-models "<provider>" 2>&1
```

**"Select a default model for pi-<provider>:"**

After the user selects a model:

**"Worker name (default: pi-<provider>):"**

Validate the worker name (must match `^pi-[a-z0-9][a-z0-9-]*$`):
- Must start with `pi-` (e.g., `pi-myworker`)
- Suffix after `pi-` must be at least 1 character long
- Must use lowercase alphanumeric characters and hyphens only
- Must not conflict with reserved names (`claude`, `codex`, `gemini`)

Save the worker to `~/.claude/pi-workers.json`:
```bash
node "${CLAUDE_SKILL_DIR}/scripts/register-worker.js" '<worker-name>' '<provider>' '<model>'
```

Also update pi's own settings if this is the first worker or the user confirms:
```bash
# Read current settings (secrets redacted)
node "${CLAUDE_SKILL_DIR}/scripts/read-pi-settings.js"

# Update defaultProvider and defaultModel (only if missing)
node "${CLAUDE_SKILL_DIR}/scripts/update-pi-settings.js" '<provider>' '<model>'
```

### Step 4: Ask to create more workers

**"Would you like to create another pi worker? (yes/no)"**

If yes → go back to Step 3.
If no → proceed to Step 5.

### Step 5: Summary

Show all registered workers and usage instructions:

```
✓ Pi workers configured!

Registered workers:
  - pi-zai (zai / glm-5.1)
  - pi-openai (openai / gpt-5)

Usage:
  /omc-custom-worker-with-pi:pi-team 2:pi-zai "implement feature"
  /omc-custom-worker-with-pi:pi-team 2:pi-zai, 1:codex, 1:gemini "fix bugs"
  /omc-custom-worker-with-pi:pi-team 1:pi-zai/glm-4.5-air "quick task"

Configuration saved to: ~/.claude/pi-workers.json
```

## Configuration File Format

### `~/.claude/pi-workers.json`

```json
{
  "version": 1,
  "workers": {
    "<worker-name>": {
      "provider": "<provider-name>",
      "model": "<model-id>",
      "binary": "pi",
      "createdAt": "<ISO-timestamp>"
    }
  }
}
```

### Worker Name Resolution

When a user specifies a worker like `pi-zai` or `pi-zai/glm-5-turbo`:

1. Parse: `pi-<name>` or `pi-<name>/<model-override>`
2. Look up `pi-<name>` in `~/.claude/pi-workers.json`
3. If model-override provided (e.g., `/glm-5-turbo`), use that instead of the configured default
4. Construct: `pi --provider <provider> --model <model>`

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| `pi: command not found` | pi CLI not installed | `npm install -g @earendil-works/pi-coding-agent` |
| `node: command not found` | Node.js not available | Install Node.js |
| `~/.pi/agent/settings.json not found` | pi not initialized | Run `pi` once interactively |
| `~/.claude/ directory missing` | omc not initialized | Run `omc` once to initialize |
| `Unexpected token ... in JSON` | Invalid JSON in `pi-workers.json` | Fix or delete the corrupted file |
| `Worker name must start with pi-` | Invalid name format | Use names like `pi-zai`, `pi-openai` |
| `Worker pi-zai already exists` | Duplicate name | Use a different name or remove existing first |
| `Invalid pi-workers.json: missing version field` | Corrupted config file | Delete or fix `~/.claude/pi-workers.json` |
| `Invalid pi-workers.json: workers must be an object` | Corrupted config file | Delete or fix `~/.claude/pi-workers.json` |
| `Worker name suffix is reserved` | Reserved name used | Choose a name that does not use `claude`, `codex`, or `gemini` suffix |
| `Provider must be a non-empty string` | Empty provider | Provide a valid provider name |
| `Model must be a non-empty string` | Empty model | Provide a valid model name |
