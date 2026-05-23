---
name: pi-team
description: Launch omc team with mixed pi custom workers and native claude/codex/gemini workers. Pi workers use pi CLI with any provider.
aliases: []
level: 4
argument-hint: "<N:worker-type[,N:worker-type,...]> \"<task description>\""
---

# Pi Team — Mixed Worker Orchestrator

Launch an omc team with any combination of **pi custom workers** (zai, openai, etc.) and **omc-native workers** (claude, codex, gemini). You (Claude) serve as the orchestrator, handling pi workers directly while delegating native workers to omc team.

## Worker Type Resolution

| Pattern | Category | Handler |
|---|---|---|
| `N:pi-{name}` | pi-custom | You manage directly |
| `N:pi-{name}/{model}` | pi-custom (model override) | You manage directly |
| `N:claude` | omc-native | `omc team` manages |
| `N:codex` | omc-native | `omc team` manages |
| `N:gemini` | omc-native | `omc team` manages |

## Execution Phases

### Phase 0: Prerequisites

Check all prerequisites before starting:

```bash
# tmux
command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux not installed"; exit 1; }

# omc CLI
command -v omc >/dev/null 2>&1 || { echo "ERROR: omc not installed"; exit 1; }

# pi CLI (only if pi workers are requested — skip this check for all-native teams)
if echo "$WORKER_SPEC" | grep -q 'pi-'; then
  command -v pi >/dev/null 2>&1 || { echo "ERROR: pi not installed. Run /pi-setup first."; exit 1; }
fi

# tmux session
echo "TMUX=$TMUX"
tmux display-message -p '#S' 2>/dev/null || echo "Not in tmux"
```

Read worker configuration (only needed if pi workers are present):
```bash
if echo "$WORKER_SPEC" | grep -q 'pi-'; then
  cat ~/.claude/pi-workers.json || { echo "ERROR: pi-workers.json not found. Run /pi-setup first."; exit 1; }
fi
```

**Validate every pi worker referenced:**
- Parse each `N:pi-{name}` token
- Extract worker name (strip optional `/model` suffix)
- Look up `pi-{name}` in `~/.claude/pi-workers.json`
- If not found: ERROR with suggestion to run `/pi-setup`

### Phase 1: Parse and Classify Workers

**Input format:** `N:type[,N:type,...] "task description"`
**Regex:** `/(\d+):([a-zA-Z0-9_\/-]+)/g`

**Classify each token:**
- Starts with `pi-` → `piWorkers[]` array
- Otherwise → `nativeWorkers[]` array

**Example:**
```
Input: 2:pi-zai, 1:codex, 1:gemini, 1:pi-openai/gpt-5
Result:
  piWorkers: [
    { count: 2, name: "pi-zai", provider: "zai", model: "glm-5.1" },
    { count: 1, name: "pi-openai", provider: "openai", model: "gpt-5" }
  ]
  nativeWorkers: [
    { count: 1, type: "codex" },
    { count: 1, type: "gemini" }
  ]
  totalWorkers: 5
```

**Generate team name:**
```bash
CLEAN_TASK=$(printf "%s" "<task>" | head -c 20 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+$//' | sed 's/^\-//')
TEAM_NAME="pi-${CLEAN_TASK}-$(date +%s | tail -c 4)"
```

### Phase 2: Decompose Task

Split the main task into `totalWorkers` independent subtasks. Each subtask should be:
- Scoped to specific files or concerns (avoid write conflicts)
- Self-contained (enough context to work independently)
- Assigned to a specific worker

**Decomposition guidelines:**
- Codex workers → code review, security analysis
- Gemini workers → documentation, UI design, large context tasks
- Pi workers → general implementation, any provider-specific strengths
- Distribute work evenly across workers
- If task is simple, give all workers the same task description

### Phase 3: Launch omc-native Workers

If `nativeWorkers` is non-empty:

```bash
# Build the native worker spec for omc team
# e.g., for 1:codex, 1:gemini -> NATIVE_SPEC="1:codex,1:gemini"
NATIVE_SPEC="<N:type[,N:type,...]>"
NATIVE_TASKS="[codex] <codex-subtask>; [gemini] <gemini-subtask>"

NATIVE_OUTPUT=$(omc team "$NATIVE_SPEC" "$NATIVE_TASKS" 2>&1)
# omc team outputs plain text like: "Team started: <name>\ntmux session: ...\nworkers: ..."
TEAM_NAME=$(printf "%s" "$NATIVE_OUTPUT" | grep -oP 'Team started: *\K.*')
[ -n "$TEAM_NAME" ] || { echo "ERROR: unable to resolve omc team name from output:\n$NATIVE_OUTPUT"; exit 1; }
```

