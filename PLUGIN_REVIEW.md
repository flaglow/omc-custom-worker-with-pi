# Plugin Configuration Review — omc-custom-worker-with-pi

**Reviewer:** pi-zai-1  
**Date:** 2026-05-24  
**Files reviewed:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, full plugin structure

---

## Summary

The plugin structure is **well-organized** with valid JSON, consistent versions, and correct path references. Below is a detailed analysis with severity ratings (🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low, ℹ️ Info).

---

## 1. JSON Schema Correctness & Field Completeness

### plugin.json

| Field | Status | Notes |
|---|---|---|
| `name` | ✅ Present | `"omc-custom-worker-with-pi"` — follows kebab-case convention |
| `version` | ✅ Present | `"0.1.5"` — valid semver |
| `description` | ✅ Present | Clear, concise (130 chars) |
| `author` | ✅ Present | `{"name": "flaglow"}` |
| `repository` | ✅ Present | Valid GitHub URL |
| `homepage` | ✅ Present | Same as repository (acceptable for GitHub-hosted plugins) |
| `license` | ✅ Present | `"MIT"` — matches LICENSE file |
| `keywords` | ✅ Present | 10 relevant keywords |
| `skills` | ✅ Present | 2 skills with correct paths |
| `commands` | ✅ Present | 2 commands with correct paths |

**Issues:**

- 🟡 **MEDIUM — Missing `engines` field.** No `engines` field specifying minimum Claude Code version or omc version. Since the plugin requires `omc v4.4.0+` (documented in README), this dependency should be declared.
  ```json
  "engines": {
    "claude-code": ">=1.0.0",
    "oh-my-claudecode": ">=4.4.0"
  }
  ```

- 🟢 **LOW — No `icon` or `color` branding fields.** These are optional but improve marketplace presentation.

- 🟢 **LOW — `author` missing `email` or `url`.** Only `name` is provided. Adding a GitHub profile URL would improve discoverability.

### marketplace.json

| Field | Status | Notes |
|---|---|---|
| `$schema` | ✅ Present | References Anthropic marketplace schema |
| `name` | ✅ Present | Consistent with plugin.json |
| `description` | ✅ Present | Good summary |
| `owner` | ✅ Present | `{"name": "flaglow"}` |
| `version` | ✅ Present | `"0.1.5"` |
| `plugins` | ✅ Present | Single plugin entry, properly structured |

**Plugin entry fields:**

| Field | Status | Notes |
|---|---|---|
| `name` | ✅ | Matches plugin.json |
| `description` | ✅ | More detailed than top-level description (good) |
| `version` | ✅ | Consistent |
| `author` | ✅ | Matches |
| `license` | ✅ | `"MIT"` |
| `source` | ✅ | `"./"` — correct relative path |
| `category` | ✅ | `"multi-agent"` — appropriate |
| `homepage` | ✅ | Valid URL |
| `tags` | ✅ | 6 tags, all relevant |

**Issues:**

- 🟡 **MEDIUM — `description` duplication with slight inconsistency.** The top-level marketplace `description` says "Add pi CLI workers (zai, openai, any provider)..." while `plugins[0].description` says "Extend oh-my-claudecode teams with pi CLI workers..." and `plugin.json.description` says "Add pi CLI as a custom worker type...". Three different descriptions for the same plugin. Pick one canonical description and use it consistently.

- 🟢 **LOW — Missing `readme` field in plugin entry.** Could reference `"./README.md"` for marketplace display.

- 🟢 **LOW — Missing `changelog` field.** No reference to a CHANGELOG.md. For a versioned plugin, this is best practice.

- ℹ️ **INFO — `tags` vs `keywords` mismatch.** `plugin.json` has 10 keywords; `marketplace.json` has 6 tags. The marketplace tags lack `"openai"` which is in keywords but include `"custom-worker"` which is not in keywords. Consider aligning them:
  - Missing from tags: `"claude-code"`, `"plugin"`, `"omc"`, `"oh-my-claudecode"`, `"openai"`
  - Extra in tags: `"custom-worker"`
  - Recommend: keep `"openai"` in both; remove generic tags like `"plugin"` from keywords

---

## 2. Version Consistency

| Location | Version | Status |
|---|---|---|
| `plugin.json` | `0.1.5` | ✅ |
| `marketplace.json` (top-level) | `0.1.5` | ✅ |
| `marketplace.json` (`plugins[0].version`) | `0.1.5` | ✅ |

**All three version fields are consistent.** ✅ No issues.

---

## 3. Skill & Command Path Correctness

### Skills

