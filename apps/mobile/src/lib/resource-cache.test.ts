import { createApiClient } from "./api-client";
const reply = (status: number, data: unknown = {}) => ({ status, ok: status < 400, headers: new Headers(), json: async () => data }) as Response;
test("account-scoped bounded GET cache is invalidated by successful writes and cancelled sessions", async () => {
  const transport = jest.fn().mockResolvedValue(reply(200, { id: "a" }));
  const api = createApiClient("https://api.test/api/v1", async () => "token", transport);
  await api.request("get", "/api/v1/me"); await api.request("get", "/api/v1/me");
  expect(transport).toHaveBeenCalledTimes(1);
  const changed = jest.fn(); api.subscribe(changed);
  transport.mockResolvedValueOnce(reply(204));
  await api.request("delete", "/api/v1/water-logs/{log_id}", { params: { log_id: "entry" } });
  expect(changed).toHaveBeenCalledTimes(1);
  await api.request("get", "/api/v1/me"); expect(transport).toHaveBeenCalledTimes(3);
  api.pause(); api.resume(); await api.request("get", "/api/v1/me"); expect(transport).toHaveBeenCalledTimes(4);
});
test("GET that started before invalidation cannot repopulate the cache", async () => {
  let finish!: (value: Response) => void;
  const transport = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(reply(200, { id: "fresh" }));
  const api = createApiClient("https://api.test/api/v1", async () => "token", transport);
  const old = api.request("get", "/api/v1/me");
  await new Promise(resolve => setTimeout(resolve, 0)); api.invalidate(); finish(reply(200, { id: "old" })); await old;
  expect(await api.request("get", "/api/v1/me")).toMatchObject({ id: "fresh" });
  expect(transport).toHaveBeenCalledTimes(2);
});
test("uncertain server write invalidates cache without automatic retries", async () => {
  const transport = jest.fn().mockResolvedValueOnce(reply(200, { id: "old" })).mockResolvedValueOnce(reply(503, { error: { code: "DATABASE_UNAVAILABLE" } })).mockResolvedValue(reply(200, { id: "fresh" }));
  const api = createApiClient("https://api.test/api/v1", async () => "token", transport);
  await api.request("get", "/api/v1/me");
  await expect(api.request("post", "/api/v1/water-logs", { body: { amount_ml: "250", consumed_at: "2026-10-29T10:00:00Z" } })).rejects.toMatchObject({ uncertainWrite: true });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(await api.request("get", "/api/v1/me")).toMatchObject({ id: "fresh" });
});
test("fresh reconciliation bypasses cache and validates cached response with caller schema", async () => {
  const transport = jest.fn().mockResolvedValue(reply(200, { id: "a" }));
  const api = createApiClient("https://api.test/api/v1", async () => "token", transport);
  await api.request("get", "/api/v1/me"); await api.request("get", "/api/v1/me", { cacheMs: 0 });
  expect(transport).toHaveBeenCalledTimes(2);
  await expect(api.request("get", "/api/v1/me", { validate: () => false })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  expect(transport).toHaveBeenCalledTimes(3);
});
