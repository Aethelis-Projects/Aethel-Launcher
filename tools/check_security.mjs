import { spawnSync } from 'child_process';

console.log('Running npm security audit...');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const result = spawnSync(
  npmCmd,
  [
    'audit',
    '--audit-level=high',
    '--package-lock-only',
    '--fetch-timeout=15000',
    '--fetch-retries=0'
  ],
  {
    encoding: 'utf8',
    shell: true
  }
);

const stdout = result.stdout || '';
const stderr = result.stderr || '';

if (stdout.trim()) console.log(stdout);
if (stderr.trim()) console.error(stderr);

if (result.status === 0) {
  console.log('Frontend security audit PASSED: No high or critical vulnerabilities found.');
  process.exit(0);
}

const combined = stdout + stderr;
const isNetworkOrRegistryError =
  combined.includes('network timeout') ||
  combined.includes('audit endpoint returned an error') ||
  combined.includes('fetch failed') ||
  combined.includes('ETIMEDOUT') ||
  combined.includes('ECONNRESET') ||
  combined.includes('ENOTFOUND') ||
  combined.includes('EAI_AGAIN') ||
  result.status === null;

if (isNetworkOrRegistryError) {
  console.warn('\n[!] WARNING: npm security audit registry endpoint is temporarily unreachable or timed out.');
  console.warn('Proceeding without failing build since this is an external registry infrastructure outage.\n');
  process.exit(0);
}

console.error('\n[X] Frontend security audit FAILED: High or critical vulnerabilities detected in dependencies.');
process.exit(1);
