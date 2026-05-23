---
name: pi-team
description: Launch omc team with mixed pi custom workers and native claude/codex/gemini workers. Pi workers use pi CLI with any provider.
when_to_use: Use when launching a team with pi workers, mixed pi+native teams, or multi-agent orchestration with custom LLM providers. Triggers on team launch, worker spawn, or parallel agent execution.
argument-hint: "<N:worker-type[,N:worker-type,...]> \"<task description>\""
arguments: [worker-spec, task]
disable-model-invocation: true
allowed-tools:
  - Bash(omc *)
  - Bash(pi *)
  - Bash(tmux *)
  - Bash(node *)
  - Bash(mkdir *)
  - Bash(cat *)
  - Bash(git *)
  - Bash(date *)
  - Bash(sleep *)
  - Bash(printf *)
  - Bash(grep *)
  - Bash(realpath *)
shell: bash
---

# Pi Team — Mixed Worker Orchestrator

Launch an omc team with any combination of **pi custom workers** (zai, openai, etc.) and **omc-native workers** (claude, codex, gemini). You (Claude) serve as the orchestrator, handling pi workers directly while delegating native workers to omc team.

**Supporting scripts are in `${CLAUDE_SKILL_DIR}/scripts/`.**

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

```bash
command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux not installed"; exit 1; }
command -v omc >/dev/null 2>&1 || { echo "ERROR: omc not installed"; exit 1; }
if echo "$WORKER_SPEC" | grep -q 'pi-'; then
  command -v pi >/dev/null 2>&1 || { echo "ERROR: pi not installed. Run /pi-setup first."; exit 1; }
  cat ~/.claude/pi-workers.json || { echo "ERROR: pi-workers.json not found. Run /pi-setup first."; exit 1; }
fi
command -v node >/dev/null 2>&1 || { echo "ERROR: node not installed"; exit 1; }
echo "TMUX=$TMUX"; tmux display-message -p '#S' 2>/dev/null || echo "Not in tmux"
```

### Phase 1: Parse and Classify Workers

```bash
# Parse worker spec and validate against pi-workers.json
node "${CLAUDE_SKILL_DIR}/scripts/parse-workers.js" "$WORKER_SPEC"
```

This outputs JSON with `piWorkers[]`, `nativeWorkers[]`, `totalWorkers`. Each pi worker entry includes resolved `provider` and `model` from `~/.claude/pi-workers.json`.

**Generate team name:**
```bash
CLEAN_TASK=$(printf '%s' '<task>' | head -c 20 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+$//' | sed 's/^-\+//' | sed 's/^\-//')
TEAM_NAME="pi-${CLEAN_TASK}-$(date +%s | grep -oE '.{4}$')"

case "$TEAM_NAME" in ""|*[!a-zA-Z0-9_-]*)
  echo "ERROR: invalid team name '$TEAM_NAME'"; exit 1;; esac
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
- If task is simple, give all workers the same task description

### Phase 3: Launch omc-native Workers

If `nativeWorkers` is non-empty:

```bash
NATIVE_SPEC="<N:type[,N:type,...]>"
NATIVE_TASKS='[codex] <codex-subtask>; [gemini] <gemini-subtask>'
NATIVE_OUTPUT=$(omc team "$NATIVE_SPEC" "$NATIVE_TASKS" 2>&1)
TEAM_NAME=$(printf "%s" "$NATIVE_OUTPUT" | grep -E '^Team started:' | sed -E 's/^Team started:[[:space:]]*//' | head -n 1)
[ -n "$TEAM_NAME" ] || { echo "ERROR: unable to resolve omc team name"; exit 1; }
case "$TEAM_NAME" in ""|*[!a-zA-Z0-9_-]*)
  echo "ERROR: invalid team name '$TEAM_NAME'"; exit 1;; esac
omc team status "$TEAM_NAME"
```

### Phase 4: Launch Pi Workers

For each pi worker, execute the following sub-phases in order.

**CRITICAL: Phase 4c (register) MUST run BEFORE Phase 4d (spawn) to prevent race conditions.**

#### 4a: Prepare team infrastructure (if not already done by Phase 3)

```bash
if [ ! -d ".omc/state/team/${TEAM_NAME}" ]; then
  mkdir -p ".omc/state/team/${TEAM_NAME}"/{tasks,workers,mailbox,dispatch,approvals}
