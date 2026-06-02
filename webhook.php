<?php
/**
 * Tech-Docs GitHub Webhook Receiver (标记文件版本)
 * Secret: KiraTechDocsUpdated
 */

$secret = 'KiraTechDocsUpdated';
$triggerFile = '/www/wwwroot/yanglei.asia/.webhook_trigger';
$logFile = '/www/wwwroot/yanglei.asia/webhook.log';

// 获取 headers
function getHeaders() {
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') === 0) {
            $header = str_replace('_', '-', substr($key, 5));
            $headers[$header] = $value;
        }
    }
    return $headers;
}

$headers = getHeaders();
$signature = isset($headers['X-HUB-SIGNATURE-256']) ? $headers['X-HUB-SIGNATURE-256'] : '';
$event = isset($headers['X-GITHUB-EVENT']) ? $headers['X-GITHUB-EVENT'] : '';

// 验证签名
$payload = file_get_contents('php://input');
$expectedSignature = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expectedSignature, $signature)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// 只处理 push 事件
if ($event !== 'push') {
    header('Content-Type: application/json');
    echo json_encode(['message' => 'Event ignored: ' . $event]);
    exit;
}

// 记录日志
function logMsg($msg) {
    global $logFile;
    $time = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[$time] $msg\n", FILE_APPEND);
}

// 创建触发标记文件（写入当前时间）
$time = time();
file_put_contents($triggerFile, $time);
logMsg("Push received, trigger file created at " . date('Y-m-d H:i:s', $time));

// 返回成功
http_response_code(200);
header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'message' => 'Update queued. Will process within 1 minute.',
    'timestamp' => $time
]);
