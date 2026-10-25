// Public, read-only deployment smoke. Never accepts or prints credentials/tokens.
const input = process.argv[2];
try {
  const base = new URL(input);
  if (base.protocol !== 'https:' || base.pathname !== '/api/v1' || base.username || base.password || base.search || base.hash) throw new Error();
  for (const [route, expected] of [['/health', 200], ['/health/db', 200], ['/me', 401]]) {
    const response = await fetch(base.href + route, { redirect: 'error', signal: AbortSignal.timeout(120000) });
    const body = await response.json();
    if (response.status !== expected || (expected === 200 && body.status !== 'ok') || (expected === 401 && body.error?.code !== 'HTTP_401')) throw new Error();
    console.log(`PASS ${route} HTTP${response.status}`);
  }
} catch {
  console.error('BLOCKED/FAIL: supply an actual HTTPS /api/v1 URL and verify safe health/DB/auth responses. No remote response body printed.');
  process.exitCode = 1;
}