Use `--no-decompose` only when every native worker should receive the same task text.

Wait for omc team to confirm startup:
```bash
omc team status "$TEAM_NAME"
```

Record the team name and session info.

If `nativeWorkers` is empty AND `piWorkers` is non-empty:
- Create minimal team infrastructure manually (Phase 4 handles this)

### Phase 4: Launch Pi Workers

For each pi worker, do the following:

#### 4a: Prepare team infrastructure (if not already done by Phase 3)

If omc team was NOT launched in Phase 3:
```bash
# Create state directories
mkdir -p .omc/state/team/${TEAM_NAME}/{tasks,workers,mailbox,dispatch,approvals}
```

Write **both** config.json and manifest.json. The manifest.json is required for `omc team api claim-task` to recognize workers — omitting it causes `worker_not_found` errors.

```bash
# Write config.json
cat > .omc/state/team/${TEAM_NAME}/config.json << 'CFGEOF'
{
  "name": "<TEAM_NAME>",
  "task": "<main task>",
  "agent_type": "pi-custom",
  "policy": {
    "display_mode": "split_pane",
    "worker_launch_mode": "interactive",
    "dispatch_mode": "hook_preferred_with_fallback",
    "dispatch_ack_timeout_ms": 15000
  },
  "governance": {
    "delegation_only": false,
    "plan_approval_required": false,
    "nested_teams_allowed": false,
    "one_team_per_leader_session": true,
    "cleanup_requires_all_workers_inactive": true
  },
  "worker_launch_mode": "interactive",
  "worker_count": <total>,
  "max_workers": 20,
  "workers": [],
  "next_task_id": 1,
  "created_at": "<ISO>",
  "tmux_session": "<session>",
  "leader_pane_id": "<current pane>",
  "leader_cwd": "<cwd>",
  "team_state_root": "<cwd>/.omc/state/team/<TEAM_NAME>",
  "workspace_mode": "single",
  "worktree_mode": "disabled"
}
CFGEOF

# Write manifest.json (REQUIRED for claim-task worker validation)
cat > .omc/state/team/${TEAM_NAME}/manifest.json << 'MANEOF'
{
  "schema_version": 2,
  "name": "<TEAM_NAME>",
  "task": "<main task>",
  "leader": {
    "session_id": "<tmux_session>:0",
    "worker_id": "leader-fixed",
    "role": "leader"
  },
  "policy": {
    "display_mode": "split_pane",
    "worker_launch_mode": "interactive",
    "dispatch_mode": "hook_preferred_with_fallback",
    "dispatch_ack_timeout_ms": 15000
  },
  "governance": {
    "delegation_only": false,
    "plan_approval_required": false,
    "nested_teams_allowed": false,
    "one_team_per_leader_session": true,
    "cleanup_requires_all_workers_inactive": true
  },
  "permissions_snapshot": {
    "approval_mode": "default",
    "sandbox_mode": "default",
    "network_access": false
  },
  "tmux_session": "<tmux_session>",
  "worker_count": 0,
  "workers": [],
  "next_task_id": 1,
  "created_at": "<ISO>",
  "leader_cwd": "<cwd>",
  "team_state_root": "<cwd>/.omc/state/team/<TEAM_NAME>",
  "workspace_mode": "single",
  "worktree_mode": "disabled",
  "leader_pane_id": "<current pane>",
  "hud_pane_id": null
}
MANEOF
```

#### 4b: Create tasks

For each pi worker's subtask:
```bash
CREATE_TASK_INPUT=$(node -e '
const [teamName, subject, description] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  team_name: teamName,
  subject,
  description,
  blocked_by: []
}));
' "$TEAM_NAME" "Task ${i}" "$SUBTASK_DESCRIPTION")

CREATE_TASK_JSON=$(omc team api create-task --input "$CREATE_TASK_INPUT" --json)
TASK_ID=$(printf "%s" "$CREATE_TASK_JSON" | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
const line = lines.find((value) => value.trim().startsWith("{"));
const data = JSON.parse(line);
process.stdout.write(String(data.data?.task?.id || ""));
')
[ -n "$TASK_ID" ] || { echo "ERROR: unable to resolve created task id"; exit 1; }
```

Do not write `tasks/task-*.json` directly. `omc team api create-task` creates the required task schema, including `version: 1` and `depends_on: []`.

#### Phase 4c: Registration

For each pi worker instance:

