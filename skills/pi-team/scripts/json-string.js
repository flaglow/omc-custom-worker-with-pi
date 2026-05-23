#!/usr/bin/env node
// JSON-safe string wrapper for shell embedding
// Usage: json_string "some value with special chars"
const fs = require('fs');
process.stdout.write(JSON.stringify(process.argv[2] || ''));
