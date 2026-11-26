#!/bin/bash
set -e

# ============================================================
# BellumAI — Initial setup
#
# Usage:
#   pnpm setup
#
# What it does:
#   1. Install Node dependencies (pnpm)
#   2. Create Python venv for apps/ia
#   3. Bootstrap .env files from .env.example
# ============================================================

echo "=== BellumAI — Setup ==="

# 1. Node dependencies
echo "→ Installing Node dependencies..."
pnpm install

# 2. Python venv
echo "→ Setting up Python venv for apps/ia..."
if [ ! -d "apps/ia/.venv" ]; then
  python3 -m venv apps/ia/.venv
fi
apps/ia/.venv/bin/pip install -q -r apps/ia/requirements.txt

# 3. Bootstrap .env files
echo "→ Checking .env files..."
for app in api web ia; do
  if [ -f "apps/$app/.env.example" ] && [ ! -f "apps/$app/.env" ]; then
    cp "apps/$app/.env.example" "apps/$app/.env"
    echo "  ✓ Created apps/$app/.env from .env.example"
    echo "    → Fill in your secrets before running pnpm dev"
  fi
done

# 4. Bootstrap dev.secret.sh
if [ -f "tools/dev.secret.sh.example" ] && [ ! -f "tools/dev.secret.sh" ]; then
  cp "tools/dev.secret.sh.example" "tools/dev.secret.sh"
  echo "  ✓ Created tools/dev.secret.sh from example"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Fill in your API keys in apps/api/.env and apps/ia/.env"
echo "  2. Run: pnpm dev"