| plugin.json path | File exists | SKILL.md present | Notes |
|---|---|---|---|
| `./skills/pi-setup/` | ✅ | ✅ | Valid SKILL.md with frontmatter |
| `./skills/pi-team/` | ✅ | ✅ | Valid SKILL.md with frontmatter |

Both SKILL.md files have proper frontmatter with `name`, `description`, `aliases`, `level`, and `argument-hint` fields. ✅

### Commands

| plugin.json path | File exists | Notes |
|---|---|---|
| `./commands/pi-setup.md` | ✅ | Valid dispatch shim with frontmatter |
| `./commands/pi-team.md` | ✅ | Valid dispatch shim with frontmatter |

Both command files follow the dispatch shim pattern — they redirect to their corresponding SKILL.md. ✅

### Path Resolution

- Skill paths use trailing slashes (`./skills/pi-setup/`) — this is correct for directory-based skill resolution.
- Command paths use full filenames (`./commands/pi-setup.md`) — correct for file-based command resolution.
- All paths are relative to `.claude-plugin/` directory, which is the standard convention.

**No path issues found.** ✅

---

## 4. Marketplace Metadata Quality

### Category
- `"multi-agent"` — **appropriate and descriptive.** This is a good category choice.

### Tags Analysis

Current tags: `multi-agent`, `pi`, `team`, `worker`, `zai`, `custom-worker`

| Tag | Quality | Notes |
|---|---|---|
| `multi-agent` | ✅ Good | Matches category, aids discoverability |
| `pi` | ✅ Good | Names the key tool |
| `team` | ✅ Good | Describes the primary use case |
| `worker` | ✅ Good | Describes the abstraction |
| `zai` | ⚠️ Niche | Only meaningful to zai users; consider also adding `"openai"` since it's a supported provider |
| `custom-worker` | ✅ Good | Distinguishes from native workers |

**Issues:**

- 🟡 **MEDIUM — Tags should include `"openai"`.** The README and descriptions mention OpenAI as a supported provider, but it's missing from marketplace tags. Users searching for OpenAI integration won't find it.

- 🟢 **LOW — Missing `"automation"` or `"orchestration"` tag.** These are common marketplace search terms for multi-agent tools.

### Description Quality

The descriptions are clear and action-oriented. The plugin entry description in marketplace.json is the strongest ("Extend oh-my-claudecode teams with pi CLI workers. Use any pi-supported LLM provider..."). 

**Rating: Good** — descriptions communicate purpose, compatibility, and key benefit.

---

## 5. Missing Required Fields & Best Practice Violations

### Missing Fields

| Field | Location | Severity | Notes |
|---|---|---|---|
| `engines` | plugin.json | 🟡 Medium | No dependency version constraints declared |
| `readme` | marketplace.json plugin entry | 🟢 Low | Should reference `"./README.md"` |
| `changelog` | marketplace.json plugin entry | 🟢 Low | Should reference a changelog file |
| `icon` | plugin.json | 🟢 Low | Optional branding |
| `email`/`url` in `author`/`owner` | both files | 🟢 Low | Author contact info incomplete |

### Best Practice Violations

| Issue | Severity | Details |
|---|---|---|
| Inconsistent descriptions | 🟡 Medium | Three different description strings across the two files |
| Tags/keywords misalignment | 🟡 Medium | marketplace tags ≠ plugin keywords; missing `"openai"` in tags |
| No minimum version gating | 🟡 Medium | README says omc v4.4.0+ required but this isn't declared in config |
| No `.gitignore` concern for `.claude-plugin/` | ℹ️ Info | Verified: `.claude/` pattern in `.gitignore` does NOT match `.claude-plugin/` — git treats the trailing `/` as an exact directory name match. Files are properly tracked. ✅ |

---

## Severity Summary

| Severity | Count | Items |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 4 | Missing `engines`, inconsistent descriptions, tags/keywords mismatch, no min version gating |
| 🟢 Low | 5 | Missing readme/changelog/icon/author-url, missing automation tag |
| ℹ️ Info | 1 | Tags vs keywords difference explanation |

---

## Overall Rating: **A-**

The plugin configuration is solid with valid JSON, consistent versioning, correct path references, and good marketplace metadata. The `.gitignore` is correctly scoped — `.claude/` does not match `.claude-plugin/`. The main improvements would be:

1. **🟡 Description consistency** — pick one canonical description and use it everywhere.
2. **🟡 Engine declaration** — declare minimum omc/pi versions in `plugin.json`.
3. **🟡 Tag completeness** — add `"openai"` to marketplace tags.
4. **🟡 Tags/keywords alignment** — reconcile the 10 keywords in plugin.json with the 6 tags in marketplace.json.
