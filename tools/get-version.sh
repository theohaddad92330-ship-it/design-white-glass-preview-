#!/usr/bin/env bash
#
# Compute the current build version string for `apps/web`.
#
# Format (target = package): YY.MM.DD-tsUNIX+gitSHA10
#   e.g. 26.05.01-ts1746091200+git1a2b3c4d5e
#
# Format (target = docker): same string with `+` replaced by `-`
#   (Docker tags forbid `+`).
#
# The web app reads this version at build time via the Vite `define`
# `__CODE_VERSION_ID__`, and writes a matching `latest-version.json`
# served from the deploy. The runtime hook
# (`apps/web/src/lib/hooks/use-application-update.ts`) compares the two to
# detect that a new deploy is live.
#
# Usage:
#   tools/compute-version.sh           # defaults to "package"
#   tools/compute-version.sh package
#   tools/compute-version.sh docker

set -euo pipefail

target="${1:-package}"

if [[ "$target" != "package" && "$target" != "docker" ]]; then
  echo "Target must be 'package' or 'docker'" >&2
  exit 1
fi

# Fallback when not in a git repo (e.g. Vercel CLI deploys with shallow clone).
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  fallback_version="0.0.0-preview"
  echo -n "$fallback_version"
  exit 0
fi

last_commit_sha=$(git rev-parse --short=10 HEAD)
last_commit_timestamp=$(git show -s --format=%ct "$last_commit_sha")

date_timestamp_flags=()
case "$(uname -s)" in
  Linux*)  date_timestamp_flags=(-d "@$last_commit_timestamp") ;;
  Darwin*) date_timestamp_flags=(-r "$last_commit_timestamp") ;;
  *)       echo "Only Linux and macOS are supported" >&2; exit 1 ;;
esac

formatted_version=$(TZ=Europe/Paris date "${date_timestamp_flags[@]}" +"%y.%m.%d-ts%s+git$last_commit_sha")

if [[ "$target" == "docker" ]]; then
  # Docker tags cannot contain `+`.
  echo -n "${formatted_version//+/-}"
else
  echo -n "$formatted_version"
fi
