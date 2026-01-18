<?php
// Simple local proxy for BidCars API.
// Usage: proxy.php?url=https://bid.cars/app/search/request?... 

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$url = $_GET['url'] ?? '';
if (!is_string($url) || $url === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

$parsed = parse_url($url);
if (!$parsed || empty($parsed['scheme']) || empty($parsed['host'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid url']);
    exit;
}

if (!in_array($parsed['scheme'], ['http', 'https'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unsupported scheme']);
    exit;
}

// Optional: restrict to bid.cars host
if (!preg_match('/(^|\.)bid\.cars$/i', $parsed['host'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Host not allowed']);
    exit;
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json, text/plain, */*',
        'X-Requested-With: XMLHttpRequest',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
    ],
]);

$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$error = curl_error($ch);
curl_close($ch);

if ($body === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Proxy request failed', 'detail' => $error]);
    exit;
}

if ($httpCode) {
    http_response_code($httpCode);
}

if ($contentType) {
    header('Content-Type: ' . $contentType);
} else {
    header('Content-Type: application/json');
}

echo $body;
