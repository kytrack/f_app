#!/usr/bin/env node
/**
 * Publishes the current JS to the "friends" EAS Update channel, which iPhone users open in
 * Expo Go (no Apple developer account needed). Usage: npm run friends:update -- "message"
 */
const { spawnSync } = require('node:child_process');

const message = process.argv.slice(2).join(' ') || 'friends update';
const result = spawnSync(
  'npx',
  // shell: true does not quote arguments itself
  ['eas-cli', 'update', '--channel', 'friends', '--environment', 'preview', '--non-interactive', '--message', JSON.stringify(message)],
  { stdio: 'inherit', shell: true, env: { ...process.env, LIFEOS_EXPO_GO: '1' } },
);
process.exit(result.status ?? 1);