**IMPORTANT: Registration (Phase 4c) MUST happen before spawning (Phase 4d).** If the worker spawns before it's registered in manifest.json, a fast-starting pi worker can hit `worker_not_found` when it tries to claim its task.

#### 4c: Register worker with omc team (BEFORE spawning)

```bash
# Determine split target (last worker pane or leader pane)
SPLIT_TARGET="<last-pane-or-leader>"

# Read worker config
# From ~/.claude/pi-workers.json: provider, model
PROVIDER="<provider>"
MODEL="<model>"  # Use override if pi-name/model was specified
WORKER_NAME="pi-${NAME}-${INDEX}"
TEAM_STATE_ROOT="$(pwd)/.omc/state/team/${TEAM_NAME}"

# Register worker identity and update config + manifest BEFORE spawning the pane.
# NOTE: write-worker-identity only persists core identity (name, index, role, assigned_tasks).
# Extended metadata (pane_id, provider, model) is handled by the direct manifest/config writes below.
# Use placeholder pane_id; will be updated after spawn if needed.
WORKER_IDENTITY_INPUT=$(node -e '
const [teamName, worker, index, taskId, workingDir, teamStateRoot, provider, model] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  team_name: teamName,
  worker,
  index: Number(index),
  role: "executor",
  assigned_tasks: [taskId],
  pane_id: "pending",  // Placeholder, updated after spawn
  working_dir: workingDir,
  team_state_root: teamStateRoot,
  worker_cli: "pi",
  provider,
  model
}));
' "$TEAM_NAME" "$WORKER_NAME" "$INDEX" "$TASK_ID" "$(pwd)" "$TEAM_STATE_ROOT" "$PROVIDER" "$MODEL")

omc team api write-worker-identity --input "$WORKER_IDENTITY_INPUT" --json

TEAM_STATE_ROOT="$TEAM_STATE_ROOT" WORKER_NAME="$WORKER_NAME" WORKER_INDEX="$INDEX" TASK_ID="$TASK_ID" \
PANE_ID="pending" PROVIDER="$PROVIDER" MODEL="$MODEL" CWD="$(pwd)" node <<'NODE'
const fs = require("fs");
const path = require("path");

const worker = {
  name: process.env.WORKER_NAME,
  index: Number(process.env.WORKER_INDEX),
  role: "executor",
  assigned_tasks: [process.env.TASK_ID],
  pane_id: process.env.PANE_ID,
  working_dir: process.env.CWD,
  team_state_root: process.env.TEAM_STATE_ROOT,
  worker_cli: "pi",
  provider: process.env.PROVIDER,
  model: process.env.MODEL
};

// Update config.json
const configPath = path.join(process.env.TEAM_STATE_ROOT, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.workers = Array.isArray(config.workers) ? config.workers.filter((entry) => entry?.name !== worker.name) : [];
config.workers.push(worker);
config.worker_count = Math.max(Number(config.worker_count || 0), config.workers.length);
config.max_workers = Math.max(Number(config.max_workers || 20), config.worker_count);
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

// CRITICAL: Also update manifest.json — claim-task validates workers against manifest
const manifestPath = path.join(process.env.TEAM_STATE_ROOT, "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.workers = Array.isArray(manifest.workers) ? manifest.workers.filter((entry) => entry?.name !== worker.name) : [];
  manifest.workers.push(worker);
  manifest.worker_count = manifest.workers.length;
  manifest.next_task_id = Math.max(Number(manifest.next_task_id || 0), Number(process.env.TASK_ID || 0) + 1);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
NODE
```

#### 4d: Spawn pi worker pane (AFTER registration)

