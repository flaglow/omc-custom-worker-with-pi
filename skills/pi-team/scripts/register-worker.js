#!/usr/bin/env node
// Register a pi worker in both config.json and manifest.json
// Usage: TEAM_STATE_ROOT=... WORKER_NAME=... WORKER_INDEX=... TASK_ID=...
//        PANE_ID=... PROVIDER=... MODEL=... CWD=... node register-worker.js
const fs = require('fs');
const path = require('path');

const worker = {
  name: process.env.WORKER_NAME,
  index: Number(process.env.WORKER_INDEX),
  role: 'executor',
  assigned_tasks: [process.env.TASK_ID],
  pane_id: process.env.PANE_ID,
  working_dir: process.env.CWD,
  team_state_root: process.env.TEAM_STATE_ROOT,
  worker_cli: 'pi',
  provider: process.env.PROVIDER,
  model: process.env.MODEL
};

// Update config.json
const configPath = path.join(process.env.TEAM_STATE_ROOT, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.workers = Array.isArray(config.workers) ? config.workers.filter((entry) => entry?.name !== worker.name) : [];
config.workers.push(worker);
config.worker_count = Math.max(Number(config.worker_count || 0), config.workers.length);
config.max_workers = Math.max(Number(config.max_workers || 20), config.worker_count);
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

// CRITICAL: Also update manifest.json — claim-task validates workers against manifest
const manifestPath = path.join(process.env.TEAM_STATE_ROOT, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.workers = Array.isArray(manifest.workers) ? manifest.workers.filter((entry) => entry?.name !== worker.name) : [];
  manifest.workers.push(worker);
  manifest.worker_count = manifest.workers.length;
  manifest.next_task_id = Math.max(Number(manifest.next_task_id || 0), Number(process.env.TASK_ID || 0) + 1);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
