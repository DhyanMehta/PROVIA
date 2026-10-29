import { useCallback, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, Copy, ErrorNote, Field, Page, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { ApiError, errorMessage } from "../../lib/api-client";
import { Back, FormError, useNutritionParams } from "./common";
import { barcodeInput } from "./forms";
import { foodCheck } from "./contracts";
export default function BarcodeScreen() {
  const api = useApi(), { kind } = useNutritionParams();
  const [permission, requestPermission] = useCameraPermissions();
  const [enabled, setEnabled] = useState(false), [focused, setFocused] = useState(false), [barcode, setBarcode] = useState(""), [failure, setFailure] = useState<unknown>(), [busy, setBusy] = useState(false), [cameraError, setCameraError] = useState(false);
  const pending = useRef(false), controller = useRef<AbortController | null>(null);
  useFocusEffect(useCallback(() => { setFocused(true); return () => { setFocused(false); setEnabled(false); controller.current?.abort(); }; }, []));
  async function find(text: string) {
    if (pending.current) return;
    try {
      const value = barcodeInput(text); pending.current = true; setBusy(true); setFailure(undefined); setEnabled(false); setBarcode(value);
      const abort = new AbortController(); controller.current = abort;
      const food = await api.request("get", "/api/v1/foods/barcode/{barcode}", { params: { barcode: value }, signal: abort.signal, validate: foodCheck });
      if (!abort.signal.aborted) router.replace({ pathname: "/nutrition/food/[food_id]", params: { food_id: food.id, kind } });
    } catch (error) { setFailure(error); } finally { pending.current = false; setBusy(false); }
  }
  function scanned(result: BarcodeScanningResult) { if (!pending.current && /^[0-9]{8,14}$/.test(result.data)) void find(result.data); }
  return <Page><Back /><Title>Scan a food barcode</Title><Copy>Camera access is optional and is used only while this scanner is open. No photo is captured or uploaded. Always check the returned product and nutrition against the label.</Copy><Field label="Barcode digits" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" maxLength={14} editable={!busy} /><Action label="Look up barcode" loading={busy} disabled={busy} onPress={() => { void find(barcode); }} />
    {failure instanceof ApiError && failure.status === 404 ? <Card><Copy>No supported gram-based food was found. Search the catalog or create a food from measured label nutrition.</Copy><Action label="Search foods" secondary onPress={() => router.replace("/nutrition/search")} /><Action label="Create custom food" secondary onPress={() => router.replace("/nutrition/custom-food")} /></Card> : failure instanceof ApiError ? <ErrorNote message={errorMessage(failure)} /> : <FormError error={failure} />}
    {!permission?.granted ? <><Copy>{permission?.canAskAgain === false ? "Camera permission is denied. Continue manually or enable Camera in Android settings." : "Allow camera access to scan a product barcode."}</Copy><Action label={permission?.canAskAgain === false ? "Open camera settings" : "Allow camera"} secondary onPress={() => { if (permission?.canAskAgain === false) void Linking.openSettings().catch(() => setCameraError(true)); else void requestPermission().catch(() => setCameraError(true)); }} /></> : <Action label={enabled ? "Stop camera" : "Start barcode scanner"} secondary disabled={busy || cameraError} onPress={() => setEnabled(value => !value)} />}
    {cameraError ? <Copy>The camera could not start on this device. Manual barcode lookup remains available.</Copy> : null}
    {enabled && focused && permission?.granted && !cameraError ? <View style={{ height: 260, overflow: "hidden", borderRadius: 12 }}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "itf14"] }} onBarcodeScanned={scanned} onMountError={() => { setCameraError(true); setEnabled(false); }} /></View> : null}
  </Page>;
}
