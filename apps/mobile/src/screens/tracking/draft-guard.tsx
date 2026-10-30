import { useState } from "react";
import { usePreventRemove } from "expo-router";
import { ConfirmDialog } from "../../components/ui";

/** Retain entered values and unknown submissions until explicit reconciliation. */
export function useTrackingDraftGuard(dirty: boolean, pending: boolean, uncertain: boolean) {
  const [discarded, setDiscarded] = useState(false);
  const [blocked, setBlocked] = useState<{ action: () => void; leaving: boolean } | null>(null);
  const disable = usePreventRemove(!discarded && (dirty || pending || uncertain), ({ repeat }) => setBlocked({ action: repeat, leaving: true }));
  const allowLeave = () => { setDiscarded(true); disable(); };
  // Inline editor changes must not disable protection for the screen's next draft.
  const requestDiscard = (action: () => void, hasDraft = dirty) => {
    if (!hasDraft && !pending && !uncertain) { action(); return; }
    setBlocked({ action, leaving: false });
  };
  return {
    allowLeave,
    requestDiscard,
    dialog: <ConfirmDialog visible={!!blocked} title={pending ? "Save in progress" : uncertain ? "Resolve the save first" : "Discard unsaved changes?"}
      message={pending ? "Wait for the current request to finish. Your input stays here." : uncertain ? "The save result is unknown. Stay on this screen and refresh saved records or retry the retained original submission before leaving." : "Your unsaved form values will be discarded. Saved records are unchanged."}
      confirmLabel={pending || uncertain ? "Keep this screen open" : "Discard changes"} destructive={!pending && !uncertain}
      onCancel={() => setBlocked(null)} onConfirm={() => {
        if (pending || uncertain) { setBlocked(null); return; }
        const next = blocked;
        if (next?.leaving) allowLeave();
        setBlocked(null); next?.action();
      }} />,
  };
}