```bash
# Read and render bootstrap template
# Resolve plugin root: prefer env vars, then git root, then cwd
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${OMC_PLUGIN_ROOT:-$PROJECT_ROOT}}"
BOOTSTRAP_TEMPLATE="${PLUGIN_ROOT}/config/worker-bootstrap-prompt.md"
[ -f "$BOOTSTRAP_TEMPLATE" ] || { echo "ERROR: worker bootstrap template not found at $BOOTSTRAP_TEMPLATE"; exit 1; }

BOOTSTRAP=$(TEAM_NAME="$TEAM_NAME" WORKER_NAME="$WORKER_NAME" TASK_ID="$TASK_ID" CWD="$(pwd)" STATE_ROOT="$TEAM_STATE_ROOT" \
  node - "$BOOTSTRAP_TEMPLATE" <<'NODE'
const fs = require("fs");
const templatePath = process.argv[2];
let text = fs.readFileSync(templatePath, "utf8");
for (const key of ["TEAM_NAME", "WORKER_NAME", "TASK_ID", "CWD", "STATE_ROOT"]) {
  text = text.split(`{{${key}}}`).join(process.env[key] || "");
}
process.stdout.write(text);
NODE
)

# Build task instruction with lifecycle commands
TASK_INSTRUCTION="## Task Assignment
Task ID: ${TASK_ID}
Worker: ${WORKER_NAME}

### REQUIRED: Task Lifecycle
1. Claim: omc team api claim-task --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"worker\":\"${WORKER_NAME}\"}' --json
2. Do the work described below.
3. Complete: omc team api transition-task-status --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"from\":\"in_progress\",\"to\":\"completed\",\"claim_token\":\"<claim_token>\",\"result\":\"Summary: <what changed>\"}' --json
4. On failure: omc team api transition-task-status --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"from\":\"in_progress\",\"to\":\"failed\",\"claim_token\":\"<claim_token>\"}' --json

### Task
${SUBTASK_DESCRIPTION}"

# Spawn in tmux. Quote every dynamic pi argument before it enters the shell command string.
PROVIDER_ARG=$(printf '%q' "$PROVIDER")
MODEL_ARG=$(printf '%q' "$MODEL")
BOOTSTRAP_ARG=$(printf '%q' "$BOOTSTRAP")
TASK_ARG=$(printf '%q' "$TASK_INSTRUCTION")
PI_COMMAND="pi --provider ${PROVIDER_ARG} --model ${MODEL_ARG} --append-system-prompt ${BOOTSTRAP_ARG} ${TASK_ARG}"
PANE_ID=$(tmux split-window -v -d -P -F '#{pane_id}' -c "$(pwd)" "$PI_COMMAND")

# Update pane_id in config + manifest now that we have the real pane ID
TEAM_STATE_ROOT="$TEAM_STATE_ROOT" WORKER_NAME="$WORKER_NAME" PANE_ID="$PANE_ID" node <<'PANEUPDATE'
const fs = require("fs");
const path = require("path");
const root = process.env.TEAM_STATE_ROOT;
const name = process.env.WORKER_NAME;
const paneId = process.env.PANE_ID;
for (const file of ["config.json", "manifest.json"]) {
  const fp = path.join(root, file);
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    const w = (data.workers || []).find(e => e.name === name);
    if (w) { w.pane_id = paneId; fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n"); }
  } catch {}
}
PANEUPDATE
```

Record the pane ID.

#### 4e: Send initial task dispatch

Write the task instruction to the worker's inbox:
```bash
WORKER_INBOX_INPUT=$(node -e '
const [teamName, worker, content] = process.argv.slice(1);
process.stdout.write(JSON.stringify({ team_name: teamName, worker, content }));
' "$TEAM_NAME" "$WORKER_NAME" "$TASK_INSTRUCTION")

omc team api write-worker-inbox --input "$WORKER_INBOX_INPUT" --json
```

Also send an initial message to the pi pane to trigger it to start:
```bash
tmux send-keys -t "$PANE_ID" "" Enter
```

### Phase 5: Monitor Loop

You MUST actively monitor the team until all tasks reach a terminal state (completed or failed).

**Poll every 30 seconds:**

```bash
# Check overall team status
omc team status "$TEAM_NAME"

# Check all tasks
omc team api list-tasks --input '{"team_name":"'"$TEAM_NAME"'"}' --json
```

