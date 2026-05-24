#!/usr/bin/env node
// Register a pi worker in both config.json and manifest.json
// Usage: TEAM_STATE_ROOT=... WORKER_NAME=... WORKER_INDEX=... TASK_ID=...
//        PANE_ID=... PROVIDER=... MODEL=... CWD=... node register-worker.js
const fs = require('fs');
const path = require('path');

const REQUIRED_ENV = [
  'TEAM_STATE_ROOT',
  'WORKER_NAME',
  'WORKER_INDEX',
  'TASK_ID',
  'PANE_ID',
  'PROVIDER',
  'MODEL',
  'CWD'
];

function readRequiredEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return Object.fromEntries(REQUIRED_ENV.map((name) => [name, process.env[name]]));
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (unlinkError) {
      if (unlinkError.code !== 'ENOENT') {
        throw unlinkError;
      }
    }
    throw error;
  }
}

function main() {
  const env = readRequiredEnv();
  const worker = {
    name: env.WORKER_NAME,
    index: Number(env.WORKER_INDEX),
    role: 'executor',
    assigned_tasks: [env.TASK_ID],
    pane_id: env.PANE_ID,
    working_dir: env.CWD,
    team_state_root: env.TEAM_STATE_ROOT,
    worker_cli: 'pi',
    provider: env.PROVIDER,
    model: env.MODEL
  };

  // Update config.json
  const configPath = path.join(env.TEAM_STATE_ROOT, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.workers = Array.isArray(config.workers) ? config.workers.filter((entry) => entry?.name !== worker.name) : [];
  config.workers.push(worker);
  config.worker_count = Math.max(Number(config.worker_count || 0), config.workers.length);
  config.max_workers = Math.max(Number(config.max_workers || 20), config.worker_count);
  writeJsonAtomic(configPath, config);

  // CRITICAL: Also update manifest.json — claim-task validates workers against manifest
  const manifestPath = path.join(env.TEAM_STATE_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.workers = Array.isArray(manifest.workers) ? manifest.workers.filter((entry) => entry?.name !== worker.name) : [];
  manifest.workers.push(worker);
  manifest.worker_count = manifest.workers.length;
  manifest.next_task_id = Math.max(Number(manifest.next_task_id || 0), Number(env.TASK_ID || 0) + 1);
  writeJsonAtomic(manifestPath, manifest);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
