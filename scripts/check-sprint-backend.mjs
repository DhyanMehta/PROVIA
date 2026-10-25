// Public, read-only deployment smoke. Never accepts or prints credentials/tokens.
const input = process.argv[2];
let failed = false;
try {
  const base = new URL(input);
  if (base.protocol !== 'https:' || base.pathname !== '/api/v1' || base.username || base.password || base.search || base.hash) throw new Error();
  for (const [route, expected, invalidBearer] of [['/health', 200], ['/health/db', 200], ['/me', 401], ['/me', 401, true]]) {
    const start = Date.now();
    let status = 'none', requestId = 'none';
    try {
      const response = await fetch(base.href + route, {
        redirect: 'error', signal: AbortSignal.timeout(120000),
        ...(invalidBearer ? { headers: { Authorization: 'Bearer diagnostic.invalid.token' } } : {}),
      });
      status = response.status;
      const id = response.headers.get('x-request-id');
      if (id && /^[a-zA-Z0-9_-]{1,64}$/.test(id)) requestId = id;
      const body = await response.json().catch(() => null);
      const pass = status === expected && (expected === 200 ? body?.status === 'ok' : body?.error?.code === 'HTTP_401');
      const code = ['HTTP_401', 'AUTH_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'INTERNAL_SERVER_ERROR'].includes(body?.error?.code) ? body.error.code : 'UNEXPECTED_RESPONSE';
      const category = pass ? 'EXPECTED' : expected === 200 && status === 200 ? 'INVALID_RESPONSE' : code;
      console.log(`${pass ? 'PASS' : 'FAIL'} GET ${route}${invalidBearer ? ' [deliberately invalid bearer; no real session]' : ''} HTTP${status} category=${category} duration_ms=${Date.now() - start} request_id=${requestId}`);
      if (!pass) failed = true;
    } catch (error) {
      const category = error?.name === 'TimeoutError' ? 'NETWORK_TIMEOUT' : 'NETWORK_OR_PROTOCOL_ERROR';
      console.error(`FAIL GET ${route} HTTP${status} category=${category} duration_ms=${Date.now() - start} request_id=${requestId}`);
      failed = true;
    }
  }
  process.exitCode = failed ? 1 : 0;
} catch {
  console.error('BLOCKED/FAIL: supply an actual HTTPS /api/v1 URL and verify safe health/DB/auth responses. No remote response body printed.');
  process.exitCode = 1;
}