fi
```

Write config.json and manifest.json. **manifest.json is required** — `omc team api claim-task` validates workers against it.

```bash
json_string() {
  node "${CLAUDE_SKILL_DIR}/scripts/json-string.js" "$1"
}

: "${MAIN_TASK:?ERROR: MAIN_TASK is required}"
: "${TOTAL_WORKERS:?ERROR: TOTAL_WORKERS is required}"
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMUX_SESSION=$(tmux display-message -p '#S')
LEADER_PANE_ID=$(tmux display-message -p '#{pane_id}')
LEADER_CWD=$(pwd)
TEAM_STATE_ROOT="${LEADER_CWD}/.omc/state/team/${TEAM_NAME}"

cat > ".omc/state/team/${TEAM_NAME}/config.json" << CFGEOF
{
  "name": $(json_string "$TEAM_NAME"),
  "task": $(json_string "$MAIN_TASK"),
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
  "worker_count": ${TOTAL_WORKERS},
  "max_workers": 20,
  "workers": [],
  "next_task_id": 1,
  "created_at": $(json_string "$CREATED_AT"),
  "tmux_session": $(json_string "$TMUX_SESSION"),
  "leader_pane_id": $(json_string "$LEADER_PANE_ID"),
  "leader_cwd": $(json_string "$LEADER_CWD"),
  "team_state_root": $(json_string "$TEAM_STATE_ROOT"),
  "workspace_mode": "single",
  "worktree_mode": "disabled"
}
CFGEOF

