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

test("the first requests after a background interval refresh expired access once", async () => {
  jest.useFakeTimers();
  try {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(response(tokens()))
      .mockResolvedValue(response(tokens("refresh-resumed", "access-resumed")));
    const api = createAuthSession(base, storage(), transport);
    await api.signIn("test@example.com", "private-password");
    jest.setSystemTime(Date.now() + 16 * 60 * 1000);

    expect(await Promise.all([api.getToken(), api.getToken()])).toEqual([
      "access-resumed",
      "access-resumed",
    ]);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await api.getToken()).toBe("access-resumed");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(api.getSnapshot().user?.id).toBe(user.id);
  } finally {
    jest.useRealTimers();
  }
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

test("stuck storage read ends restoration and ignores late credentials", async () => {
  jest.useFakeTimers();
  try {
    let finish!: (value: string) => void;
    const disk = storage();
    disk.read = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const transport = jest.fn();
    const api = createAuthSession(base, disk, transport);
    const restoring = api.restore();
    await jest.advanceTimersByTimeAsync(10000);
    await restoring;
    expect(api.getSnapshot()).toMatchObject({ loaded: true, user: null });
    finish(JSON.stringify({ refresh: "late-old-token", rotating: false }));
    await Promise.resolve();
    expect(transport).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test("stuck storage clear does not prevent server logout", async () => {
  jest.useFakeTimers();
  try {
    const disk = storage();
    const transport = jest.fn().mockResolvedValueOnce(response(tokens()))
      .mockResolvedValue(response({ message: "Signed out" }));
    const api = createAuthSession(base, disk, transport);
    await api.signIn("test@example.com", "private-password");
    disk.clear = jest.fn(() => new Promise(() => {}));
    const logout = api.signOut();
    await jest.advanceTimersByTimeAsync(10000);
    await logout;
    expect(transport.mock.calls[1][0]).toContain("/auth/logout");
    expect(api.getSnapshot()).toMatchObject({ user: null, logoutPending: true });
  } finally { jest.useRealTimers(); }
});

test("timed out token write stays serialized before cleanup and next login", async () => {
  jest.useFakeTimers();
  try {
    const disk = storage();
    const originalWrite = disk.write;
    let finish!: () => void;
    disk.write = jest.fn().mockImplementationOnce((value: string) => new Promise<void>(resolve => {
      finish = () => { void originalWrite(value).then(resolve); };
    })).mockImplementation(originalWrite);
    const transport = jest.fn().mockResolvedValue(response(tokens()));
    const api = createAuthSession(base, disk, transport);
    const login = api.signIn("test@example.com", "private-password");
    const rejected = expect(login).rejects.toMatchObject({ code: "STORAGE_TIMEOUT" });
    await jest.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(api.getSnapshot().user).toBeNull();
    const nextLogin = api.signIn("other@example.com", "private-password");
    expect(transport).toHaveBeenCalledTimes(1);
    finish();
    await nextLogin;
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await disk.read()).toContain("refresh-original");
    expect(api.getSnapshot().user?.id).toBe(user.id);
  } finally { jest.useRealTimers(); }
});
