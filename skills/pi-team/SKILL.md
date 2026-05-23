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

# pi CLI (only if pi workers are requested)
command -v pi >/dev/null 2>&1 || { echo "ERROR: pi not installed. Run /pi-setup first."; exit 1; }

# tmux session
echo "TMUX=$TMUX"
tmux display-message -p '#S' 2>/dev/null || echo "Not in tmux"
```

Read worker configuration:
```bash
cat ~/.claude/pi-workers.json
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
TEAM_NAME="pi-$(echo '<task>' | head -c 20 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+$//' | sed 's/^\-//')-$(date +%s | tail -c 4)"
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
# Build agent list for omc team
# e.g., for 1:codex, 1:gemini → agents="codex,gemini"
omc team start \
  --agent <comma-separated-types> \
  --name "$TEAM_NAME" \
  --task "<codex-subtask>" \
  --task "<gemini-subtask>"
```

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

Write minimal config.json:
```bash
cat > .omc/state/team/${TEAM_NAME}/config.json << 'CFGEOF'
{
  "name": "<TEAM_NAME>",
  "task": "<main task>",
  "agent_type": "pi-custom",
  "worker_launch_mode": "interactive",
  "worker_count": <total>,
  "max_workers": 20,
  "workers": [],
  "next_task_id": <total+1>,
  "created_at": "<ISO>",
  "tmux_session": "<session>",
  "leader_pane_id": "<current pane>",
  "leader_cwd": "<cwd>"
}
CFGEOF
```

#### 4b: Create task files

For each pi worker's subtask:
```bash
cat > .omc/state/team/${TEAM_NAME}/tasks/task-${i}.json << TASKEOF
{
  "id": "${i}",
  "subject": "Task ${i}",
  "description": "<subtask with omc team api lifecycle commands>",
  "status": "pending",
  "owner": null,
  "result": null,
  "created_at": "<ISO>"
}
TASKEOF
```

#### 4c: Spawn pi worker panes

For each pi worker instance:

```bash
# Determine split target (last worker pane or leader pane)
SPLIT_TARGET="<last-pane-or-leader>"

# Read worker config
# From ~/.claude/pi-workers.json: provider, model
PROVIDER="<provider>"
MODEL="<model>"  # Use override if pi-name/model was specified

# Read and render bootstrap template
BOOTSTRAP=$(cat <plugin-path>/config/worker-bootstrap-prompt.md | \
  sed "s/{{TEAM_NAME}}/${TEAM_NAME}/g" | \
  sed "s/{{WORKER_NAME}}/pi-${NAME}-${INDEX}/g" | \
  sed "s/{{TASK_ID}}/${TASK_ID}/g" | \
  sed "s/{{CWD}}/$(pwd)/g" | \
  sed "s/{{STATE_ROOT}}/$(pwd)\/.omc\/state\/team\/${TEAM_NAME}/g")

# Build task instruction with lifecycle commands
TASK_INSTRUCTION="## Task Assignment
Task ID: ${TASK_ID}
Worker: pi-${NAME}-${INDEX}

### REQUIRED: Task Lifecycle
1. Claim: omc team api claim-task --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"worker\":\"pi-${NAME}-${INDEX}\"}' --json
2. Do the work described below.
3. Complete: omc team api transition-task-status --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"from\":\"in_progress\",\"to\":\"completed\",\"claim_token\":\"<claim_token>\",\"result\":\"Summary: <what changed>\"}' --json
4. On failure: omc team api transition-task-status --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"from\":\"in_progress\",\"to\":\"failed\",\"claim_token\":\"<claim_token>\"}' --json

### Task
${SUBTASK_DESCRIPTION}"

# Spawn in tmux
tmux split-window -v -d -P -F '#{pane_id}' -c "$(pwd)" \
  "pi --provider ${PROVIDER} --model ${MODEL} --append-system-prompt '${BOOTSTRAP}' \"${TASK_INSTRUCTION}\""
```

Record the pane ID.

#### 4d: Register worker with omc team

```bash
omc team api write-worker-identity --input '{
  "team_name": "<TEAM_NAME>",
  "worker": "pi-<name>-<index>",
  "index": <index>,
  "role": "executor",
  "pane_id": "<pane_id>",
  "working_dir": "<cwd>"
}'
```

#### 4e: Send initial task dispatch

Write the task instruction to the worker's inbox:
```bash
omc team api write-worker-inbox --input '{
  "team_name": "<TEAM_NAME>",
  "worker": "pi-<name>-<index>",
  "content": "<task instruction>"
}'
```

Also send an initial message to the pi pane to trigger it to start:
```bash
tmux send-keys -t <pane_id> "" Enter
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
tmux display-message -t <pane_id> -p '#{pane_pid}' 2>/dev/null
PANE_PID=$?

if [ "$PANE_PID" -eq 0 ]; then
  # Pane alive — update heartbeat
  PID=$(tmux display-message -t <pane_id> -p '#{pane_pid}')
  omc team api update-worker-heartbeat --input '{
    "team_name": "'"$TEAM_NAME"'",
    "worker": "pi-<name>-<index>",
    "pid": '"$PID"',
    "turn_count": <increment>,
    "alive": true
  }'
else
  # Pane dead — check if task completed
  # If task still in_progress, respawn the worker
  TASK_STATUS=$(omc team api read-task --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'"}' --json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.data?.task?.status||'unknown')")

  if [ "$TASK_STATUS" = "in_progress" ]; then
    echo "WARN: pi worker dead with task in_progress — respawning"
    # Respawn with same config
    tmux respawn-pane -k -t <pane_id>
    tmux send-keys -t <pane_id> "pi --provider ${PROVIDER} --model ${MODEL} --append-system-prompt '${BOOTSTRAP}' \"${TASK_INSTRUCTION}\"" Enter
    # Increment restart counter, stop after 3 attempts
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

## Edge Cases

### All pi workers, no native workers
- Skip Phase 3 (omc team start)
- Create minimal team infrastructure in Phase 4a
- Claude manages everything

### All native workers, no pi workers
- Skip Phase 4 (pi worker spawn)
- Equivalent to `omc team start ...`
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
