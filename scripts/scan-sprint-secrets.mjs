import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
// fileURLToPath handles Windows paths with spaces without exposing any config.
const { fileURLToPath } = await import('node:url');
const workspace = fileURLToPath(new URL('..', import.meta.url));
const values = parseEnv(readFileSync(join(workspace, 'services/api/.env'), 'utf8'));
const secrets = new Set();
for (const [name, value] of Object.entries(values)) {
  if (value.length < 12 || !/API_KEY|SECRET|ACCESS_KEY_ID|DATABASE_URL|PASSWORD/.test(name)) continue;
  secrets.add(value);
  if (name.includes('DATABASE_URL')) {
    try { const password = new URL(value).password; if (password) { secrets.add(password); secrets.add(decodeURIComponent(password)); } } catch { /* No config values in errors. */ }
  }
}
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: workspace }).toString().split('\0').filter(Boolean);
const bundleFiles = [];
function walk(directory) {
  try { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else bundleFiles.push(path); } } catch { /* Bundle may not yet exist. */ }
}
walk(join(workspace, 'apps/mobile/dist'));
const hits = [];
let scanned = 0;
for (const file of [...files.map(file => join(workspace, file)), ...bundleFiles]) {
  try {
    if (!statSync(file).isFile()) continue;
    const content = readFileSync(file); scanned++;
    if ([...secrets].some(value => content.includes(Buffer.from(value)) || content.includes(Buffer.from(value, 'utf16le')))) hits.push(file);
  } catch { /* Deleted tracked placeholders have no content to scan. */ }
}
console.log(`Scanned ${scanned} candidate/bundle files; credential matches: ${hits.length}; bundle files: ${bundleFiles.length}`);
for (const file of hits) console.log(file);
process.exitCode = hits.length ? 1 : 0;
