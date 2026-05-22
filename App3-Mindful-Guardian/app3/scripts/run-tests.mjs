#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tests = [
  'src/state/guardianState.test.ts',
  'src/__tests__/localGuardianAi.test.ts',
  'src/__tests__/emotionTypography.test.ts',
  'src/__tests__/visualPrivacyGuardian.test.ts',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [tsxCli, test], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {...process.env, VITE_AI_PROXY_DISABLED: '1'},
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
