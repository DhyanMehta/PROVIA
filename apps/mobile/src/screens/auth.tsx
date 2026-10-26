import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Action,
  Card,
  Copy,
  ErrorNote,
  Field,
  Page,
  Title,
} from "../components/ui";
import { useAuth } from "../providers/auth";
import { errorMessage } from "../lib/api-client";

function useWork() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
function PasswordField({
  label,
  value,
  onChange,
  fresh = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fresh?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={fresh ? "new-password" : "current-password"}
        maxLength={128}
      />
      <Action
        secondary
        label={
          visible
            ? `Hide ${label.toLowerCase()}`
            : `Show ${label.toLowerCase()}`
        }
        onPress={() => setVisible((value) => !value)}
      />
    </>
  );
}

export function Welcome() {
  const { isSignedIn, error, logoutPending, session } = useAuth();
  const work = useWork();
  if (isSignedIn) return <Redirect href="/" />;
  return (
    <Page safeTop>
      <Title eyebrow="PROVIA">A clearer path to your healthier day.</Title>
      <Copy>Your nutrition, movement and recovery. One personal plan.</Copy>
      <Card>
        <Title>Start with you.</Title>
        <Copy>
          Build a personal routine with secure access to your own progress.
        </Copy>
      </Card>
      {error && <ErrorNote message={error} />}
      {logoutPending && (
        <Action
          label={work.busy ? "Retrying sign-out…" : "Retry sign-out cleanup"}
          disabled={work.busy}
          onPress={() => void work.run(() => session.signOut())}
        />
      )}
      <Action
        label="Create your account"
        onPress={() => router.push("/register")}
      />
      <Action
        secondary
        label="I already have an account"
        onPress={() => router.push("/login")}
      />
    </Page>
  );
}

export function Login() {
  const { session, isSignedIn } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const work = useWork();
  if (isSignedIn) return <Redirect href="/" />;
  return (
    <Page>
      <Title eyebrow="Welcome back">Make room for you.</Title>
      <Copy>Sign in to your PROVIA account.</Copy>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={320}
      />
      <PasswordField label="Password" value={password} onChange={setPassword} />
      {work.error && <ErrorNote message={work.error} />}
      <Action
        label={work.busy ? "Signing in…" : "Sign in"}
        disabled={work.busy || !email || !password}
        onPress={() =>
          void work.run(async () => {
            await session.signIn(email.trim(), password);
            router.replace("/");
          })
        }
      />
      <Action
        secondary
        label="Forgot password"
        onPress={() => router.push("/forgot-password")}
      />
      <Action
        secondary
        label="Create an account"
        onPress={() => router.replace("/register")}
      />
    </Page>
  );
}

export function Register() {
  const { session, isSignedIn } = useAuth();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const work = useWork();
  if (isSignedIn) return <Redirect href="/" />;
  return (
    <Page>
      <Title eyebrow="Your first step">Create your account.</Title>
      <Copy>
        Use 15–128 characters for your password. Spaces and Unicode are
        preserved exactly.
      </Copy>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        maxLength={100}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={320}
      />
      <PasswordField
        fresh
        label="Password"
        value={password}
        onChange={setPassword}
      />
      <PasswordField
        fresh
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
      />
      {work.error && <ErrorNote message={work.error} />}
      <Action
        label={work.busy ? "Creating account…" : "Create account"}
        disabled={work.busy}
        onPress={() => {
          if (password.length < 15 || password !== confirm || !name.trim()) {
            work.setError(
              "Enter your name and a password of at least 15 characters. Passwords must match.",
            );
            return;
          }
          void work.run(async () => {
            await session.publicApi.request("post", "/api/v1/auth/register", {
              authenticated: false,
              timeoutMs: 90000,
              body: { name: name.trim(), email: email.trim(), password },
            });
            router.replace("/verify-email");
          });
        }}
      />
      <Action
        secondary
        label="Already registered? Sign in"
        onPress={() => router.replace("/login")}
      />
    </Page>
  );
}

function useActionToken() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const incoming =
    params.token === undefined
      ? undefined
      : typeof params.token === "string" &&
          params.token.length >= 20 &&
          params.token.length <= 512
        ? params.token
        : "";
  const [saved, setSaved] = useState(incoming ?? "");
  if (incoming !== undefined && incoming !== saved) setSaved(incoming);
  useEffect(() => {
    if (params.token === undefined) return;
    router.setParams({ token: undefined });
  }, [params.token]);
  return incoming ?? saved;
}

export function VerifyEmail() {
  const token = useActionToken();
  return <VerificationForm key={token} token={token} />;
}

