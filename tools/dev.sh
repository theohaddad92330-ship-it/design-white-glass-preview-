#!/bin/bash
set -euo pipefail

# ==============================================================================
# BellumAI — Dev Environment
# ==============================================================================
#
# Usage:
#   pnpm dev           # Interactive menu
#   pnpm dev dev       # Start dev servers only
#   pnpm dev infra     # Start infrastructure (Postgres + Supabase Studio + Redis)
#   pnpm dev full      # Start infra + dev servers
#   pnpm dev stop      # Stop infrastructure
#   pnpm dev reset     # Reset database + re-seed
#   pnpm dev ps        # View running containers
#
# ==============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

cd "${PROJECT_ROOT}"

# ==============================================================================
# Helper Functions
# ==============================================================================

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║           BellumAI — Dev Environment                     ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_dependencies() {
    local missing=()

    if ! command -v node &> /dev/null; then missing+=("node"); fi
    if ! command -v pnpm &> /dev/null; then missing+=("pnpm"); fi
    if ! command -v python3 &> /dev/null; then missing+=("python3"); fi
    if ! command -v docker &> /dev/null; then missing+=("docker"); fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}Missing dependencies: ${missing[*]}${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Dependencies OK${NC}"
}

load_env() {
    if [[ -f "${SCRIPT_DIR}/dev.secret.sh" ]]; then
        source "${SCRIPT_DIR}/dev.secret.sh"
        echo -e "${GREEN}✓ Environment loaded${NC}"
    else
        echo -e "${YELLOW}⚠ dev.secret.sh not found${NC}"
        echo "  Copy dev.secret.sh.example to dev.secret.sh and fill in your values."
    fi
}

# ==============================================================================
# Infrastructure
# ==============================================================================

start_infra() {
    echo -e "${BLUE}Starting infrastructure...${NC}"
    docker compose -f "$COMPOSE_FILE" up -d

    echo ""
    echo -e "${GREEN}✓ Infrastructure running${NC}"
    echo "  Postgres:         localhost:5432"
    echo "  Supabase API:     http://localhost:54321"
    echo "  Supabase Auth:    http://localhost:54321/auth/v1/"
    echo "  Supabase Studio:  http://localhost:3001"
    echo "  Mailpit (SMTP):   localhost:1025"
    echo "  Mailpit (UI):     http://localhost:8025"
    echo "  Redis:            localhost:6379"
}

stop_infra() {
    echo -e "${BLUE}Stopping infrastructure...${NC}"
    docker compose -f "$COMPOSE_FILE" down
    echo -e "${GREEN}✓ Infrastructure stopped${NC}"
}

reset_db() {
    "${SCRIPT_DIR}/db-reset.sh"
}

# ==============================================================================
# Dev Servers
# ==============================================================================

ensure_infra_running() {
    if ! docker info &> /dev/null; then
        echo -e "${YELLOW}⚠ Docker is not running${NC}"
        return 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "bellum-postgres"; then
        echo -e "${YELLOW}⚠ Infrastructure not running — starting it now...${NC}"
        start_infra
        echo ""
        echo -e "${BLUE}Waiting for services to be healthy...${NC}"
        sleep 5
    else
        echo -e "${GREEN}✓ Infrastructure already running${NC}"
    fi
}

start_dev() {
    ensure_infra_running

    if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
        echo -e "${BLUE}Installing dependencies...${NC}"
        pnpm install
    fi

    echo ""
    echo "  Frontend (web):   http://localhost:5173"
    echo "  Website:          http://localhost:3004"
    echo "  Backend (api):    http://localhost:3000"
    echo "  IA service:       http://localhost:8000"
    echo "  Email preview:    http://localhost:3010"
    echo "  Supabase Studio:  http://localhost:3001"
    echo "  Mailpit (UI):     http://localhost:8025"
    echo ""

    pnpm turbo dev
}

start_full() {
    start_infra
    echo ""
    echo -e "${BLUE}Waiting for services to be healthy...${NC}"
    sleep 5
    start_dev
}

# ==============================================================================
# Menu
# ==============================================================================

show_menu() {
    echo "What would you like to do?"
    echo ""
    echo "  1) Start full stack (Postgres + Supabase Studio + Mailpit + Redis + dev servers)"
    echo "  2) Start infrastructure only (Postgres + Supabase Studio + Mailpit + Redis)"
    echo "  3) Start dev servers only"
    echo "  4) Stop infrastructure"
    echo "  5) Reset database (migrations + seed)"
    echo "  6) View running containers"
    echo ""
    read -rp "Enter choice (1-6): " choice

    case $choice in
        1) start_full ;;
        2) start_infra ;;
        3) start_dev ;;
        4) stop_infra ;;
        5) reset_db ;;
        6) docker compose -f "$COMPOSE_FILE" ps ;;
        *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
    esac
}

# ==============================================================================
# Main
# ==============================================================================

print_header
check_dependencies
load_env

case "${1:-}" in
    dev)    start_dev ;;
    infra)  start_infra ;;
    full)   start_full ;;
    stop)   stop_infra ;;
    reset)  reset_db ;;
    ps)     docker compose -f "$COMPOSE_FILE" ps ;;
    *)      show_menu ;;
esac
