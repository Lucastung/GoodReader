#!/bin/bash
# 雙擊執行：從維基文庫收集範文到 data/collected/
cd "$(dirname "$0")/.." || exit 1
node scripts/collect-wikisource.mjs "$@"
echo
read -n 1 -s -r -p "按任意鍵關閉…"