function VerificationForm({ token }: { token: string }) {
  const { session, user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? ""),
    [message, setMessage] = useState(""),
    [cooldown, setCooldown] = useState(0);
  const work = useWork();
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  return (
    <Page>
      <Title eyebrow="Protect your account">Verify your email.</Title>
      <Copy>
        Open the one-time link from your email, then confirm here. Fitness data
        stays protected until verification.
      </Copy>
      <Copy>
        Email delivery must be configured. This screen never marks your email
        verified without a valid server confirmation. If no message arrives,
        delivery may be unavailable or account enrollment may require support.
      </Copy>
      {token && (
        <Action
          label={work.busy ? "Verifying…" : "Confirm email verification"}
          disabled={work.busy}
          onPress={() =>
            void work.run(async () => {
              await session.publicApi.request(
                "post",
                "/api/v1/auth/verify-email",
                { authenticated: false, body: { token } },
              );
              if (user) {
                await session.reloadUser();
                router.replace("/");
              } else setMessage("Email verified. Sign in to continue.");
            })
          }
        />
      )}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={320}
      />
      {message && <Copy>{message}</Copy>}
      {work.error && <ErrorNote message={work.error} />}
      <Action
        secondary
        label={
          cooldown
            ? `Resend available in ${cooldown}s`
            : "Request verification email"
        }
        disabled={work.busy || cooldown > 0 || !email}
        onPress={() =>
          void work.run(async () => {
            const result = await session.publicApi.request(
              "post",
              "/api/v1/auth/resend-verification",
              { authenticated: false, body: { email: email.trim() } },
            );
            setMessage(result.message);
            setCooldown(60);
          })
        }
      />
      {user ? (
        <>
          <Action
            label="Check verification status"
            disabled={work.busy}
            onPress={() =>
              void work.run(async () => {
                await session.reloadUser();
                router.replace("/");
              })
            }
          />
          <Action
            secondary
            label="Account settings"
            onPress={() => router.push("/account")}
          />
          <Action
            secondary
            label="Sign out"
            onPress={() => void session.signOut().catch(() => {})}
          />
        </>
      ) : (
        <Action
          secondary
          label="Continue to sign in"
          onPress={() => router.replace("/login")}
        />
      )}
    </Page>
  );
}

export function ForgotPassword() {
  const { session } = useAuth();
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState("");
  const work = useWork();
  return (
    <Page>
      <Title eyebrow="Account recovery">Find your way back.</Title>
      <Copy>
        Enter your email. Eligible accounts can receive a short-lived reset link
        when delivery is available.
      </Copy>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={320}
      />
      {message && <Copy>{message}</Copy>}
      {work.error && <ErrorNote message={work.error} />}
      <Action
        label={work.busy ? "Requesting…" : "Request reset instructions"}
        disabled={work.busy || !email || !!message}
        onPress={() =>
          void work.run(async () => {
            const result = await session.publicApi.request(
              "post",
              "/api/v1/auth/forgot-password",
              { authenticated: false, body: { email: email.trim() } },
            );
            setMessage(result.message);
          })
        }
      />
      <Action
        secondary
        label="Back to sign in"
        onPress={() => router.replace("/login")}
      />
    </Page>
  );
}

export function ResetPassword() {
  const token = useActionToken();
  return <ResetForm key={token} token={token} />;
}

function ResetForm({ token }: { token: string }) {
  const { session } = useAuth();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [done, setDone] = useState(false);
  const work = useWork();
  return (
    <Page>
      <Title eyebrow="A fresh start">Reset your password.</Title>
      {!token ? (
        <Copy>
          Open a valid reset link from your email. Links expire after 15 minutes
          and work once.
        </Copy>
      ) : !done ? (
        <>
          <PasswordField
            fresh
            label="New password"
            value={password}
            onChange={setPassword}
          />
          <PasswordField
            fresh
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
          />
          {work.error && <ErrorNote message={work.error} />}
          <Action
            label={work.busy ? "Resetting…" : "Reset password"}
            disabled={work.busy}
            onPress={() => {
              if (password.length < 15 || password !== confirm) {
                work.setError(
                  "Use at least 15 characters and matching passwords.",
                );
                return;
              }
              void work.run(async () => {
                await session.publicApi.request(
                  "post",
                  "/api/v1/auth/reset-password",
                  {
                    authenticated: false,
                    body: { token, new_password: password },
                  },
                );
                await session.clear();
                setDone(true);
              });
            }}
          />
        </>
      ) : (
        <Copy>Password reset. Previous sessions have been revoked.</Copy>
      )}
      <Action
        secondary
        label="Sign in"
        onPress={() => router.replace("/login")}
      />
      <Action
        secondary
        label="Request a new reset link"
        onPress={() => router.replace("/forgot-password")}
      />
    </Page>
  );
}
