import { Activity, ArrowLeft, ArrowRight, CalendarDays, Camera, Check, ChevronRight, Clock, Droplets, Dumbbell, Eye, EyeOff, Image, LayoutDashboard, LogOut, Moon, MoreHorizontal, Plus, RefreshCw, Search, Settings, ShieldCheck, SquarePen, Trash2, TrendingUp, TriangleAlert, UserRound, Utensils, Weight, X } from "lucide-react-native";
import { Pressable } from "react-native";
import { useTheme } from "../../theme";

const icons = { dashboard: LayoutDashboard, nutrition: Utensils, workout: Dumbbell, tracking: Activity, progress: TrendingUp, profile: UserRound, add: Plus, close: X, search: Search, back: ArrowLeft, next: ChevronRight, edit: SquarePen, trash: Trash2, calendar: CalendarDays, clock: Clock, weight: Weight, water: Droplets, activity: Activity, sleep: Moon, settings: Settings, check: Check, eye: Eye, "eye-off": EyeOff, camera: Camera, warning: TriangleAlert, refresh: RefreshCw, image: Image, more: MoreHorizontal, logout: LogOut, shield: ShieldCheck, forward: ArrowRight };
export type IconName = keyof typeof icons;
export function AppIcon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  const Icon = icons[name];
  return <Icon size={size} color={color ?? colors.text} strokeWidth={1.8} accessible={false} />;
}
export function IconButton({ name, label, onPress, disabled = false, tone = "text" }: { name: IconName; label: string; onPress: () => void; disabled?: boolean; tone?: "text" | "accent" | "danger" }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", opacity: disabled ? 0.5 : pressed ? 0.65 : 1 })}>
    <AppIcon name={name} color={colors[tone]} />
  </Pressable>;
}
