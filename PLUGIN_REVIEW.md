# Plugin Architecture Review: omc-custom-worker-with-pi

**Reviewer:** pi-zai-1 (task-3)  
**Date:** 2026-05-23  
**Plugin version:** 0.1.1 (plugin.json) / 0.1.0 (marketplace.json)

---

## 1. Structure Quality: GOOD (7.5/10)

### What's Present and Correct
- ✅ `.claude-plugin/plugin.json` — standard omc plugin metadata
- ✅ `.claude-plugin/marketplace.json` — marketplace listing
- ✅ `skills/pi-setup/SKILL.md` — setup/configuration skill with YAML frontmatter
- ✅ `skills/pi-team/SKILL.md` — orchestration skill with YAML frontmatter
- ✅ `commands/pi-setup.md` — command dispatch shim
- ✅ `commands/pi-team.md` — command dispatch shim
- ✅ `config/worker-bootstrap-prompt.md` — template for pi worker system prompt
- ✅ `README.md` — thorough documentation with architecture diagram, usage examples, comparison table
- ✅ `LICENSE` — MIT license
- ✅ Git tracks only plugin files (no runtime state committed)

### Minor Structural Issues
- ⚠️ **No `.gitignore`** — `.claude/`, `.omc/`, `.omg/`, `.omx/` directories are untracked but not ignored. Should add a `.gitignore` to prevent accidental commits.
- ⚠️ **No `CHANGELOG.md`** — expected for a versioned plugin.
- ⚠️ **No `CONTRIBUTING.md`** — minor, but standard for open-source plugins.
- ⚠️ **No test fixtures or validation scripts** — no automated way to verify skill correctness.

---

## 2. plugin.json & marketplace.json: MOSTLY GOOD

### plugin.json
```json
{
  "name": "omc-custom-worker-with-pi",
  "version": "0.1.1",
  ...
  "skills": ["./skills/pi-setup/", "./skills/pi-team/"],
  "commands": ["./commands/pi-setup.md", "./commands/pi-team.md"]
}
```

- ✅ Valid JSON structure
- ✅ Skills referenced with trailing slash (directory convention)
- ✅ Commands referenced as direct .md paths
- ✅ Good keyword coverage for discoverability
- ✅ Repository and homepage URLs consistent

### Issues Found

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 1 | **HIGH** | Version mismatch | `plugin.json` says `0.1.1` but `marketplace.json` says `0.1.0` (both the top-level and per-plugin version). Must stay synchronized. |
| 2 | **MEDIUM** | Missing `config` reference | The `config/worker-bootstrap-prompt.md` is a critical template but is not declared in plugin.json. The skill discovers it via `CLAUDE_PLUGIN_ROOT` at runtime, but explicit declaration would be safer. |
| 3 | **LOW** | No `minOmcVersion` field | Plugin requires omc v4.4.0+ (per README) but plugin.json has no minimum version constraint. The marketplace.json also omits this. |
| 4 | **LOW** | No `dependencies` field | pi CLI is a hard dependency but not declared in plugin metadata. |

---

## 3. Skill Definitions Review

### 3.1 skills/pi-setup/SKILL.md — GOOD (8/10)

**Frontmatter:**
```yaml
name: pi-setup
description: Setup pi CLI as a custom worker for omc teams...
aliases: []
level: 2
argument-hint: ""
```

- ✅ Correct YAML frontmatter format
- ✅ Level 2 is appropriate (interactive setup, moderate complexity)
- ✅ Comprehensive error handling table (9 error cases)
- ✅ Clear step-by-step flow with validation rules
- ✅ Configuration file format documented

**Issues:**

| # | Severity | Issue |
|---|----------|-------|
| 5 | **MEDIUM** | Uses `omc` command throughout but omc is now also aliased as `omx`. The skill should mention both or note the primary command. The upstream omc `team/SKILL.md` uses `omx team ...` exclusively. |
| 6 | **LOW** | Worker name validation enforces `pi-` prefix but doesn't check length limits or reserved patterns like `pi-leader`, `pi-fixed`, etc. |
| 7 | **LOW** | No `remove-worker` or `list-workers` subcommand flow — only additive setup. |
| 8 | **LOW** | Step 2 uses `pi --list-models <provider>` but doesn't handle the case where pi returns empty or error for an unknown provider. |

### 3.2 skills/pi-team/SKILL.md — GOOD (7.5/10)

**Frontmatter:**
```yaml
name: pi-team
description: Launch omc team with mixed pi custom workers...
aliases: []
level: 4
argument-hint: "<N:worker-type[,N:worker-type,...]> \"<task description>\""
```

- ✅ Level 4 is appropriate (complex orchestration)
- ✅ `argument-hint` matches README usage examples
- ✅ Well-structured 6-phase execution model
- ✅ Comprehensive edge case coverage
- ✅ Respawn logic with retry limit (3 attempts)
- ✅ Proper error reference table

