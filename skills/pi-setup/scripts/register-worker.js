#!/usr/bin/env node
// Register a pi worker in ~/.claude/pi-workers.json
// Usage: node register-worker.js <worker-name> <provider> <model>
const fs = require('fs');
const path = require('path');
const os = require('os');

const configPath = path.join(process.env.HOME, '.claude/pi-workers.json');
const workerName = process.argv[2];
const provider = process.argv[3];
const model = process.argv[4];

const RESERVED_SUFFIXES = ['claude', 'codex', 'gemini'];

// Validate worker name format
if (!workerName || !/^pi-[a-z0-9][a-z0-9-]*$/.test(workerName)) {
  console.error('Invalid worker name: must match ^pi-[a-z0-9][a-z0-9-]*$');
  process.exit(1);
}
if (RESERVED_SUFFIXES.includes(workerName.slice(3))) {
  console.error('Worker name suffix is reserved: ' + workerName.slice(3));
  process.exit(1);
}
if (!provider || typeof provider !== 'string' || !provider.trim()) {
  console.error('Provider must be a non-empty string');
  process.exit(1);
}
if (!model || typeof model !== 'string' || !model.trim()) {
  console.error('Model must be a non-empty string');
  process.exit(1);
}

try {
  let config = { version: 1, workers: {} };
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    if (raw.trim()) {
      config = JSON.parse(raw);
      if (typeof config.version === 'undefined') {
        console.error('Invalid pi-workers.json: missing version field');
        process.exit(1);
      }
      if (typeof config.workers !== 'object' || config.workers === null || Array.isArray(config.workers)) {
        console.error('Invalid pi-workers.json: workers must be an object');
        process.exit(1);
      }
    }
  }

  if (config.workers[workerName]) {
    console.warn('WARNING: Worker "' + workerName + '" already exists. Overwriting.');
  }

  if (!config.workers) config.workers = {};
  config.workers[workerName] = {
    provider,
    model,
    binary: 'pi',
    createdAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmpPath = path.join(os.tmpdir(), 'pi-workers-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.tmp');
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n');
  fs.chmodSync(tmpPath, 0o600);
  fs.renameSync(tmpPath, configPath);
  console.log('Successfully registered ' + workerName);
} catch (e) {
  console.error('Error updating pi-workers.json:', e.message);
  process.exit(1);
}
