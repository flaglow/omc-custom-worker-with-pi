---
name: pi-setup
description: Setup pi CLI as a custom worker for omc teams. Configure providers, models, and register custom worker names.
aliases: []
level: 2
argument-hint: ""
---

# Pi Worker Setup

Configure pi CLI as a custom worker type for oh-my-claudecode teams. This creates worker definitions stored in `~/.claude/pi-workers.json` that can be used with `/pi-team`.

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
If not installed, install oh-my-claudecode first via the marketplace.

3. **tmux installed:**
```bash
command -v tmux >/dev/null 2>&1
```

## Setup Flow

### Step 1: Check existing configuration

Read the current worker configuration if it exists:
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

Show what providers pi supports by listing models:
```bash
pi --list-models 2>&1 | awk 'NR>1 {print $1}' | sort -u | grep -v '^$'
```

Also check pi's current default configuration:
```bash
cat ~/.pi/agent/settings.json 2>/dev/null
```

### Step 3: Create a custom worker (repeat loop)

Ask the user:

**"Which provider would you like to configure?"**
(Show the provider list from Step 2)

After the user selects a provider, show available models:
```bash
pi --list-models <provider> 2>&1
```

**"Select a default model for pi-<provider>:"**
(Show the model list)

After the user selects a model:

**"Worker name (default: pi-<provider>):"**

Validate the worker name:
- Must start with `pi-`
- Must be lowercase alphanumeric + hyphens only
- Must not conflict with existing workers or reserved names (claude, codex, gemini, cursor)

Save the worker to `~/.claude/pi-workers.json`:

```json
{
  "version": 1,
  "workers": {
    "pi-zai": {
      "provider": "zai",
      "model": "glm-5.1",
      "binary": "pi",
      "createdAt": "2026-05-23T12:00:00Z"
    }
  }
}
```

Also update pi's own settings if this is the first worker or the user confirms:
```bash
# Read current settings
cat ~/.pi/agent/settings.json

# Update defaultProvider and defaultModel
# Use node/jq to merge:
node -e "
const fs = require('fs');
const path = require('path');
const settingsPath = path.join(process.env.HOME, '.pi/agent/settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
settings.defaultProvider = '<provider>';
settings.defaultModel = '<model>';
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
"
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
| `~/.pi/agent/settings.json not found` | pi not initialized | Run `pi` once interactively |
| `Worker name must start with pi-` | Invalid name format | Use names like `pi-zai`, `pi-openai` |
| `Worker pi-zai already exists` | Duplicate name | Use a different name or remove existing first |
| `Provider not found` | Invalid provider name | Use provider from `pi --list-models` output |
