#!/usr/bin/env node
// Render bootstrap template with variable substitution
// Usage: TEAM_NAME=x WORKER_NAME=y TASK_ID=z CWD=w STATE_ROOT=s node render-bootstrap.js /path/to/template.md
const fs = require('fs');
let text = fs.readFileSync(process.argv[2], 'utf8');
for (const key of ['TEAM_NAME', 'WORKER_NAME', 'TASK_ID', 'CWD', 'STATE_ROOT']) {
  text = text.split(`{{${key}}}`).join(process.env[key] || '');
}
process.stdout.write(text);