**For each pi worker, update heartbeat:**
```bash
# Check if pane is still alive
tmux display-message -t "$PANE_ID" -p '#{pane_pid}' 2>/dev/null
PANE_PID=$?

if [ "$PANE_PID" -eq 0 ]; then
  # Pane alive — update heartbeat
  PID=$(tmux display-message -t "$PANE_ID" -p '#{pane_pid}')
  omc team api update-worker-heartbeat --input '{
    "team_name": "'"$TEAM_NAME"'",
    "worker": "'"$WORKER_NAME"'",
    "pid": '"$PID"',
    "turn_count": <increment>,
    "alive": true
  }' --json
else
  # Pane dead — check if task completed
  # If task still in_progress, respawn the worker
  TASK_STATUS=$(omc team api read-task --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'"}' --json | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
const line = lines.find((value) => value.trim().startsWith("{"));
const data = JSON.parse(line);
process.stdout.write(data.data?.task?.status || "unknown");
')

  if [ "$TASK_STATUS" = "in_progress" ]; then
    RESTART_COUNT=$(expr ${RESTART_COUNT:-0} + 1)
    if [ "$RESTART_COUNT" -gt 3 ]; then
      echo "ERROR: pi worker dead after 3 respawn attempts — fundamental failure"
      # Failure transition requires a claim_token from claim-task.
      CLAIM_TOKEN=$(omc team api claim-task --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'","worker":"'"$WORKER_NAME"'"}' --json | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
const line = lines.find((value) => value.trim().startsWith("{"));
const data = JSON.parse(line);
process.stdout.write(data.data?.claimToken || data.data?.task?.claim?.token || "");
')
      if [ -z "$CLAIM_TOKEN" ]; then
        echo "ERROR: failed to claim task before marking failed"
        continue
      fi
      omc team api transition-task-status --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'","from":"in_progress","to":"failed","claim_token":"'"$CLAIM_TOKEN"'","error":"pi worker crashed repeatedly"}' --json
      continue
    fi
    echo "WARN: pi worker dead with task in_progress — respawning (attempt $RESTART_COUNT)"
    # Exponential backoff: sleep 2^attempt seconds before retry
    sleep $((2 ** RESTART_COUNT))
    # Rebuild PI_COMMAND with the Phase 4c printf %q block first.
    PROVIDER_ARG=$(printf '%q' "$PROVIDER")
    MODEL_ARG=$(printf '%q' "$MODEL")
    BOOTSTRAP_ARG=$(printf '%q' "$BOOTSTRAP")
    TASK_ARG=$(printf '%q' "$TASK_INSTRUCTION")
    PI_COMMAND="pi --provider ${PROVIDER_ARG} --model ${MODEL_ARG} --append-system-prompt ${BOOTSTRAP_ARG} ${TASK_ARG}"
    tmux respawn-pane -k -t "$PANE_ID" "$PI_COMMAND"
  fi
fi
```

**Check omc-native worker status:**
```bash
# omc team handles native workers, but check for completeness
omc team api get-summary --input '{"team_name":"'"$TEAM_NAME"'"}' --json
```

**Terminal condition:**
```bash
# All tasks must be completed or failed
# Parse from list-tasks output
# If all terminal → exit monitoring loop
```

### Phase 6: Report and Cleanup

When all tasks are terminal:

1. **Collect results:**
```bash
omc team api list-tasks --input '{"team_name":"'"$TEAM_NAME"'"}' --json
```

2. **Report to user:**
Show a summary table:
```
## Team Results: $TEAM_NAME

| Worker | Task | Status | Summary |
|--------|------|--------|---------|
| pi-zai-1 | Task 1 | ✅ completed | Fixed auth validation |
| codex (worker-1) | Task 2 | ✅ completed | Reviewed security |
| gemini (worker-2) | Task 3 | ✅ completed | Updated docs |
```

3. **Cleanup:**
```bash
omc team shutdown "$TEAM_NAME" --force
```

## Error Reference

| Error | Cause | Fix |
|---|---|---|
| `pi: command not found` | pi CLI not installed | Run `/pi-setup` first |
| `Worker pi-xxx not found` | Not in pi-workers.json | Run `/pi-setup` to register |
| `tmux session not found` | tmux not running | Start tmux first |
| `omc team status: not found` | Team state missing | Check .omc/state/team/ |
| Worker pane dead after respawn ×3 | Fundamental failure | Report to user, mark task failed |
| `claim_token` error | Task already claimed | Skip to next available task |
| `worker_not_found` on claim | Worker not in manifest.json | Verify Phase 4c registration ran before Phase 4d |
| `write-worker-inbox` fails | Worker directory missing | Verify write-worker-identity ran first |
| Bootstrap template not found | PLUGIN_ROOT misresolved | Set CLAUDE_PLUGIN_ROOT or OMC_PLUGIN_ROOT env var |

## Edge Cases

### All pi workers, no native workers
- Skip Phase 3 (`omc team ...`)
- Create minimal team infrastructure in Phase 4a
- Claude manages everything

### All native workers, no pi workers
- Skip Phase 4 (pi worker spawn)
- Equivalent to `omc team ...`
- Claude only monitors via `omc team status`

### Single worker
- `1:pi-zai "task"` → one pi worker, one subtask
- No decomposition needed

### Model override
- `1:pi-zai/glm-5-turbo "task"` → use glm-5-turbo instead of configured default
- Parse: name=`pi-zai`, model_override=`glm-5-turbo`

### Mixed team with omc-native already running
- If user already has an omc team running, pi workers can join it
- Use `omc team api write-worker-identity` to register into existing team
