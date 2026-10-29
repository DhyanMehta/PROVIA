# Phase 5 mobile design system

The mobile foundation uses warm neutral surfaces, charcoal text and one restrained
forest-green accent. Semantic tokens have paired light/dark values; the system
appearance selects the pair. Wallpaper colors do not change health-data contrast.
Existing application icons and signing identity are preserved. No new decorative
logo, stock photography, generated artwork or fabricated fitness data is included.

## Tokens and typography

`apps/mobile/src/theme.ts` is the token source. The spacing scale is 4 / 8 / 12 /
16 / 20 / 24 / 32 / 40. Screen gutters are 20; compact layout gaps are 8–16. Shape
tokens are 8 for small elements, 12 for controls, 16 for cards and 24 for sheets.
Surfaces use a one-pixel border, without decorative shadows or gradients.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F5F5F0` | `#111C16` |
| Card | `#FFFFFF` | `#1B2A21` |
| Text | `#1C2923` | `#F1F5ED` |
| Secondary text | `#58675E` | `#B5C5B9` |
| Accent | `#176B49` | `#9BDAB2` |
| Border | `#D7DED7` | `#3A5142` |
| Danger | `#A02D2D` | `#FFB4AB` |
| Warning | `#835817` | `#F3CE84` |

Inter is the sole custom font family. Regular, medium, semibold and bold are loaded
from the SDK-compatible `@expo-google-fonts/inter` package. It has explicit SIL
Open Font License 1.1 redistribution rights. See the [Inter project](https://rsms.me/inter/)
and the included `apps/mobile/assets/licenses/Inter-OFL.txt`. Root font loading must
finish before the main app appears. Native platform controls retain native font
and accessibility behavior; their labels are not forced into a synthetic typeface.

| Variant | Size / line height | Weight |
| --- | --- | --- |
| Display | 38 / 46 | Semibold, tabular digits |
| Screen title | 28 / 36 | Semibold |
| Heading | 20 / 28 | Semibold |
| Body | 15 / 23 | Regular |
| Label | 14 / 20 | Medium |
| Caption | 12 / 18 | Regular |
| Metric number | 24 / 32 | Semibold, tabular digits |

Font scaling remains enabled. Use wrapping rows and minimum control sizes rather
than fixed text-container heights. Actual large-font Android rendering still needs
device acceptance; token tests cannot establish rendering quality.

## Public components

Import screen primitives from `src/components/ui.tsx`; the existing Page, Title,
Copy, Card, Action, Field, ErrorNote, Busy and Value APIs remain compatible.
Implementations live in `src/components/design/`.

| Component | Behavior |
| --- | --- |
| Page | Safe areas, keyboard avoidance, bounded content width, optional pull-to-refresh. `scroll={false}` hosts virtualized lists without nesting a ScrollView. |
| AppText / Title / Copy / SectionHeader | Central type variants and semantic colors; headings expose header roles. |
| Card / Value / MetricRow | Consistent surface spacing and wrapping, selectable metric values. |
| Action | Native `@expo/ui` button with primary/secondary/danger/quiet variants, disabled and loading states; host has a 48-point minimum. |
| Field / PasswordField / NumberField | Native React Native inputs, persistent labels, hint/error text, appropriate keyboards and explicit password visibility. |
| SelectField | Controlled native `@expo/ui` Picker with declared label/value options. |
| DateTimeField | Native SDK58 date/time dialog, visible zone label, range constraints and an offset-safe fallback when native zone support is insufficient. |
| AppIcon / IconButton | One Lucide outline family. Icon buttons require a spoken action label and have 48-point touch targets. |
| LoadingSkeleton / Busy | Truthful loading indication. Static skeletons require no motion and respect reduced-motion needs. |
| EmptyState / ErrorState / ErrorNote | Distinct no-data and failed-request states; errors can expose an explicit retry action. |
| ProgressBar / MacroProgress | Unknown values remain unknown; only bar geometry is bounded. Negative remaining nutrients remain visible. |
| PhotoContainer | Public HTTPS image, cache, loading skeleton, accessible description and truthful missing/error fallback. |
| ConfirmDialog | Native bottom sheet with explicit confirm/cancel and busy guards. No mutation is performed just by opening it. |
| ChartContainer | Reusable chart heading/description/surface. Feature charts supply real history and text alternatives. |

Native `@expo/ui` controls were reviewed before implementation against the
[SDK58 UI reference](https://docs.expo.dev/versions/v58.0.0/sdk/ui/) and installed
58.0.24 declarations, then rechecked with the SDK-aligned58.0.25 patch. Native buttons, picker and bottom sheet are reused. React
Native input/layout composition preserves current keyboard behavior, testability,
cross-platform rendering and the existing app rather than introducing a second UI
framework. SDK58 native universal style supports padding and width, not minHeight;
the surrounding native Host sets the minimum height.

`DateTimeField.timeZoneName` is supported by the native iOS picker. SDK58's Android
picker exposes only device-zone selection. If the requested profile zone differs
from the device zone, Android/web show an explicitly offset-bearing ISO timestamp
field instead of silently assigning the profile zone to a device-local time. The
field requires a valid calendar date and `Z` or `±HH:MM`, and applies range checks.
For date-only business values, feature forms must preserve their calendar string
and use the shared profile-zone helpers; an instant is not a date-only value.

## Media and license inventory

| Asset / source | Use | Rights / handling |
| --- | --- | --- |
| Existing `assets/images/icon.png`, adaptive icon layers, splash icon and favicon | Existing application identity | Preserved repository assets; original provenance is not newly asserted. |
| Inter Regular/Medium/Semibold/Bold from `@expo-google-fonts/inter` | Text | SIL OFL 1.1; copyright and complete license copied into `assets/licenses/Inter-OFL.txt`. |
| Lucide React Native outline icons | Meaningful navigation/actions | Package license includes ISC Lucide terms and MIT terms for Feather-derived icons; complete notice copied into `assets/licenses/Lucide-LICENSE.txt`. |
| Backend exercise `media_reference`, when it supplies an authorized public image | Exercise detail | Renderer does not grant redistribution rights. Accept only appropriately licensed/provider-authorized content. No URLs are fabricated. |
| Food photography | No current frozen food image field | Use truthful fallback; do not infer a photo URL or substitute unrelated stock photography. |

No photos were acquired, downloaded, embedded or licensed during this step. Remote
images are rendered only when given a valid public HTTPS URL without userinfo,
query strings or fragments; signed/tokenized URLs are deliberately rejected.
`expo-image` provides on-demand memory/disk caching. It does not preload catalogs.
The fallback says “Photo unavailable” and identifies the subject to screen readers.
The license notices must remain available in distributed legal notices.

## Charts, accessibility and verification limits

Use real, bounded history queries. Present units, date range, source/coverage and
text values alongside visual geometry. Do not create a line through unknown data
or report missing records as zero. Accent and border tokens define chart color;
color alone must not encode success/failure or series meaning. The foundation does
not fabricate chart data or calculate nutrition targets.

Controls retain platform accessibility, fields have persistent labels, icon-only
buttons require action labels, failures announce alerts and progress bars expose
spoken values or “Not recorded.” Tests check 4.5:1 semantic foreground contrast on
both primary surfaces, password visibility, controlled selection, explicit
confirmation, retry, image safety/fallback, offset parsing, unknown progress and
negative remaining values. Native picker/sheet presentation, TalkBack traversal,
keyboard occlusion, actual font rendering and screenshots require the separate
Android/device review; component tests use isolated native-control doubles.
