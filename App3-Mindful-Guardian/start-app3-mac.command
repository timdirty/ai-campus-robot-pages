#!/bin/bash
# App 3 AI 校園心靈守護者 — Mac 一鍵啟動

cd "$(dirname "$BASH_SOURCE")" || {
  echo "無法切換到專案目錄"
  read -r
  exit 1
}

echo ""
echo "=============================================="
echo "  App 3 AI 校園心靈守護者 - Mac 啟動器"
echo "=============================================="
echo ""

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    echo "Node.js $(node --version) 已就緒"
    return 0
  fi

  echo "找不到 Node.js，嘗試自動安裝..."
  if command -v brew >/dev/null 2>&1; then
    brew install node
  else
    echo "找不到 Homebrew，請先安裝 Node.js 20+：https://nodejs.org/"
    open "https://nodejs.org/"
    read -rp "安裝完成後按 Enter 重新啟動..."
    exit 1
  fi
}

ensure_python() {
  if command -v python3 >/dev/null 2>&1; then
    echo "Python $(python3 --version 2>&1) 已就緒"
    return 0
  fi

  echo "找不到 Python，嘗試自動安裝..."
  if command -v brew >/dev/null 2>&1; then
    brew install python
  else
    echo "找不到 Homebrew，YOLO / 情緒掃描會在沒有 Python 時改用備援。"
  fi
}

ensure_node
ensure_python

node scripts/start-app3.mjs

echo ""
echo "App3 已停止。"
read -rp "按 Enter 關閉視窗..."
