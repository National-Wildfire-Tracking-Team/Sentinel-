---
name: prepare-for-upstream
description: Prepare current branch for upstream submission. Creates a cleaned copy of the current commit on a fresh branch from sentinel-upstream/Main, excluding internal files (.specify, .agents, .opencode, specs, AGENTS.md). Use when ready to create a PR to sentinel-upstream.
---

# Prepare for Upstream

Strips internal development files from the current branch and prepares a clean copy for PR submission to the upstream repository (`sentinel-upstream`).

## When to Use

Use this skill when the current branch has completed work (squashed commit) and is ready to be pushed to the public repository as a PR.

## What It Does

1. Creates a new branch from `sentinel-upstream/Main`
2. Cherry-picks the tip commit from the current branch
3. Removes excluded internal files from the commit
4. Amends the commit with the clean tree
5. Pushes to `myfork` (private fork) for PR creation

## Internal Files Excluded

| Pattern | Description |
|---------|-------------|
| `.agents/` | Agent skills and configurations |
| `.opencode/` | Opencode skills and configurations |
| `.specify/` | SpecKit configuration and memory |
| `specs/` | Feature specifications and planning documents |
| `AGENTS.md` | Agent context file |
| `.env` | Environment files (except .env.example) |
| `coverage/` | Test coverage reports |
| `*.log` | Log files |

## Steps

1. **Verify current state**: Confirm the branch has exactly one commit ready for upstream
2. **Run the script**: Execute `.agents/skills/prepare-for-upstream/scripts/prepare-for-upstream.sh`
3. **Verify the result**: Check the new branch is clean with no internal files
4. **Create PR**: Use the GitHub URL from the script output to open a PR

## Script

The script at `scripts/prepare-for-upstream.sh` handles the full workflow. It accepts no arguments — it derives the branch name and commit message from the current state.

## Expected Output

```
🔧 Preparing for upstream submission...
📋 Step 1: Current branch: 004-fix-evacuation-zones
🌿 Step 2: Creating clean branch from sentinel-upstream/Main...
📦 Step 3: Cherry-picking commit: fix: evacuation zones layer...
🧹 Step 4: Removing internal files...
📝 Step 5: Amending commit...
🚀 Step 6: Pushing to myfork...

✅ Clean branch created: upstream/004-fix-evacuation-zones
   Commit: abc1234 - fix: evacuation zones layer...
   Excluded: .agents/ .opencode/ .specify/ specs/ AGENTS.md
   Pushed to: myfork/upstream/004-fix-evacuation-zones

Next: Create PR at https://github.com/National-Wildfire-Tracking-Team/Sentinel-/compare/Main...Leo-webdev7:upstream/004-fix-evacuation-zones
```

## Excluded File Patterns

```gitignore
# Opencode
.opencode/

# SpecKit
.specify/
specs/

# Agents
.agents/
AGENTS.md

# Environment
.env

# Development artifacts
coverage/
*.log
```
