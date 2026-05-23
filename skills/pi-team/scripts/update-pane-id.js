#!/usr/bin/env node
// Update pane_id in config.json, manifest.json, and worker identity.json
// Usage: TEAM_STATE_ROOT=x WORKER_NAME=y PANE_ID=z node update-pane-id.js
const fs = require('fs');
const path = require('path');
const root = process.env.TEAM_STATE_ROOT;
const name = process.env.WORKER_NAME;
const paneId = process.env.PANE_ID;

for (const file of ['config.json', 'manifest.json', `workers/${name}/identity.json`]) {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) continue;
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const w = file.endsWith('identity.json') ? data : (data.workers || []).find(e => e.name === name);
    if (w) {
      w.pane_id = paneId;
      fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
    } else {
      throw new Error(`Worker ${name} not found in ${file}`);
    }
  } catch (err) {
    console.error(`ERROR: failed to update ${file}: ${err.message}`);
    process.exit(1);
  }
}
