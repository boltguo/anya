#!/bin/bash
# sync.sh — Bidirectional skill sync between source and ~/.anya/skills/
#
# Usage:
#   ./sync.sh push    Push local skills → ~/.anya/skills/, then build & restart
#   ./sync.sh pull    Pull ~/.anya/skills/ → local src/skills/bundled/
#
# push is the deploy path  (dev → runtime)
# pull is the recover path (runtime → dev)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
LOCAL_SKILLS="$PROJECT_DIR/src/skills/bundled"
SYSTEM_SKILLS="$HOME/.anya/skills"

# Ensure node is on PATH (nvm)
export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"

usage() {
  echo "Usage: $0 <push|pull>"
  echo ""
  echo "  push   Sync local skills → ~/.anya/skills/  (deploy)"
  echo "  pull   Sync ~/.anya/skills/ → local skills   (recover)"
  exit 1
}

do_push() {
  echo "📤 Push: local → system"
  echo "   From: $LOCAL_SKILLS"
  echo "   To:   $SYSTEM_SKILLS"
  echo ""

  mkdir -p "$SYSTEM_SKILLS"
  rsync -av --delete "$LOCAL_SKILLS/" "$SYSTEM_SKILLS/"
  echo ""
  echo "✓ Skills pushed"

  # Typecheck first — fail fast on compile errors
  echo ""
  echo "🔍 Type checking..."
  cd "$PROJECT_DIR"
  pnpm typecheck || { echo "❌ Type errors found. Fix them before deploying."; exit 1; }

  # Build
  echo ""
  echo "🔨 Building..."
  npx tsup --no-dts 2>&1 | tail -1

  # Restart gateway
  echo ""
  echo "🔄 Restarting gateway..."
  node dist/bin/anya.js gateway restart

  echo ""
  echo "✅ Push complete"
}

do_pull() {
  echo "📥 Pull: system → local"
  echo "   From: $SYSTEM_SKILLS"
  echo "   To:   $LOCAL_SKILLS"
  echo ""

  if [ ! -d "$SYSTEM_SKILLS" ]; then
    echo "❌ System skills directory not found: $SYSTEM_SKILLS"
    echo "   Run 'anya init' first."
    exit 1
  fi

  mkdir -p "$LOCAL_SKILLS"
  rsync -av --delete "$SYSTEM_SKILLS/" "$LOCAL_SKILLS/"
  echo ""
  echo "✅ Pull complete — local skills updated from system"
}

# ── Main ──

case "${1:-}" in
  push)  do_push ;;
  pull)  do_pull ;;
  *)     usage ;;
esac
