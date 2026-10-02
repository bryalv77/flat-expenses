import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Platform, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

/** Semantic name -> [SF Symbol, Ionicons]. One map, two renderers. */
export const iconMap = {
  // navigation / UI
  home: ['house.fill', 'home'],
  receipt: ['doc.text.fill', 'receipt'],
  chart: ['chart.bar.fill', 'bar-chart'],
  people: ['person.2.fill', 'people'],
  person: ['person.crop.circle.fill', 'person-circle'],
  chevronRight: ['chevron.right', 'chevron-forward'],
  chevronDown: ['chevron.down', 'chevron-down'],
  plus: ['plus', 'add'],
  close: ['xmark', 'close'],
  check: ['checkmark', 'checkmark'],
  checkCircle: ['checkmark.circle.fill', 'checkmark-circle'],
  trash: ['trash', 'trash'],
  edit: ['pencil', 'pencil'],
  archive: ['archivebox', 'archive'],
  share: ['square.and.arrow.up', 'share-outline'],
  copy: ['doc.on.doc', 'copy-outline'],
  camera: ['camera.fill', 'camera'],
  photo: ['photo.fill', 'image'],
  document: ['doc.fill', 'document'],
  folder: ['folder.fill', 'folder'],
  calendar: ['calendar', 'calendar'],
  settings: ['gearshape.fill', 'settings'],
  search: ['magnifyingglass', 'search'],
  warning: ['exclamationmark.triangle.fill', 'warning'],
  info: ['info.circle.fill', 'information-circle'],
  arrowUp: ['arrow.up', 'arrow-up'],
  arrowDown: ['arrow.down', 'arrow-down'],
  qr: ['qrcode', 'qr-code'],
  key: ['key.fill', 'key'],
  lock: ['lock.fill', 'lock-closed'],
  logout: ['rectangle.portrait.and.arrow.right', 'log-out'],
  // category icons
  bolt: ['bolt.fill', 'flash'],
  wifi: ['wifi', 'wifi'],
  phone: ['phone.fill', 'call'],
  flame: ['flame.fill', 'flame'],
  drop: ['drop.fill', 'water'],
  sparkles: ['sparkles', 'sparkles'],
  tv: ['tv.fill', 'tv'],
  music: ['music.note', 'musical-notes'],
  game: ['gamecontroller.fill', 'game-controller'],
  film: ['film.fill', 'film'],
  book: ['book.fill', 'book'],
  cart: ['cart.fill', 'cart'],
  food: ['fork.knife', 'restaurant'],
  coffee: ['cup.and.saucer.fill', 'cafe'],
  wine: ['wineglass.fill', 'wine'],
  pizza: ['takeoutbag.and.cup.and.straw.fill', 'pizza'],
  car: ['car.fill', 'car'],
  bus: ['bus.fill', 'bus'],
  bike: ['bicycle', 'bicycle'],
  fuel: ['fuelpump.fill', 'speedometer'],
  plane: ['airplane', 'airplane'],
  building: ['building.2.fill', 'business'],
  bed: ['bed.double.fill', 'bed'],
  sofa: ['sofa.fill', 'home-outline'],
  hammer: ['hammer.fill', 'hammer'],
  wrench: ['wrench.and.screwdriver.fill', 'construct'],
  paint: ['paintbrush.fill', 'color-palette'],
  trashCan: ['trash.fill', 'trash-bin'],
  leaf: ['leaf.fill', 'leaf'],
  snow: ['snowflake', 'snow'],
  sun: ['sun.max.fill', 'sunny'],
  moon: ['moon.fill', 'moon'],
  tree: ['tree.fill', 'rose'],
  paw: ['pawprint.fill', 'paw'],
  heart: ['heart.fill', 'heart'],
  cross: ['cross.case.fill', 'medkit'],
  shield: ['shield.fill', 'shield-checkmark'],
  gift: ['gift.fill', 'gift'],
  bag: ['bag.fill', 'bag'],
  tshirt: ['tshirt.fill', 'shirt'],
  card: ['creditcard.fill', 'card'],
  euro: ['eurosign.circle.fill', 'cash'],
  bank: ['banknote.fill', 'wallet'],
  dumbbell: ['dumbbell.fill', 'barbell'],
  cloud: ['cloud.fill', 'cloud'],
  laptop: ['laptopcomputer', 'laptop'],
  printer: ['printer.fill', 'print'],
  mail: ['envelope.fill', 'mail'],
  package: ['shippingbox.fill', 'cube'],
  star: ['star.fill', 'star'],
  clock: ['clock.fill', 'time'],
  tag: ['tag.fill', 'pricetag'],
  washer: ['washer.fill', 'shirt-outline'],
  fridge: ['refrigerator.fill', 'snow-outline'],
  lightbulb: ['lightbulb.fill', 'bulb'],
} as const satisfies Record<string, readonly [string, string]>;

export type IconName = keyof typeof iconMap;

export const categoryIconNames: readonly IconName[] = [
  'home', 'bolt', 'wifi', 'phone', 'flame', 'drop', 'sparkles', 'tv', 'music', 'game', 'film', 'book',
  'cart', 'food', 'coffee', 'wine', 'pizza', 'car', 'bus', 'bike', 'fuel', 'plane', 'building', 'bed',
  'sofa', 'hammer', 'wrench', 'paint', 'trashCan', 'leaf', 'snow', 'sun', 'moon', 'tree', 'paw', 'heart',
  'cross', 'shield', 'gift', 'bag', 'tshirt', 'card', 'euro', 'bank', 'dumbbell', 'cloud', 'laptop',
  'printer', 'mail', 'package', 'star', 'clock', 'tag', 'washer', 'fridge', 'lightbulb', 'key', 'lock',
  'document', 'calendar',
];

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(iconMap, name);
}

interface IconProps {
  name: IconName | string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 22, color, style }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.tint;
  const [sf, ion] = isIconName(name) ? iconMap[name] : iconMap.tag;
  if (Platform.OS === 'ios') {
    return <SymbolView name={sf as SFSymbol} size={size} tintColor={tint} resizeMode="scaleAspectFit" style={{ width: size, height: size }} />;
  }
  return <Ionicons name={ion as keyof typeof Ionicons.glyphMap} size={size} color={tint} style={style} />;
}