cat > ".omc/state/team/${TEAM_NAME}/manifest.json" << MANEOF
{
  "schema_version": 2,
  "name": $(json_string "$TEAM_NAME"),
  "task": $(json_string "$MAIN_TASK"),
  "leader": {
    "session_id": $(json_string "${TMUX_SESSION}:0"),
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
  "tmux_session": $(json_string "$TMUX_SESSION"),
  "worker_count": 0,
  "workers": [],
  "next_task_id": 1,
  "created_at": $(json_string "$CREATED_AT"),
  "leader_cwd": $(json_string "$LEADER_CWD"),
  "team_state_root": $(json_string "$TEAM_STATE_ROOT"),
  "workspace_mode": "single",
  "worktree_mode": "disabled",
  "leader_pane_id": $(json_string "$LEADER_PANE_ID"),
  "hud_pane_id": null
}
MANEOF
```

#### 4b: Create tasks

```bash
CREATE_TASK_INPUT=$(node "${CLAUDE_SKILL_DIR}/scripts/build-api-input.js" create-task "$TEAM_NAME" "Task ${i}" "$SUBTASK_DESCRIPTION")

CREATE_TASK_JSON=$(omc team api create-task --input "$CREATE_TASK_INPUT" --json)
TASK_ID=$(printf "%s" "$CREATE_TASK_JSON" | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
const line = lines.find((value) => value.trim().startsWith("{"));
const data = JSON.parse(line);
process.stdout.write(String(data.data?.task?.id || ""));
')
[ -n "$TASK_ID" ] || { echo "ERROR: unable to resolve created task id"; exit 1; }
if ! [[ "$TASK_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: invalid task id '$TASK_ID'"; exit 1; fi
```

#### 4c: Register worker (BEFORE spawning)

```bash
WORKER_NAME="pi-${NAME#pi-}-${INDEX}"
TEAM_STATE_ROOT="$(pwd)/.omc/state/team/${TEAM_NAME}"

# Register via omc team api
WORKER_IDENTITY_INPUT=$(node "${CLAUDE_SKILL_DIR}/scripts/build-api-input.js" \
  write-worker-identity "$TEAM_NAME" "$WORKER_NAME" "$INDEX" "$TASK_ID" "$(pwd)" "$TEAM_STATE_ROOT" "$PROVIDER" "$MODEL")
omc team api write-worker-identity --input "$WORKER_IDENTITY_INPUT" --json

# Update config.json and manifest.json directly
TEAM_STATE_ROOT="$TEAM_STATE_ROOT" WORKER_NAME="$WORKER_NAME" WORKER_INDEX="$INDEX" TASK_ID="$TASK_ID" \
PANE_ID="pending" PROVIDER="$PROVIDER" MODEL="$MODEL" CWD="$(pwd)" \
  node "${CLAUDE_SKILL_DIR}/scripts/register-worker.js"
```

#### 4d: Spawn pi worker pane (AFTER registration)

```bash
# Resolve bootstrap template
BOOTSTRAP_TEMPLATE="${CLAUDE_PLUGIN_ROOT}/config/worker-bootstrap-prompt.md"
[ -f "$BOOTSTRAP_TEMPLATE" ] || { echo "ERROR: bootstrap template not found at $BOOTSTRAP_TEMPLATE"; exit 1; }

# Render template with variables
BOOTSTRAP=$(TEAM_NAME="$TEAM_NAME" WORKER_NAME="$WORKER_NAME" TASK_ID="$TASK_ID" CWD="$(pwd)" STATE_ROOT="$TEAM_STATE_ROOT" \
  node "${CLAUDE_SKILL_DIR}/scripts/render-bootstrap.js" "$BOOTSTRAP_TEMPLATE")

# Build task instruction
TASK_INSTRUCTION="## Task Assignment
Task ID: ${TASK_ID}
Worker: ${WORKER_NAME}

### REQUIRED: Task Lifecycle
1. Claim: omc team api claim-task --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"worker\":\"${WORKER_NAME}\"}' --json
2. Do the work described below.
3. Complete: omc team api transition-task-status --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"from\":\"in_progress\",\"to\":\"completed\",\"claim_token\":\"<claim_token>\",\"result\":\"Summary: <what changed>\\nVerification: <tests or checks run>\"}' --json
4. On failure: omc team api transition-task-status --input '{\"team_name\":\"${TEAM_NAME}\",\"task_id\":\"${TASK_ID}\",\"from\":\"in_progress\",\"to\":\"failed\",\"claim_token\":\"<claim_token>\"}' --json

### Task
${SUBTASK_DESCRIPTION}"

# Spawn in tmux with safe quoting
PROVIDER_ARG=$(printf '%q' "$PROVIDER")
MODEL_ARG=$(printf '%q' "$MODEL")
BOOTSTRAP_ARG=$(printf '%q' "$BOOTSTRAP")
TASK_ARG=$(printf '%q' "$TASK_INSTRUCTION")
PI_COMMAND="pi --provider ${PROVIDER_ARG} --model ${MODEL_ARG} --append-system-prompt ${BOOTSTRAP_ARG} ${TASK_ARG}"
PANE_ID=$(tmux split-window -v -d -P -F '#{pane_id}' -c "$(pwd)" "$PI_COMMAND")

# Update pane_id in config + manifest + identity
TEAM_STATE_ROOT="$TEAM_STATE_ROOT" WORKER_NAME="$WORKER_NAME" PANE_ID="$PANE_ID" \
  node "${CLAUDE_SKILL_DIR}/scripts/update-pane-id.js"
```

#### 4e: Send initial task dispatch

```bash
WORKER_INBOX_INPUT=$(node "${CLAUDE_SKILL_DIR}/scripts/build-api-input.js" \
  send-message "$TEAM_NAME" "$WORKER_NAME" "$TASK_INSTRUCTION")
omc team api write-worker-inbox --input "$WORKER_INBOX_INPUT" --json
tmux send-keys -t "$PANE_ID" "" Enter
```

### Phase 5: Monitor Loop

You MUST actively monitor the team until all tasks reach a terminal state (completed or failed).

**Use `get-summary` for a complete team snapshot in one call:**

```bash
SUMMARY=$(omc team api get-summary --input '{"team_name":"'"$TEAM_NAME"'"}' --json)
```

This returns all workers' alive status, heartbeat data, current tasks, and task stats — replacing multiple individual API calls.

**Poll every 30 seconds.** On each poll:

#### 5a: Save monitor snapshot

Persist the current state for session recovery after compaction:

```bash
# Build and save monitor snapshot
TASKS_JSON=$(omc team api list-tasks --input '{"team_name":"'"$TEAM_NAME"'"}' --json)
SNAPSHOT=$(node -e '
const tasks = JSON.parse(process.argv[1]).data?.tasks || [];
const snap = {
  taskStatusById: {},
  workerAliveByName: {},
  workerStateByName: {},
  workerTurnCountByName: {},
  workerTaskIdByName: {},
  mailboxNotifiedByMessageId: {},
  completedEventTaskIds: {}
};
tasks.forEach(t => {
  snap.taskStatusById[t.id] = t.status;
  if (t.status === "completed") snap.completedEventTaskIds[t.id] = true;
});
process.stdout.write(JSON.stringify(snap));
' -- "$TASKS_JSON")

omc team api write-monitor-snapshot --input '{"team_name":"'"$TEAM_NAME"'","snapshot":'"$SNAPSHOT"'}' --json
```

#### 5b: Check pi worker liveness

Pi workers now self-heartbeat (Step 4 in bootstrap). The leader supplements with tmux pane PID checks:

```bash
PANE_PID=$(tmux display-message -t "$PANE_ID" -p '#{pane_pid}' 2>/dev/null)

if [ -n "$PANE_PID" ]; then
  # Pane alive — leader supplements heartbeat (pi worker also self-heartbeats)
  HEARTBEAT_COUNT=$(( ${HEARTBEAT_COUNT:-0} + 1 ))
  omc team api update-worker-heartbeat --input '{
    "team_name": "'"$TEAM_NAME"'",
    "worker": "'"$WORKER_NAME"'",
    "pid": '"$PANE_PID"',
    "turn_count": '"$HEARTBEAT_COUNT"',
    "alive": true
  }' --json
else
  # Pane dead — check worker's self-heartbeat before declaring dead
  WORKER_HB=$(omc team api read-worker-heartbeat --input '{"team_name":"'"$TEAM_NAME"'","worker":"'"$WORKER_NAME"'"}' --json)
  WORKER_ALIVE=$(printf "%s" "$WORKER_HB" | node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
    const line = lines.find((v) => v.trim().startsWith("{"));
    if (!line) { process.stdout.write("false"); process.exit(0); }
    const data = JSON.parse(line);
    const hb = data.data?.heartbeat;
    if (!hb || !hb.lastPollAt) { process.stdout.write("false"); process.exit(0); }
    const age = Date.now() - new Date(hb.lastPollAt).getTime();
    process.stdout.write(age < 60000 ? "true" : "false");
  ')

  if [ "$WORKER_ALIVE" = "true" ]; then
    echo "INFO: pane dead but worker heartbeat recent — process may have reparented"
    continue
  fi

  # Truly dead — check task status
  TASK_STATUS=$(omc team api read-task --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'"}' --json | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
const line = lines.find((value) => value.trim().startsWith("{"));
const data = JSON.parse(line);
process.stdout.write(data.data?.task?.status || "unknown");
')

  if [ "$TASK_STATUS" = "in_progress" ]; then
    RESTART_COUNT=$(( ${RESTART_COUNT:-0} + 1 ))

    # Log respawn event
    omc team api append-event --input '{"team_name":"'"$TEAM_NAME"'","type":"worker_respawned","worker":"'"$WORKER_NAME"'","task_id":"'"$TASK_ID"'","reason":"pane dead, attempt '"$RESTART_COUNT"'"}' --json

    if [ "$RESTART_COUNT" -gt 3 ]; then
      echo "ERROR: pi worker dead after 3 respawn attempts"
      CLAIM_TOKEN=$(omc team api claim-task --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'","worker":"'"$WORKER_NAME"'"}' --json | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").trim().split(/\n/).reverse();
const line = lines.find((value) => value.trim().startsWith("{"));
const data = JSON.parse(line);
process.stdout.write(data.data?.claimToken || data.data?.task?.claim?.token || "");
')
      if [ -z "$CLAIM_TOKEN" ]; then
        echo "ERROR: failed to claim task before marking failed"; continue
      fi
      omc team api transition-task-status --input '{"team_name":"'"$TEAM_NAME"'","task_id":"'"$TASK_ID"'","from":"in_progress","to":"failed","claim_token":"'"$CLAIM_TOKEN"'","error":"pi worker crashed repeatedly"}' --json
      omc team api append-event --input '{"team_name":"'"$TEAM_NAME"'","type":"task_failed","worker":"'"$WORKER_NAME"'","task_id":"'"$TASK_ID"'","reason":"exhausted 3 respawn attempts"}' --json
      continue
    fi
    echo "WARN: pi worker dead — respawning (attempt $RESTART_COUNT)"
    sleep $((2 ** RESTART_COUNT))
    PROVIDER_ARG=$(printf '%q' "$PROVIDER")
    MODEL_ARG=$(printf '%q' "$MODEL")
    BOOTSTRAP_ARG=$(printf '%q' "$BOOTSTRAP")
    TASK_ARG=$(printf '%q' "$TASK_INSTRUCTION")
    PI_COMMAND="pi --provider ${PROVIDER_ARG} --model ${MODEL_ARG} --append-system-prompt ${BOOTSTRAP_ARG} ${TASK_ARG}"
    tmux respawn-pane -k -t "$PANE_ID" "$PI_COMMAND"
  fi
fi
```

#### 5c: Log completion events

When a task transitions to terminal state, log it:

```bash
omc team api append-event --input '{"team_name":"'"$TEAM_NAME"'","type":"task_completed","worker":"'"$WORKER_NAME"'","task_id":"'"$TASK_ID"'"}' --json
```

**Terminal condition:** All tasks must be completed or failed.

### Phase 6: Report and Cleanup

When all tasks are terminal:

1. **Collect results:**
```bash
omc team api get-summary --input '{"team_name":"'"$TEAM_NAME"'"}' --json
```

2. **Report to user:**
```
## Team Results: $TEAM_NAME

| Worker | Task | Status | Summary |
|--------|------|--------|---------|
| pi-zai-1 | Task 1 | ✅ completed | Fixed auth validation |
| codex (worker-1) | Task 2 | ✅ completed | Reviewed security |
```

3. **Graceful shutdown:**
   - Request each pi worker to shut down cleanly
   - Wait for acknowledgment
   - Then force shutdown and clean up

```bash
# Request graceful shutdown from pi workers
for WORKER_NAME in $PI_WORKER_NAMES; do
  omc team api write-shutdown-request --input '{
    "team_name": "'"$TEAM_NAME"'",
    "worker": "'"$WORKER_NAME"'",
    "requested_by": "leader-fixed"
  }' --json
  # Give worker a few seconds to ack
  sleep 3
  omc team api read-shutdown-ack --input '{"team_name":"'"$TEAM_NAME"'","worker":"'"$WORKER_NAME"'"}' --json
done

# Force shutdown remaining
omc team shutdown "$TEAM_NAME" --force

# Final cleanup — remove orphan state
omc team api orphan-cleanup --input '{"team_name":"'"$TEAM_NAME"'"}' --json
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
| `worker_not_found` on claim | Worker not in manifest.json | Verify Phase 4c ran before 4d |
| `write-worker-inbox` fails | Worker directory missing | Verify write-worker-identity ran first |
| Bootstrap template not found | PLUGIN_ROOT misresolved | Ensure plugin is installed correctly |
| `orphan_cleanup_blocked` | Worktree recovery evidence present | Pass `acknowledge_lost_worktree_recovery=true` after manual cleanup |
| Pane dead but heartbeat recent | Process reparented | Non-fatal — worker still alive via self-heartbeat |

## Edge Cases

- **All pi workers, no native workers:** Skip Phase 3, create infrastructure in Phase 4a, Claude manages everything.
- **All native workers, no pi workers:** Skip Phase 4, equivalent to plain `omc team`.
- **Single worker:** `1:pi-zai "task"` → one pi worker, one subtask, no decomposition needed.
- **Model override:** `1:pi-zai/glm-5-turbo "task"` → use glm-5-turbo instead of configured default.
- **Mixed team with omc-native already running:** Use `omc team api write-worker-identity` to register pi workers into existing team.
