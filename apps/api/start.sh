#!/usr/bin/env bash
# ==============================================================================
# BellumAI API - Start Script
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [[ -f "dev.env.sh" ]]; then
    source dev.env.sh
fi

export NODE_ENV="${NODE_ENV:-development}"
export NODE_OPTIONS="--max-old-space-size=8192 --expose-gc"

exec nest start --watch
