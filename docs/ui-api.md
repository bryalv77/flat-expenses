# UI API

Import primitives from `@/components/ui`, charts from `@/components/charts`, theme from `@/theme`, i18n from `@/i18n`.
All components read colors via `useTheme()` and need `<ThemeProvider>` (+ `<ToastProvider>`, `GestureHandlerRootView`, `SafeAreaProvider`) at the root.

## Hooks / helpers
- `useTheme(): { scheme: 'light'|'dark'; colors: Palette; mode: 'system'|'light'|'dark'; setMode(mode) }`
- `useT(): { t(key: TranslationKey, vars?): string; locale: 'es'|'en' }`
- `useIsWide(): boolean` — window width >= 1024 (sidebar layout on web).
- `useToast(): { show(msg, kind?), success(msg), error(msg) }`
- `haptics` (`@/lib/haptics`): `selection() light() medium() success() error()` — no-op on web.
- Tokens (`@/theme`): `spacing`, `radii`, `typography`, `fontFamily`, `categoryColors`, `MAX_CONTENT_WIDTH` (720), `WIDE_BREAKPOINT` (1024), `MIN_TOUCH` (44).

## Layout
- `Screen { children; title?: string; headerRight?: ReactNode; scroll?=true; refreshing?; onRefresh?; bottomInset?; contentStyle? }` — safe area, centered max width 720, `title` enables large collapsing title with blurred compact bar.
- `LargeTitle { title; right? }`, `LargeTitleHeader { title; scrollY: SharedValue<number>; right? }` (used internally by Screen).
- `Section { header?; footer?; children }` — inset-grouped card with hairline separators between children.
- `Card { children; style?; padded?=true }`
- `EmptyState { icon?: IconName; title; message?; actionLabel?; onAction? }`
- `Skeleton { width?; height?; radius? }`
- `ErrorBoundary { children; fallbackTitle?; retryLabel? }` (class; resets on retry)

## Controls
- `Button { title; onPress; variant?: 'filled'|'tinted'|'plain'; destructive?; loading?; disabled?; icon?; fullWidth?=true; style? }`
- `ListRow { title; subtitle?; value?; icon?; iconColor?; leading?; trailing?; chevron?; destructive?; onPress?; swipeActions?: {label; onPress; destructive?; color?}[]; accessibilityLabel? }`
- `Switch { value; onValueChange; disabled?; accessibilityLabel? }`
- `SegmentedControl<T extends string> { options: {value:T; label}[]; value: T; onChange(v: T) }`
- `Chip { label; selected?; onPress?; icon?; color? }`
- `Badge { label; tone?: 'neutral'|'blue'|'green'|'red'|'orange' }`
- `Avatar { name?; uri? (resolved URL); size?=40 }`
- `Text { variant?: TypographyVariant; color?: 'label'|'secondaryLabel'|'tertiaryLabel'|'tint'|'red'|'green'|'orange'|hex }`
- `Icon { name: IconName|string; size?; color? }` — SF Symbols on iOS, Ionicons elsewhere. `iconMap`, `IconName`, `categoryIconNames` (60 curated), `isIconName(s)`.

## Forms (react-hook-form: wrap in `Controller`)
- `TextField { label?; error?; hint?; inline?; ...TextInputProps }`
- `MoneyInput { value: number|null (cents); onChange(cents|null); label?; error?; hint?; inline?; placeholder? }`
- `DatePickerField { value: 'YYYY-MM-DD'|null; onChange(iso|null); label; error?; clearable? }`
- `FilePickerField { value: PickedFile|null; onChange; label; error?; imageOnly? }` where `PickedFile = { uri; name; mimeType; size: number|null }` (camera hidden on web)
- `ColorPicker { value: hex; onChange(hex); colors? }`
- `IconPicker { value: string; onChange(name); color? }`

## Overlays
- `BottomSheet { visible; onClose; title?; children }`
- `ActionSheet { visible; onClose; title?; message?; options: {label; onPress; destructive?}[]; cancelLabel? }`
- `ToastProvider` / `useToast`

## Charts (`@/components/charts`, react-native-svg, values in integer cents)
- `BarChart { data: {key,label,value,color?}[]; height?; selectedKey?; onSelect?(key); accessibilityLabel?; formatValue? }`
- `StackedBarChart { data: {key,label,segments:{key,value,color}[]}[]; height?; selectedKey?; onSelect?(key); accessibilityLabel? }`
- `DonutChart { slices: {key,label,value,color}[]; size?; thickness?; centerLabel?; centerValue?; selectedKey?; onSelect?(key) }` (legend rendered when `onSelect` given)
- `LineChart { xLabels: string[]; series: {key,label,color,values:(number|null)[],dashed?}[]; height?; selectedIndex?; onSelect?(index); accessibilityLabel? }`

## i18n
`src/i18n/{es,en}.ts` share one shape; add keys to `es.ts` first (type source), then `en.ts`. Keys are dotted: `t('expenses.newBill')`, interpolation `{{n}}`.
