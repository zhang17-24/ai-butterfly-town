#!/usr/bin/env bash
# 一键推送 GitHub(apps/server/.env 不入库;用 zhang17-24 的 ssh 密钥)
# 前置:在 github.com 创建同名空仓库.ai-butterfly-town(或提供 GITHUB_TOKEN 后去掉 mkdir 注释)。
#   gh repo create zhang17-24/ai-butterfly-town --private --source . --push
# GITHUB_TOKEN=xxx gh ...  用 API 建仓:
set -euo pipefail
cd "$(dirname "$0")/.."
export GIT_SSH_COMMAND="ssh -i ~/.ssh/github_omp -o StrictHostKeyChecking=no"
git remote remove origin 2>/dev/null || true
git remote add origin git@github.com:zhang17-24/ai-butterfly-town.git
git branch -M main
git push -u origin main
echo "已推送.ssh 密钥认证作为 zhang17-24."
