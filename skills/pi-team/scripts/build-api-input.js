#!/usr/bin/env node
// Build JSON input for omc team api commands
// Usage: node build-api-input.js create-task <team> <subject> <description>
//        node build-api-input.js write-worker-identity <team> <worker> <index> <taskId> <cwd> <stateRoot> <provider> <model>
//        node build-api-input.js send-message <team> <from> <content>
const [action, ...args] = process.argv.slice(2);

switch (action) {
  case 'create-task':
    process.stdout.write(JSON.stringify({
      team_name: args[0],
      subject: args[1],
      description: args[2],
      blocked_by: []
    }));
    break;
  case 'write-worker-identity':
    process.stdout.write(JSON.stringify({
      team_name: args[0],
      worker: args[1],
      index: Number(args[2]),
      role: 'executor',
      assigned_tasks: [args[3]],
      pane_id: 'pending',
      working_dir: args[4],
      team_state_root: args[5],
      worker_cli: 'pi',
      provider: args[6],
      model: args[7]
    }));
    break;
  case 'send-message':
    process.stdout.write(JSON.stringify({
      team_name: args[0],
      worker: args[1],
      content: args[2]
    }));
    break;
  default:
    console.error('Unknown action: ' + action);
    process.exit(1);
}
