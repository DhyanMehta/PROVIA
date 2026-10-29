import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { radius, spacing, useTheme } from "../../theme";
import { AppIcon } from "./icon";
import { AppText } from "./text";
import { LoadingSkeleton } from "./states";

// Only public image URLs; never forward URL credentials, tokens or signed query strings.
export function validImageUri(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    return url.href;
  } catch { return undefined; }
}
export function PhotoContainer({ uri, label, aspectRatio = 16 / 9 }: { uri?: string | null; label: string; aspectRatio?: number }) {
  const { colors } = useTheme();
  const safeUri = validImageUri(uri);
  const [failedUri, setFailedUri] = useState<string>();
  return <View style={{ aspectRatio: Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.pale, alignItems: "center", justifyContent: "center", gap: spacing.sm }}>
    {safeUri && safeUri !== failedUri ? <PublicPhoto key={safeUri} uri={safeUri} label={label} onError={() => setFailedUri(safeUri)} /> : <View accessible accessibilityLabel={`${label}: photo unavailable`} style={{ gap: spacing.sm, alignItems: "center" }}><AppIcon name="image" color={colors.muted} size={28} /><AppText variant="caption" tone="muted">Photo unavailable</AppText></View>}
  </View>;
}

function PublicPhoto({ uri, label, onError }: { uri: string; label: string; onError: () => void }) {
  const [loading, setLoading] = useState(true);
  return <><Image source={{ uri }} accessibilityLabel={label} accessible contentFit="cover" cachePolicy="memory-disk" onLoad={() => setLoading(false)} onError={onError} style={{ width: "100%", height: "100%" }} />
    {loading ? <View pointerEvents="none" style={{ position: "absolute", left: spacing.lg, right: spacing.lg }}><LoadingSkeleton lines={2} /></View> : null}
  </>;
}
