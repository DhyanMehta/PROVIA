import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Action,
  Busy,
  Card,
  Copy,
  ErrorNote,
  PasswordField,
  ConfirmDialog,
  Page,
  Title,
  Value,
} from "../components/ui";
import { useAuth } from "../providers/auth";
import { useApi } from "../providers/api";
import { useResource } from "../hooks/use-resource";
import { errorMessage } from "../lib/api-client";

export default function Account() {
  const api = useApi();
  const { user, session, signOut } = useAuth();
  const [password, setPassword] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const running = useRef(false);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; action: () => Promise<void> }>();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.request("get", "/api/v1/auth/sessions", { signal, cacheMs: 0, validate: value => Array.isArray(value) && value.length <= 100 && value.every(row => !!row && typeof row.id === "string" && typeof row.current === "boolean" && (row.device_label === null || typeof row.device_label === "string") && [row.created_at, row.last_used_at, row.expires_at].every(item => typeof item === "string" && Number.isFinite(Date.parse(item)))) }),
    [api],
  );
  const { data, error, reload } = useResource(load);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure("");
    try {
      await action();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
      setConfirmation(undefined);
    }
  }
  return (
    <Page>
      <Title eyebrow="PROVIA account">Your security, your control.</Title>
      <Card>
        <Value label="Name" value={user?.name ?? "Not available"} />
        <Value label="Email" value={user?.email ?? "Not available"} />
        <Copy>
          {user?.email_verified
            ? "Email verified"
            : "Email verification pending"}
        </Copy>
      </Card>
      {!user?.email_verified && (
        <Action
          label="Verify email"
          onPress={() => router.push("/verify-email")}
        />
      )}
      <Card>
        <Title>Change password</Title>
        <Copy>
          Changing your password signs out every session, including this device.
        </Copy>
        <PasswordField
          label="Current password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <PasswordField
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <Action
          label="Change password"
          disabled={busy || next.length < 15 || next !== confirm || !password}
          onPress={() => setConfirmation({ title: "Change your password?", message: "Every active session, including this device, will be signed out after a successful change.", action: async () => {
              await api.request("post", "/api/v1/auth/change-password", {
                body: { password, new_password: next },
              });
              await session.clear();
              router.replace("/welcome");
            } })}
        />
      </Card>
      <Card>
        <Title>Active sessions</Title>
        <Copy>
          Most recent 100 active sessions. Labels are optional and do not
          identify a physical device securely.
        </Copy>
        {!data && !error && <Busy />}
        {!!error && <ErrorNote message={errorMessage(error)} />}
        {data?.length === 0 && <Copy>No active sessions found.</Copy>}
        {data?.map((row) => (
          <Card key={row.id}>
            <Value
              label={row.current ? "This session" : "Other session"}
              value={row.device_label ?? "Unlabelled device"}
            />
            <Copy>Last used {new Date(row.last_used_at).toLocaleString()}</Copy>
            <Action
              secondary
              label="Revoke session"
              disabled={busy}
              onPress={() => setConfirmation({ title: "Revoke this session?", message: row.current ? "This signs out the current session." : "This ends the selected server session. Its device label is user supplied.", action: async () => {
                  await api.request(
                    "delete",
                    "/api/v1/auth/sessions/{session_id}",
                    { params: { session_id: row.id } },
                  );
                  if (row.current) await session.clear();
                  else reload();
                } })}
            />
          </Card>
        ))}
        <Action secondary label="Refresh sessions" onPress={reload} />
      </Card>
      {failure && <ErrorNote message={failure} />}
      <Action
        secondary
        label="Sign out this device"
        disabled={busy}
        onPress={() => setConfirmation({ title: "Sign out this device?", message: "Your saved account records stay on the server.", action: signOut })}
      />
      <Action
        secondary
        label="Sign out all devices"
        disabled={busy}
        onPress={() => setConfirmation({ title: "Sign out all devices?", message: "This revokes every active session. You will need to sign in again.", action: async () => {
            await api.request("post", "/api/v1/auth/logout-all");
            await session.clear();
          } })}
      />
      {confirmation ? <ConfirmDialog visible title={confirmation.title} message={confirmation.message} destructive busy={busy} onCancel={() => setConfirmation(undefined)} onConfirm={() => { void run(async () => { await confirmation.action(); setConfirmation(undefined); }); }} /> : null}
    </Page>
  );
}
