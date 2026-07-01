#!/usr/bin/env bash
#
# prepare-for-upstream.sh
# Creates a clean copy of all branch changes on a fresh branch from
# sentinel-upstream/Main, excluding internal dev files.
#
# Usage:
#   bash .agents/skills/prepare-for-upstream/scripts/prepare-for-upstream.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FORK_REMOTE="myfork"
UPSTREAM_REMOTE="sentinel-upstream"

# Internal files to exclude from upstream (pathspec format for git diff)
EXCLUDE_DIFF=(
  ":(exclude).agents"
  ":(exclude).opencode"
  ":(exclude).specify"
  ":(exclude)specs"
  ":(exclude)AGENTS.md"
  ":(exclude).env"
  ":(exclude).gitignore"
  ":(exclude)coverage"
  ":(exclude)supabase"
  ":(exclude)playwright-report"
)

# Files that must NOT appear in the final upstream commit
EXCLUDE_LEAK_CHECK=(.agents .opencode .specify specs AGENTS.md)

echo -e "${YELLOW}🔧 Preparing for upstream submission...${NC}"

# ── Step 1: Verify current state ──────────────────────────────────────────

CURRENT_BRANCH=$(git branch --show-current)
CURRENT_COMMIT=$(git rev-parse --short HEAD)
CURRENT_MSG=$(git log -1 --format=%s)
CURRENT_BODY=$(git log -1 --format=%b)

echo -e "\n${YELLOW}📋 Step 1: Current state${NC}"
echo "  Branch: $CURRENT_BRANCH"
echo "  Commit: $CURRENT_COMMIT - $CURRENT_MSG"

if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  echo -e "${RED}❌ Remote '$UPSTREAM_REMOTE' not found${NC}"
  exit 1
fi
if ! git remote get-url "$FORK_REMOTE" &>/dev/null; then
  echo -e "${RED}❌ Remote '$FORK_REMOTE' not found${NC}"
  exit 1
fi

# ── Step 2: Create clean branch from upstream ─────────────────────────────

UPSTREAM_BRANCH="upstream/$CURRENT_BRANCH"

echo -e "\n${YELLOW}🌿 Step 2: Creating clean branch from $UPSTREAM_REMOTE/Main...${NC}"

git fetch "$UPSTREAM_REMOTE" Main
git branch -D "$UPSTREAM_BRANCH" 2>/dev/null || true
git checkout -b "$UPSTREAM_BRANCH" "$UPSTREAM_REMOTE/Main"
echo "  Created: $UPSTREAM_BRANCH"

# ── Step 3: Apply clean diff (exclude internal files at pathspec level) ──

echo -e "\n${YELLOW}📦 Step 3: Applying clean diff...${NC}"

git diff "$UPSTREAM_REMOTE/Main"..."$CURRENT_BRANCH" -- . "${EXCLUDE_DIFF[@]}" > /tmp/up-diff.patch

if [[ ! -s /tmp/up-diff.patch ]]; then
  echo -e "${YELLOW}⚠️  No changes after excluding internal files${NC}"
  git checkout "$CURRENT_BRANCH"
  rm -f /tmp/up-diff.patch
  exit 0
fi

echo "  Patch: $(wc -l < /tmp/up-diff.patch) lines"

git apply --3way /tmp/up-diff.patch 2>/dev/null \
  || git apply /tmp/up-diff.patch 2>/dev/null \
  || { echo -e "${RED}❌ Failed to apply diff${NC}"; git checkout "$CURRENT_BRANCH"; rm -f /tmp/up-diff.patch; exit 1; }

rm -f /tmp/up-diff.patch
echo "  Applied diff"

# ── Step 4: Stage and commit ──────────────────────────────────────────────

echo -e "\n${YELLOW}📝 Step 4: Committing changes...${NC}"

git add -A
if git diff --cached --quiet; then
  echo -e "${YELLOW}⚠️  No changes to commit${NC}"
  git checkout "$CURRENT_BRANCH"
  exit 0
fi

if [[ -n "$CURRENT_BODY" ]]; then
  git commit -m "$CURRENT_MSG" -m "$CURRENT_BODY"
else
  git commit -m "$CURRENT_MSG"
fi

FINAL_COMMIT=$(git rev-parse --short HEAD)
echo "  Committed: $FINAL_COMMIT"

# ── Step 5: Verify no internal files leaked ───────────────────────────────

echo -e "\n${YELLOW}🔍 Step 5: Verifying no internal files...${NC}"

LEAKED=""
for pattern in "${EXCLUDE_LEAK_CHECK[@]}"; do
  if git ls-tree -r --name-only "$FINAL_COMMIT" -- "$pattern" 2>/dev/null | grep -q .; then
    LEAKED="$LEAKED $pattern"
  fi
done

if [[ -n "$LEAKED" ]]; then
  echo -e "${RED}❌ Internal files leaked:$LEAKED${NC}"
  echo "  Removing and amending..."
  for pattern in $LEAKED; do
    git rm -r --cached --quiet "$pattern" 2>/dev/null || true
  done
  git commit --amend --no-edit
  echo "  Fixed"
else
  echo "  ✅ No internal files present"
fi

# ── Step 6: Push to fork ─────────────────────────────────────────────────

echo -e "\n${YELLOW}🚀 Step 6: Pushing to $FORK_REMOTE...${NC}"

git push "$FORK_REMOTE" "$UPSTREAM_BRANCH" --force 2>&1 || {
  echo -e "${RED}❌ Push failed${NC}"
  exit 1
}

# ── Summary ───────────────────────────────────────────────────────────────

FINAL_COMMIT=$(git rev-parse --short HEAD)
CHANGED_COUNT=$(git diff --stat "$UPSTREAM_REMOTE/Main" 2>/dev/null | tail -1 | awk '{print $1}' || echo "N/A")

echo -e "\n${GREEN}✅ Clean branch created: $UPSTREAM_BRANCH${NC}"
echo ""
echo "  Branch:  $UPSTREAM_BRANCH"
echo "  Commit:  $FINAL_COMMIT - $CURRENT_MSG"
echo "  Files:   $CHANGED_COUNT files changed"
echo "  Pushed:  $FORK_REMOTE/$UPSTREAM_BRANCH"
echo ""
echo "Next: Create PR at:"
echo "  https://github.com/National-Wildfire-Tracking-Team/Sentinel-/compare/Main...Leo-webdev7:$UPSTREAM_BRANCH"

git checkout "$CURRENT_BRANCH" 2>/dev/null || true