**Issues:**

| # | Severity | Issue |
|---|----------|-------|
| 9 | **HIGH** | Phase 4a creates `config.json` manually but does NOT create `manifest.v2.json`. The upstream omc team runtime (`team/SKILL.md` section "Current Runtime Behavior") references both `config.json` and `manifest.v2.json` as essential team state files. Missing manifest may cause `omc team status` to malfunction or show incomplete data. |
| 10 | **HIGH** | Phase 4b uses `omc team api create-task` which is correct, but Phase 4d directly writes to `config.json` with a Node.js script in addition to calling `omc team api write-worker-identity`. This dual-write pattern can cause race conditions or data loss if the API call and the direct file write are not coordinated. |
| 11 | **MEDIUM** | No `AGENTS.md` / `worker-agents.md` generation. The omc team runtime creates `.omx/state/team/<team>/worker-agents.md` for workers. Pi workers may miss project-level instructions that native workers receive via AGENTS.md overlay. |
| 12 | **MEDIUM** | Phase 4c spawns pi with `--append-system-prompt ${BOOTSTRAP_ARG} ${TASK_ARG}`. The `TASK_ARG` is passed as a positional CLI argument, but pi CLI interprets positional args differently depending on version. This should use an explicit flag or stdin injection for reliability. |
| 13 | **MEDIUM** | No worker commit protocol. The omc worker skill mandates `git add -A && git commit -m "task: <subject>"` before task completion. The bootstrap prompt (`config/worker-bootstrap-prompt.md`) doesn't mention this requirement. |
| 14 | **LOW** | Phase 5 monitoring loop polls every 30 seconds but doesn't use `omc team await` (event-driven waiting), which is more efficient and recommended in the upstream team skill. |
| 15 | **LOW** | Team name generation uses `date +%s | tail -c 4` which only gives 4-digit suffix (collision risk if many teams launched in quick succession). |
| 16 | **LOW** | Phase 4c uses `tmux split-window -v` exclusively. For teams with many workers, this creates a tall stack. No horizontal split strategy or layout management. |
| 17 | **LOW** | No explicit `OMX_TEAM_WORKER` or `OMX_TEAM_STATE_ROOT` env vars set for pi workers. The bootstrap prompt instructs the pi worker to use paths directly, but these env vars are the canonical worker identity mechanism. |

---

## 4. Command Files Review

### commands/pi-setup.md — ADEQUATE
```yaml
description: "Setup pi CLI as a custom worker for omc teams"
```

- ✅ Correct dispatch pattern (reads SKILL.md and delegates)
- ⚠️ Missing `argument-hint` in frontmatter (present in skill but not command)

### commands/pi-team.md — ADEQUATE
```yaml
description: "Launch omc team with mixed pi custom workers and native workers"
argument-hint: "<N:worker-type[,N:worker-type,...]> \"<task description>\""
```

- ✅ Correct dispatch pattern
- ✅ Has argument-hint
- ⚠️ Says "locate it under the active `CLAUDE_PLUGIN_ROOT`/`OMC_PLUGIN_ROOT`" — good fallback but `OMC_PLUGIN_ROOT` is not a documented omc variable.

---

## 5. Bootstrap Template Review (config/worker-bootstrap-prompt.md)

### Template Variables
| Variable | Used | Substituted in SKILL.md |
|----------|------|------------------------|
| `{{TEAM_NAME}}` | ✅ | ✅ |
| `{{WORKER_NAME}}` | ✅ | ✅ |
| `{{TASK_ID}}` | ✅ | ✅ |
| `{{CWD}}` | ✅ | ✅ |
| `{{STATE_ROOT}}` | ✅ | ✅ |

- ✅ All 5 template variables are consistently used and substituted
- ✅ Template uses standard bash substitution in SKILL.md Phase 4c

### Issues

| # | Severity | Issue |
|---|----------|-------|
| 18 | **HIGH** | The bootstrap prompt tells workers to check `cat {{STATE_ROOT}}/workers/{{WORKER_NAME}}/inbox.md` for inbox. This works, but doesn't mention the canonical `OMX_TEAM_STATE_ROOT` env var resolution chain (env → identity → config → cwd fallback). Workers should check env vars first. |
| 19 | **MEDIUM** | No mention of the mailbox `mailbox-mark-delivered` protocol. Workers are told to check mailbox but not to mark messages as delivered, which can cause duplicate processing. |
| 20 | **MEDIUM** | The bootstrap prompt says `to_worker":"leader-fixed"` hardcoded. This is correct for the omc protocol but should be noted as a convention, not a hardcoded requirement. |
| 21 | **MEDIUM** | No git commit instruction. The omc worker skill explicitly requires workers to commit before task completion. This is a significant omission that can cause lost work when pi workers complete tasks. |
| 22 | **LOW** | The template doesn't include the dispatch discipline section that the omc worker skill has ("state-first, prefer CLI interop over tmux keystrokes"). |

