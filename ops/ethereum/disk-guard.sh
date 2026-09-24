#!/usr/bin/env bash
set -euo pipefail

data_dir=/var/lib/graphus/ethereum
max_use_percent=85
use_percent=$(df -P "$data_dir" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }')
if [[ ! "$use_percent" =~ ^[0-9]+$ ]]; then
  echo "Cannot read disk usage for $data_dir" >&2
  exit 1
fi

if (( use_percent >= max_use_percent )); then
  echo "Disk usage ${use_percent}% reached ${max_use_percent}%: stopping graphus-erigon" >&2
  if docker container inspect graphus-erigon >/dev/null 2>&1; then
    docker stop graphus-erigon
  fi
  exit 2
fi

echo "Graphus Ethereum disk usage: ${use_percent}% (stop threshold ${max_use_percent}%)"
