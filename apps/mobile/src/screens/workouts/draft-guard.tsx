import { useRef, useState } from "react";
import { usePreventRemove } from "expo-router";
import { ConfirmDialog } from "../../components/ui";

/** Protect both route removal and closing an inline editor. No automatic retries. */
export function useWorkoutDraftGuard(dirty: boolean, pending: boolean, uncertain: boolean) {
  const [allowed, setAllowed] = useState(false);
  const [visible, setVisible] = useState(false);
  const next = useRef<() => void>(() => {});
  const disable = usePreventRemove(!allowed && (dirty || pending || uncertain), ({ repeat }) => {
    next.current = repeat;
    setVisible(true);
  });
  const allowLeave = () => { setAllowed(true); disable(); };
  const requestLeave = (action: () => void) => {
    if (!dirty && !pending && !uncertain) { action(); return; }
    next.current = action;
    setVisible(true);
  };
  return {
    allowLeave,
    requestLeave,
    dialog: <ConfirmDialog visible={visible} title={pending ? "Save in progress" : uncertain ? "Unresolved workout save" : "Discard workout draft?"}
      message={pending ? "Wait for this request to finish. Your entered values stay here." : uncertain ? "The server may already have saved this request. Stay here and reconcile or retry the original request. Leaving would lose the screen's retained retry identity." : "Your unsaved changes will be discarded. Saved training records stay unchanged."}
      confirmLabel={pending || uncertain ? "Keep editing" : "Discard changes"} destructive={!pending && !uncertain}
      onCancel={() => setVisible(false)} onConfirm={() => {
        setVisible(false);
        if (pending || uncertain) return;
        allowLeave();
        next.current();
      }} />,
  };
}
