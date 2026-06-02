#!/bin/sh
# Tech-Docs Webhook 处理器
# 每分钟检查是否有更新请求

set -u

REPO_PATH="/www/wwwroot/yanglei.asia/Tech-Docs"
WWW_ROOT="/www/wwwroot/yanglei.asia"
TRIGGER_FILE="$WWW_ROOT/.webhook_trigger"
LOG_FILE="$WWW_ROOT/webhook.log"
LOCK_FILE="$WWW_ROOT/.webhook_processing"

# 使用绝对路径的命令
GIT_CMD="/usr/bin/git"
PYTHON_CMD="/usr/bin/python3"
RM_CMD="/usr/bin/rm"
PS_CMD="/usr/bin/ps"
ECHO_CMD="/usr/bin/echo"
DATE_CMD="/usr/bin/date"
CAT_CMD="/usr/bin/cat"

# 设置代理（使用服务器的 Clash 代理）
GIT_PROXY="http://127.0.0.1:7890"

log() {
    $ECHO_CMD "[$($DATE_CMD)] $1" >> "$LOG_FILE"
}

cleanup() {
    $RM_CMD -f "$LOCK_FILE"
}

if [ ! -f "$TRIGGER_FILE" ]; then
    exit 0
fi

if [ -f "$LOCK_FILE" ]; then
    PID=$($CAT_CMD "$LOCK_FILE" 2>/dev/null)
    if [ -n "${PID:-}" ] && $PS_CMD -p "$PID" > /dev/null 2>&1; then
        log "Another process is running, skip"
        exit 0
    fi
fi

$ECHO_CMD $$ > "$LOCK_FILE"
trap cleanup EXIT

log "Processing webhook trigger..."
$RM_CMD -f "$TRIGGER_FILE"

cd "$REPO_PATH" || {
    log "Failed to enter repo path: $REPO_PATH"
    exit 1
}

# 使用 fetch + reset --hard，永远以云端为准
FETCH_OUTPUT=$($GIT_CMD -c http.proxy="$GIT_PROXY" -c https.proxy="$GIT_PROXY" fetch origin main 2>&1)
FETCH_STATUS=$?
log "Git fetch result: $FETCH_STATUS"
$ECHO_CMD "$FETCH_OUTPUT" >> "$LOG_FILE"

if [ "$FETCH_STATUS" -ne 0 ]; then
    log "Git fetch failed, aborting current webhook run"
    exit "$FETCH_STATUS"
fi

# 强制重置到远程状态，丢弃本地所有修改
RESET_OUTPUT=$($GIT_CMD reset --hard origin/main 2>&1)
RESET_STATUS=$?
log "Git reset result: $RESET_STATUS"
$ECHO_CMD "$RESET_OUTPUT" >> "$LOG_FILE"

if [ "$RESET_STATUS" -ne 0 ]; then
    log "Git reset failed, aborting current webhook run"
    exit "$RESET_STATUS"
fi

cd "$WWW_ROOT" || {
    log "Failed to enter www root: $WWW_ROOT"
    exit 1
}

GEN_OUTPUT=$($PYTHON_CMD generator-new.py --webhook 2>&1)
GEN_STATUS=$?
log "Generator result: $GEN_STATUS"
$ECHO_CMD "$GEN_OUTPUT" >> "$LOG_FILE"

if [ "$GEN_STATUS" -ne 0 ]; then
    log "Generator failed, index.json was not refreshed"
    exit "$GEN_STATUS"
fi

log "Webhook processing completed"