#!/usr/bin/env node
// Parse worker spec string and classify into pi/native workers
// Usage: node parse-workers.js "2:pi-zai,1:codex,1:gemini,1:pi-openai/gpt-5"
// Reads worker config from ~/.claude/pi-workers.json for pi- worker resolution
// Output: JSON with piWorkers[], nativeWorkers[], totalWorkers
const fs = require('fs');
const path = require('path');

const spec = process.argv[2];
if (!spec) {
  console.error('Usage: node parse-workers.js "N:type[,N:type,..."');
  process.exit(1);
}

// Load pi-workers.json
const configPath = path.join(process.env.HOME, '.claude/pi-workers.json');
let workerConfig = { version: 1, workers: {} };
try {
  if (fs.existsSync(configPath)) {
    workerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.error('Error reading pi-workers.json:', e.message);
  process.exit(1);
}

const piWorkers = [];
const nativeWorkers = [];
const regex = /(\d+):([a-z0-9-]+(?:\/[A-Za-z0-9._-]+)?)/g;
let match;

while ((match = regex.exec(spec)) !== null) {
  const count = parseInt(match[1], 10);
  const fullType = match[2];

  if (fullType.startsWith('pi-')) {
    const slashIdx = fullType.indexOf('/');
    const name = slashIdx > 0 ? fullType.substring(0, slashIdx) : fullType;
    const modelOverride = slashIdx > 0 ? fullType.substring(slashIdx + 1) : null;

    // Validate name
    if (!/^pi-[a-z0-9][a-z0-9-]*$/.test(name)) {
      console.error('Invalid pi worker name: ' + name + ' (must match ^pi-[a-z0-9][a-z0-9-]*$)');
      process.exit(1);
    }

    const entry = workerConfig.workers[name];
    if (!entry) {
      console.error('Unknown pi worker: ' + name + '. Run /pi-setup to register it.');
      process.exit(1);
    }

    piWorkers.push({
      count,
      name,
      provider: entry.provider,
      model: modelOverride || entry.model
    });
  } else {
    nativeWorkers.push({ count, type: fullType });
  }
}

const totalWorkers = piWorkers.reduce((s, w) => s + w.count, 0) +
                     nativeWorkers.reduce((s, w) => s + w.count, 0);

console.log(JSON.stringify({ piWorkers, nativeWorkers, totalWorkers }, null, 2));