---

## 6. Inconsistencies Between Skill Definitions and Plugin Metadata

| # | Area | Inconsistency |
|---|------|--------------|
| 23 | Version | plugin.json: `0.1.1`, marketplace.json: `0.1.0` |
| 24 | Command naming | Plugin uses `omc` throughout. The upstream omc team SKILL.md (at `~/.agents/skills/team/SKILL.md`) uses `omx` exclusively. Both commands exist on the system, but the plugin should note the alias or use the canonical name. |
| 25 | Skill path | Commands reference `skills/pi-setup/SKILL.md` and `skills/pi-team/SKILL.md` as relative paths from the plugin root. This is correct for omc plugin convention. |
| 26 | Description mismatch | plugin.json says "Add pi CLI as a custom worker type to oh-my-claudecode teams." marketplace.json says "Extend oh-my-claudecode teams with pi CLI workers." Slightly different wording — not a bug but could be harmonized. |
| 27 | pi-team SKILL.md references `omc team "$NATIVE_SPEC" "$NATIVE_TASKS" --json` but the omc team command signature is `omc team [N:agent-type] "<task description>"` — the `--json` flag may not produce the expected structured output. The SKILL.md parses output with node, assuming JSON lines. |

---

## 7. Overall Design Pattern Assessment

### Strengths
1. **Clean separation of concerns** — setup (pi-setup) vs execution (pi-team) is well split
2. **Comprehensive documentation** — README is excellent with architecture diagram, comparison table, and usage examples
3. **Proper omc team API integration** — uses `omc team api` for task lifecycle (claim, transition, heartbeat)
4. **Robust error handling** — error tables in both skills cover common failure modes
5. **Worker respawn** — auto-respawn with exponential backoff is a feature even native omc workers lack
6. **Mixed team support** — elegantly handles both pi and native workers

### Design Gaps
1. **Missing manifest.v2.json** — The most significant gap. Without it, `omc team status` and other omc commands that read the manifest may not recognize the team properly.
2. **No git commit protocol** — Workers can complete tasks without committing, leading to lost changes.
3. **No `omc team await`** — Monitoring is polling-only, missing the more efficient event-driven approach.
4. **Dual-write risk** — Writing config.json directly AND via API call is fragile.
5. **No AGENTS.md propagation** — Pi workers miss project-level instructions that native workers get.

---

## 8. Improvement Suggestions (Priority Order)

### Critical (P0)
1. **Add `.gitignore`** with `.claude/`, `.omc/`, `.omg/`, `.omx/`, `node_modules/`
2. **Synchronize versions** between plugin.json and marketplace.json
3. **Create manifest.v2.json** in Phase 4a alongside config.json
4. **Add git commit instruction** to the bootstrap template (between Step 2 and Step 3)

### Important (P1)
5. **Remove dual-write in Phase 4d** — use only `omc team api write-worker-identity` OR direct file write, not both
6. **Add `mailbox-mark-delivered`** protocol to bootstrap template
7. **Add AGENTS.md propagation** — copy or symlink project AGENTS.md into the pi worker's bootstrap context
8. **Add `minOmcVersion`** to plugin.json (`"minOmcVersion": "4.4.0"`)
9. **Add `omc team await`** as an alternative to 30-second polling in Phase 5

### Nice-to-Have (P2)
10. **Add `remove-worker` and `list-workers` flows** to pi-setup skill
11. **Use `OMX_TEAM_WORKER` / `OMX_TEAM_STATE_ROOT` env vars** for pi workers alongside the template path approach
12. **Add horizontal split strategy** for teams with 3+ workers
13. **Add CHANGELOG.md** 
14. **Add reserved worker name validation** (`pi-leader`, `pi-fixed`, `pi-monitor`, etc.)
15. **Consider using `--json` output parsing** for `pi --list-models` if pi supports it, instead of awk/grep text processing

---

## 9. Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| File structure | 8/10 | Clean, missing .gitignore |
| plugin.json | 7/10 | Version mismatch, missing fields |
| marketplace.json | 7/10 | Version mismatch with plugin.json |
| pi-setup SKILL.md | 8/10 | Thorough, minor gaps |
| pi-team SKILL.md | 7.5/10 | Complex and well-structured, missing manifest |
| Command files | 7/10 | Simple dispatch, adequate |
| Bootstrap template | 7/10 | Variables consistent, missing commit/mailbox protocol |
| Documentation (README) | 9/10 | Excellent |
| omc protocol adherence | 6.5/10 | Missing manifest, AGENTS.md, commit protocol |
| **Overall** | **7.5/10** | Solid foundation, needs protocol alignment fixes |

---

*Review complete. The plugin is well-designed with excellent documentation. The main gaps are protocol alignment with the omc team runtime (manifest.v2.json, git commit protocol, AGENTS.md propagation) and version synchronization between metadata files.*
