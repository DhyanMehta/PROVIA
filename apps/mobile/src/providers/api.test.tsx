import { act, useEffect } from "react";
import { createRoot } from "test-renderer";
import { ApiProvider, useApi } from "./api";

const mockGetToken = async () => "fixture-token";
const mockSession = { getGeneration: () => 0, getSnapshot: () => ({ user: { id: "user-a" } }) };
const mockTransport = jest.fn(
  async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ id: "server-user" }),
      headers: new Headers(),
    }) as Response,
);
jest.mock("./auth", () => ({
  useAuth: () => ({ userId: "user-a", getToken: mockGetToken, session: mockSession }),
}));
jest.mock("expo/fetch", () => ({
  fetch: () => mockTransport(),
}));

test("StrictMode reconnect resumes provider before descendant passive requests", async () => {
  const results: string[] = [];
  function Probe() {
    const api = useApi();
    useEffect(() => {
      void api
        .request("get", "/api/v1/me")
        .then(() => results.push("OK"))
        .catch((error) => results.push(error.code));
    }, [api]);
    return null;
  }
  const root = createRoot({ isStrictMode: true });
  await act(async () => {
    root.render(
      <ApiProvider baseUrl="https://example.test/api/v1">
        <Probe />
      </ApiProvider>,
    );
  });
  expect(results).toContain("OK");
  expect(results).not.toContain("SESSION_CHANGED");
  await act(async () => root.unmount());
});
