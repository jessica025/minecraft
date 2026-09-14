#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p work
exec > >(tee work/local-release-verification.log) 2>&1
printf '方境发布验证：安装依赖、浏览器，执行全部检查。\n'
npm ci
npx playwright install chromium firefox webkit
npm run release:check
printf '\n全部自动检查通过。报告：playwright-report/index.html\n'
