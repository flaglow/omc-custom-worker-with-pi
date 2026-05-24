#!/usr/bin/env node
// Read pi settings.json with secret redaction
// Usage: node read-pi-settings.js
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.env.HOME, '.pi/agent/settings.json');

function isSecretKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.includes('apikey') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('credential') ||
    normalized.includes('authorization') ||
    normalized.includes('accesskey') ||
    normalized.includes('privatekey') ||
    normalized.includes('bearer');
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  const entries = Object.entries(value);
  const normalizedKeys = entries.map(([key]) => String(key).toLowerCase().replace(/[^a-z0-9]/g, ''));
  // Sibling keys suggesting a credentials context
  const inCredContext = normalizedKeys.some(k =>
    k.includes('provider') || k.includes('id') || k.includes('user') || k.includes('account') || k.includes('cred')
  );

  return Object.fromEntries(
    entries.map(([key, child], index) => {
      const normalized = normalizedKeys[index];
      const shouldRedact = isSecretKey(key) || (normalized === 'key' && inCredContext);
      return [
        key,
        shouldRedact ? '<redacted>' : redact(child)
      ];
    })
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
