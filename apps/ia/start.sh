#!/usr/bin/env bash
# ==============================================================================
# BellumAI IA Service - Start Script
# ==============================================================================
#
# Usage:
#   ./start.sh              # Development mode (uvicorn --reload)
#   ./start.sh --prod       # Production mode
#   ./start.sh --help       # Show help
#
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [[ -f "dev.env.sh" ]]; then
    source dev.env.sh
fi

# Activate venv if exists
if [[ -d ".venv" ]]; then
    source .venv/bin/activate
fi

# Install/update dependencies (quick check with pip)
pip install -q -r requirements.txt 2>/dev/null || pip install -r requirements.txt

# Parse arguments
MODE="${1:---dev}"

case "$MODE" in
    --prod)
        echo "→ Starting IA service in production mode..."
        uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
        ;;
    --help)
        echo "Usage: ./start.sh [--dev|--prod|--help]"
        echo ""
        echo "  --dev   Development mode with auto-reload (default)"
        echo "  --prod  Production mode with 4 workers"
        echo "  --help  Show this help"
        ;;
    *)
        echo "→ Starting IA service in development mode..."
        uvicorn app.main:app --reload --port 8000
        ;;
esac
