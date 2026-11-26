#!/bin/bash
# ============================================================
# IA — Load environment variables for local development
#
# Sourced before starting the IA service.
# Loads secrets from tools/dev.secret.sh at the project root.
# ============================================================

# Get the directory of this script and resolve to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck disable=SC1091
if [[ -f "${PROJECT_ROOT}/tools/dev.secret.sh" ]]; then
    source "${PROJECT_ROOT}/tools/dev.secret.sh"
else
    echo "WARNING: ${PROJECT_ROOT}/tools/dev.secret.sh not found!"
    echo "Copy tools/dev.secret.sh.example to tools/dev.secret.sh and fill in your values."
fi
