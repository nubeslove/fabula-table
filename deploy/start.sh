#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo '需要 Node.js 20 或更新版本。请先安装服务器发行版提供的 Node.js。' >&2
  exit 1
fi
node -e "if(Number(process.versions.node.split('.')[0])<20) process.exit(1)" || { echo 'Node.js 版本必须至少为 20'; exit 1; }
if [ -f .env ]; then set -a; source ./.env; set +a; fi
export FU_DATA_DIR="${FU_DATA_DIR:-$PWD/data}"
export FU_PUBLIC_DIR="$PWD/app/public"
export FU_HOST="${FU_HOST:-127.0.0.1}"
export FU_PORT="${FU_PORT:-3340}"
exec node app/server.mjs
