#!/usr/bin/env node
// Update pi settings.json defaultProvider/defaultModel (only if missing)
// Usage: node update-pi-settings.js <provider> <model>
const fs = require('fs');
const path = require('path');
const settingsPath = path.join(process.env.HOME, '.pi/agent/settings.json');
try {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }
  const provider = process.argv[2];
  const model = process.argv[3];
  if (!settings.defaultProvider) settings.defaultProvider = provider;
  if (!settings.defaultModel) settings.defaultModel = model;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  fs.chmodSync(settingsPath, 0o600);
} catch (e) {
  console.error('Error updating settings.json:', e.message);
  process.exit(1);
}
