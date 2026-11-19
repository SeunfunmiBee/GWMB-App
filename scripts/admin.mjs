// Web admin (appadmin.girlswhomeanbusiness.org). Usage: node scripts/admin.mjs start|build|deploy
// Sets APP_TARGET=admin so app.config.js routes from src/admin-app (works the same on Windows and macOS).
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
  const { status } = spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true, env: { ...process.env, APP_TARGET: 'admin' } });
  if (status !== 0) process.exit(status ?? 1);
};

const task = process.argv[2];
if (task === 'start') run('npx', ['expo', 'start', '--web', '--clear']);
else if (task === 'build' || task === 'deploy') {
  run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-admin', '--clear']);
  if (task === 'deploy') run('npx', ['--prefix', 'api', 'wrangler', 'deploy', '--config', 'admin-web/wrangler.jsonc']);
} else {
  console.error('Usage: node scripts/admin.mjs start|build|deploy');
  process.exit(1);
}
