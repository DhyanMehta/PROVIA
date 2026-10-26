import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  Action,
  Busy,
  Card,
  Copy,
  ErrorNote,
  Field,
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
  const load = useCallback(
    (signal: AbortSignal) =>
      api.request("get", "/api/v1/auth/sessions", { signal }),
    [api],
  );
  const { data, error, reload } = useResource(load);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await action();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
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
        <Field
          label="Current password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <Field
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <Field
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
          onPress={() =>
            void run(async () => {
              await api.request("post", "/api/v1/auth/change-password", {
                body: { password, new_password: next },
              });
              await session.clear();
              router.replace("/welcome");
            })
          }
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
              onPress={() =>
                void run(async () => {
                  await api.request(
                    "delete",
                    "/api/v1/auth/sessions/{session_id}",
                    { params: { session_id: row.id } },
                  );
                  if (row.current) await session.clear();
                  else reload();
                })
              }
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
        onPress={() => void run(signOut)}
      />
      <Action
        secondary
        label="Sign out all devices"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await api.request("post", "/api/v1/auth/logout-all");
            await session.clear();
          })
        }
      />
    </Page>
  );
}
