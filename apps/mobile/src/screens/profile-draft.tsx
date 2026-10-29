import { useRef, useState } from "react";
import { usePreventRemove } from "expo-router";
import { ConfirmDialog } from "../components/ui";
export function useProfileDraftGuard(dirty: boolean, pending = false) {
  const [visible, setVisible] = useState(false), [allowed, setAllowed] = useState(false);
  const repeat = useRef<() => void>(() => {});
  const disable = usePreventRemove(dirty && !allowed, event => { repeat.current = event.repeat; setVisible(true); });
  const allow = () => { setAllowed(true); disable(); };
  return { allow, dialog: visible ? <ConfirmDialog visible title={pending ? "A save is in progress" : "Discard unsaved changes?"} message={pending ? "Wait for the save result before leaving. If it is uncertain, reload saved records before creating another change." : "Your unsaved form stays here until you confirm leaving. Changes are not queued or uploaded automatically."} busy={pending} destructive onCancel={() => setVisible(false)} onConfirm={() => { allow(); setVisible(false); repeat.current(); }} /> : null };
}
