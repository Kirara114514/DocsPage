#!/bin/sh
# 自动更新脚本：由服务器 cron 每分钟调用
# 检查 DocsPage 与 Tech-Docs 远端更新，有则拉取；文档更新后重建索引

set -u

cd /www/wwwroot/yanglei.asia || exit 1

# 网站仓库
git fetch origin main 2>/dev/null
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    git pull --ff-only
fi

# 文档仓库
cd Tech-Docs || exit 1
git fetch origin main 2>/dev/null
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    git pull --ff-only
    cd ..
    python3 generator-new.py
else
    cd ..
fi
