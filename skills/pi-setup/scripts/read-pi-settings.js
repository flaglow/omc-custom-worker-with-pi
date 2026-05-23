#!/usr/bin/env node
// Read pi settings.json with secret redaction
// Usage: node read-pi-settings.js
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.env.HOME, '.pi/agent/settings.json');

function isSecretKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'key' ||
    normalized.includes('apikey') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('credential') ||
    normalized.includes('authorization');
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isSecretKey(key) ? '<redacted>' : redact(child)
    ])
  );
}

try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  console.log(JSON.stringify(redact(settings), null, 2));
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error('~/.pi/agent/settings.json not found');
    process.exit(0);
  }
  console.error('Error reading settings.json:', e.message);
  process.exit(1);
}
