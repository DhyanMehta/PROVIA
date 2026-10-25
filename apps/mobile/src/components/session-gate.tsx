import { useEffect, useState, type PropsWithChildren } from "react";
import { Action, Busy, Copy, ErrorNote, Page } from "./ui";

// This only bounds the waiting UI. It never manufactures or clears a session.
export function SessionGate({
  loaded,
  children,
}: PropsWithChildren<{ loaded: boolean }>) {
  const [expired, setExpired] = useState(false);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setExpired(true), 30000);
    return () => clearTimeout(timer);
  }, [loaded, check]);
  if (loaded) return children;
  return (
    <Page safeTop>
      {expired ? (
        <>
          <ErrorNote message="Clerk session initialization is taking too long. [SESSION_INITIALIZATION_TIMEOUT]" />
          <Copy>
            Check your connection. Session restoration can still finish; your
            saved session has not been cleared.
          </Copy>
          <Action
            label="Wait and check again"
            onPress={() => {
              setExpired(false);
              setCheck((value) => value + 1);
            }}
          />
        </>
      ) : (
        <Busy label="Restoring your secure session…" />
      )}
    </Page>
  );
}
