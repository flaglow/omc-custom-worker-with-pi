---
description: "Launch omc team with mixed pi custom workers and native workers"
argument-hint: "<N:worker-type[,N:worker-type,...]> \"<task description>\""
---

# Pi Team

This compatibility command keeps `/omc-custom-worker-with-pi:pi-team` available.

## Dispatch

1. Read the full bundled skill instructions from the active plugin: `skills/pi-team/SKILL.md`.
2. Follow that SKILL.md exactly, treating the user's arguments as:

```text
$ARGUMENTS
```

If the file is not directly readable from the current working directory, locate it under the active `CLAUDE_PLUGIN_ROOT`/`OMC_PLUGIN_ROOT`, package root, or installed plugin directory, then continue.
