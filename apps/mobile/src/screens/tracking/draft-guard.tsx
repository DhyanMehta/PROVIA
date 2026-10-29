import { useState } from "react";
import { usePreventRemove } from "expo-router";
import { ConfirmDialog } from "../../components/ui";

/** Retain entered values and unknown submissions until explicit reconciliation. */
export function useTrackingDraftGuard(dirty: boolean, pending: boolean, uncertain: boolean) {
  const [discarded, setDiscarded] = useState(false);
  const [blocked, setBlocked] = useState<(() => void) | null>(null);
  const disable = usePreventRemove(!discarded && (dirty || pending || uncertain), ({ repeat }) => setBlocked(() => repeat));
  const allowLeave = () => { setDiscarded(true); disable(); };
  return {
    allowLeave,
    dialog: <ConfirmDialog visible={!!blocked} title={pending ? "Save in progress" : uncertain ? "Resolve the save first" : "Discard unsaved changes?"}
      message={pending ? "Wait for the current request to finish. Your input stays here." : uncertain ? "The save result is unknown. Stay on this screen and refresh saved records or retry the retained original submission before leaving." : "Your unsaved form values will be discarded. Saved records are unchanged."}
      confirmLabel={pending || uncertain ? "Keep this screen open" : "Discard changes"} destructive={!pending && !uncertain}
      onCancel={() => setBlocked(null)} onConfirm={() => {
        if (pending || uncertain) { setBlocked(null); return; }
        const repeat = blocked; allowLeave(); setBlocked(null); repeat?.();
      }} />,
  };
}
