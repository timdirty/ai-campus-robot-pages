import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const tsxCli = join('node_modules', 'tsx', 'dist', 'cli.cjs');

const tests = [
  'src/state/appState.test.ts',
  'src/__tests__/localAi.test.ts',
  'src/__tests__/localVision.test.ts',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [tsxCli, test], {
    env: {...process.env, VITE_AI_PROXY_DISABLED: '1'},
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
