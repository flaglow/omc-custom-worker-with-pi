#!/usr/bin/env node
// Update pane_id in config.json, manifest.json, and worker identity.json
// Usage: TEAM_STATE_ROOT=x WORKER_NAME=y PANE_ID=z node update-pane-id.js
const fs = require('fs');
const path = require('path');

const REQUIRED_ENV = ['TEAM_STATE_ROOT', 'WORKER_NAME', 'PANE_ID'];

function readRequiredEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return {
    root: process.env.TEAM_STATE_ROOT,
    name: process.env.WORKER_NAME,
    paneId: process.env.PANE_ID
  };
}

function main() {
  const { root, name, paneId } = readRequiredEnv();

  for (const file of ['config.json', 'manifest.json', `workers/${name}/identity.json`]) {
    const fp = path.join(root, file);
    if (!fs.existsSync(fp)) {
      throw new Error(`Required file not found: ${file}`);
    }

    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const w = file.endsWith('identity.json') ? data : (data.workers || []).find(e => e.name === name);
    if (w) {
      w.pane_id = paneId;
      fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
    } else {
      throw new Error(`Worker ${name} not found in ${file}`);
    }
  }
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: failed to update pane_id: ${message}`);
  process.exit(1);
}
