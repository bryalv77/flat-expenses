/** Icon names written by older seeds/imports (Ionicons names) -> the canonical keys of `iconMap`. */
const LEGACY_ICON_ALIASES: Record<string, string> = { flash: 'bolt', call: 'phone', water: 'drop' };

export const normalizeIconName = (name: string): string => LEGACY_ICON_ALIASES[name] ?? name;
