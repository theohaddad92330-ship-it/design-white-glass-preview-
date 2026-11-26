#!/bin/bash
# usage: .scratch-run.sh logname spec1 spec2 ...
S=/private/tmp/claude-501/-Users-louisschlegel-Desktop-belllum-monorepo/731bc06d-999b-4a76-81d3-e957e43c8585/scratchpad
name=$1; shift
cd /Users/louisschlegel/Desktop/belllum-monorepo/.claude/worktrees/agent-a4716f454fe8853ad/apps/api
rtk proxy npx jest "$@" --maxWorkers=2 > $S/$name.log 2>&1
grep -E "^(PASS|FAIL)|Tests:" $S/$name.log
grep -E "●.*›|^  ● " $S/$name.log | sort -u | cut -c1-240
