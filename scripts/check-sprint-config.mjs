import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const yaml = require('js-yaml');
const deployment = yaml.load(readFileSync(new URL('../render.yaml', import.meta.url), 'utf8'));
assert.equal(deployment.services.length, 1);
assert.equal(deployment.databases, undefined);
const service = deployment.services[0];
assert.equal(service.plan, 'free');
assert.equal(service.rootDir, 'services/api');
assert.equal(service.healthCheckPath, '/api/v1/health/db');
assert.match(service.startCommand, /--host 0\.0\.0\.0 --port \$PORT/);
assert.equal(service.autoDeployTrigger, 'off');
const settings = readFileSync(new URL('../services/api/app/core/config.py', import.meta.url), 'utf8');
for (const env of service.envVars) {
  assert.ok(env.key === 'PYTHON_VERSION' || new RegExp(`^    ${env.key.toLowerCase()}:`, 'm').test(settings), `Unknown setting: ${env.key}`);
  if (env.value !== undefined) assert.equal(typeof env.value, 'string');
  if (/DATABASE_URL|API_KEY|AUTH_ISSUER|AUTH_JWKS_URL/.test(env.key)) assert.equal(env.sync, false);
}
assert.ok(!service.envVars.some(env => env.key === 'DIRECT_DATABASE_URL'));
const app = JSON.parse(readFileSync(new URL('../apps/mobile/app.json', import.meta.url)));
assert.equal(app.expo.name, 'PROVIA');
assert.equal(app.expo.android.package, 'com.provia.app');
const eas = JSON.parse(readFileSync(new URL('../apps/mobile/eas.json', import.meta.url)));
assert.equal(eas.build.preview.android.buildType, 'apk');
assert.equal(eas.build.preview.developmentClient, false);
assert.equal(eas.build.development.developmentClient, true);
for (const file of ['../.easignore', '../apps/mobile/.easignore']) {
  const ignore = readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const rule of ['**/.env', '**/.env.*', '**/android/', '**/ios/', '**/*.keystore']) assert.ok(ignore.includes(rule));
}
console.log('PASS: Render free-only/static configuration, real setting names, APK profiles and archive safeguards');
