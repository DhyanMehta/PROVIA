import { createAuthSession, type AuthStorage } from "./auth-session";

const base = "https://api.example.test/api/v1";
const user = {
  id: "account-a",
  email: "test@example.com",
  name: "Test",
  status: "active",
  email_verified: true,
};
const tokens = (refresh = "refresh-original", access = "access-original") => ({
  access_token: access,
  refresh_token: refresh,
  token_type: "bearer",
  expires_in: 900,
  user,
});
const response = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
    headers: new Headers(),
  }) as Response;
function storage(initial: string | null = null) {
  let value = initial;
  const adapter: AuthStorage = {
    read: jest.fn(async () => value),
    write: jest.fn(async (next) => {
      value = next;
    }),
    clear: jest.fn(async () => {
      value = null;
    }),
  };
  return adapter;
}

test("login persists only refresh credentials and advertises success after storage", async () => {
  const disk = storage();
  const api = createAuthSession(
    base,
    disk,
    jest.fn().mockResolvedValue(response(tokens())),
  );
  await api.signIn("test@example.com", "private-password");
  expect(api.getSnapshot().user?.id).toBe(user.id);
  const saved = await disk.read();
  expect(saved).toContain("refresh-original");
  expect(saved).not.toMatch(/access-original|private-password/);
});

test("malformed authentication responses never persist credentials or publish a user", async () => {
  for (const body of [
    null,
    { ...tokens(), expires_in: "900" },
    { ...tokens(), expires_in: 10000 },
    { ...tokens(), user: { ...user, email_verified: "yes" } },
    { ...tokens(), user: { ...user, status: "disabled" } },
  ]) {
    const disk = storage();
    const api = createAuthSession(
      base,
      disk,
      jest.fn().mockResolvedValue(response(body)),
    );
    await expect(
      api.signIn("test@example.com", "private-password"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(api.getSnapshot().user).toBeNull();
    expect(disk.write).not.toHaveBeenCalled();
  }
});

test("concurrent forced refresh is single-flight and stale401 reuses the newer access token", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(tokens()))
    .mockResolvedValue(response(tokens("refresh-rotated", "access-rotated")));
  const api = createAuthSession(base, storage(), transport);
  await api.signIn("test@example.com", "private-password");
  expect(
    await Promise.all([
      api.getToken(true, "access-original"),
      api.getToken(true, "access-original"),
    ]),
  ).toEqual(["access-rotated", "access-rotated"]);
  expect(await api.getToken(true, "access-original")).toBe("access-rotated");
  expect(transport).toHaveBeenCalledTimes(2);
});

test("cold restoration rotates stored credentials once", async () => {
  const disk = storage(
    JSON.stringify({ refresh: "old-refresh", rotating: false }),
  );
  const transport = jest
    .fn()
    .mockResolvedValue(response(tokens("new-refresh")));
  const api = createAuthSession(base, disk, transport);
  await Promise.all([api.restore(), api.restore()]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(api.getSnapshot().user?.id).toBe(user.id);
  expect(await disk.read()).toContain("new-refresh");
});

test("an interrupted rotation marker is never replayed on restart", async () => {
  const disk = storage(
    JSON.stringify({ refresh: "consumed-maybe", rotating: true }),
  );
  const transport = jest.fn();
  const api = createAuthSession(base, disk, transport);
  await api.restore();
  expect(transport).not.toHaveBeenCalled();
  expect(api.getSnapshot()).toMatchObject({ loaded: true, user: null });
  expect(await disk.read()).toBeNull();
});

test("lost refresh response clears local credentials and never automatically retries", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(tokens()))
    .mockRejectedValue(new Error("private network details"));
  const disk = storage();
  const api = createAuthSession(base, disk, transport);
  await api.signIn("test@example.com", "private-password");
  await expect(api.getToken(true, "access-original")).rejects.toBeTruthy();
  expect(await api.getToken(true)).toBeNull();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(api.getSnapshot().error).not.toContain("private network details");
  expect(await disk.read()).toBeNull();
});

test("a late login response cannot restore credentials after logout", async () => {
  let resolve!: (value: Response) => void;
  const transport = jest.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const disk = storage();
  const api = createAuthSession(base, disk, transport);
  const login = api.signIn("test@example.com", "private-password");
  const failed = expect(login).rejects.toMatchObject({
    code: "SESSION_CHANGED",
  });
  for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
  await api.signOut();
  resolve(response(tokens()));
  await failed;
  expect(api.getSnapshot().user).toBeNull();
  expect(await disk.read()).toBeNull();
});

test("secure storage failure prevents advertising a successful login", async () => {
  const disk = storage();
  disk.write = jest.fn().mockRejectedValue(new Error("private storage error"));
  const api = createAuthSession(
    base,
    disk,
    jest.fn().mockResolvedValue(response(tokens())),
  );
  await expect(
    api.signIn("test@example.com", "private-password"),
  ).rejects.toBeTruthy();
  expect(api.getSnapshot().user).toBeNull();
  expect(api.getSnapshot().error).not.toContain("private storage error");
});

test("revoked or disabled sessions terminate restoration", async () => {
  for (const status of [401, 403]) {
    const api = createAuthSession(
      base,
      storage(JSON.stringify({ refresh: "old", rotating: false })),
      jest
        .fn()
        .mockResolvedValue(
          response({ error: { code: "ACCOUNT_DISABLED" } }, status),
        ),
    );
    await api.restore();
    expect(api.getSnapshot()).toMatchObject({ loaded: true, user: null });
  }
});

test("a disabled-account response clears an already restored identity", async () => {
  const disk = storage();
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(tokens()))
    .mockResolvedValue(response({ error: { code: "ACCOUNT_DISABLED" } }, 403));
  const api = createAuthSession(base, disk, transport);
  await api.signIn("test@example.com", "private-password");
  await expect(api.reloadUser()).rejects.toMatchObject({ status: 403 });
  expect(api.getSnapshot().user).toBeNull();
  expect(api.getSnapshot().error).toMatch(/disabled/);
});

test("logout revokes on the server even when secure storage deletion fails", async () => {
  const disk = storage();
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(tokens()))
    .mockResolvedValueOnce(response({ message: "Signed out" }))
    .mockResolvedValue(
      response({ error: { code: "INVALID_AUTHENTICATION" } }, 401),
    );
  const api = createAuthSession(base, disk, transport);
  await api.signIn("test@example.com", "private-password");
  disk.clear = jest
    .fn()
    .mockRejectedValue(new Error("private storage details"));
  await api.signOut();
  expect(transport.mock.calls[1][0]).toContain("/auth/logout");
  expect(api.getSnapshot().user).toBeNull();
  expect(api.getSnapshot().error).toMatch(/cleanup failed/);
  const restarted = createAuthSession(base, disk, transport);
  await restarted.restore();
  expect(restarted.getSnapshot()).toMatchObject({ loaded: true, user: null });
});

test("failed deletion and offline logout retain a revocation retry without signing back in", async () => {
  const disk = storage();
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(tokens()))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(response({ message: "Signed out" }));
  const api = createAuthSession(base, disk, transport);
  await api.signIn("test@example.com", "private-password");
  disk.clear = jest.fn().mockRejectedValue(new Error("storage"));
  await expect(api.signOut()).rejects.toBeTruthy();
  expect(api.getSnapshot().error).toMatch(/Sign-out could not be confirmed/);
  await api.signOut();
  expect(transport).toHaveBeenCalledTimes(3);
  expect(api.getSnapshot().user).toBeNull();
});
