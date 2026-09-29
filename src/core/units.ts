/** Фишки: справочники, модель юнита и его код символа. */

import type { MovementProfileId } from './movement';

export type Affiliation = 'friend' | 'hostile' | 'neutral' | 'unknown';

export type UnitTypeId =
  | 'infantry'
  | 'motorized'
  | 'mechanized'
  | 'armor'
  | 'antitank'
  | 'recon'
  | 'artillery'
  | 'mortar'
  | 'airdefense'
  | 'engineer'
  | 'hq'
  | 'supply'
  | 'medical'
  | 'sof'
  | 'helicopter'
  | 'attackHelicopter'
  | 'uav';

export type EchelonId =
  | 'none'
  | 'team'
  | 'squad'
  | 'section'
  | 'platoon'
  | 'company'
  | 'battalion'
  | 'regiment'
  | 'brigade'
  | 'division';

export type UnitStatus = 'present' | 'anticipated' | 'capable' | 'damaged' | 'destroyed';

export interface WeaponRange {
  name: string;
  meters: number;
}

export interface Unit {
  id: string;
  affiliation: Affiliation;
  type: UnitTypeId;
  echelon: EchelonId;
  status: UnitStatus;
  callsign: string;
  position: [lng: number, lat: number];
  movement: MovementProfileId;
  ranges: WeaponRange[];
  /** Кольца дальности оружия показаны на карте. */
  showRanges: boolean;
  /** Кольца досягаемости за ход показаны на карте. */
  showReach: boolean;
  notes: string;
}

interface Entry<Id extends string> {
  id: Id;
  label: string;
  /** Символ в буквенном коде MIL-STD-2525C / APP-6B. */
  code: string;
}

export const AFFILIATIONS: Entry<Affiliation>[] = [
  { id: 'friend', label: 'Свои', code: 'F' },
  { id: 'hostile', label: 'Противник', code: 'H' },
  { id: 'neutral', label: 'Нейтральные', code: 'N' },
  { id: 'unknown', label: 'Неизвестные', code: 'U' },
];

export interface UnitType extends Entry<UnitTypeId> {
  /** Буква измерения: G — наземные, A — воздушные, F — силы спецопераций. */
  dimension: 'G' | 'A' | 'F';
  headquarters?: boolean;
  movement: MovementProfileId;
}

export const UNIT_TYPES: UnitType[] = [
  { id: 'infantry', label: 'Пехота', dimension: 'G', code: 'UCI', movement: 'foot' },
  { id: 'motorized', label: 'Мотопехота', dimension: 'G', code: 'UCIM', movement: 'wheeled' },
  { id: 'mechanized', label: 'Мехпехота', dimension: 'G', code: 'UCIZ', movement: 'tracked' },
  { id: 'armor', label: 'Танки', dimension: 'G', code: 'UCA', movement: 'tracked' },
  // Мягкий перенос: слово не помещается в кнопку палитры целиком.
  { id: 'antitank', label: 'Противо\u00adтанковые', dimension: 'G', code: 'UCAA', movement: 'wheeled' },
  { id: 'recon', label: 'Разведка', dimension: 'G', code: 'UCR', movement: 'wheeled' },
  { id: 'artillery', label: 'Артиллерия', dimension: 'G', code: 'UCF', movement: 'wheeled' },
  { id: 'mortar', label: 'Миномёты', dimension: 'G', code: 'UCFM', movement: 'foot' },
  { id: 'airdefense', label: 'ПВО', dimension: 'G', code: 'UCD', movement: 'wheeled' },
  { id: 'engineer', label: 'Инженеры', dimension: 'G', code: 'UCE', movement: 'wheeled' },
  { id: 'hq', label: 'Штаб', dimension: 'G', code: 'U', headquarters: true, movement: 'wheeled' },
  { id: 'supply', label: 'Снабжение', dimension: 'G', code: 'USS', movement: 'wheeled' },
  { id: 'medical', label: 'Медики', dimension: 'G', code: 'USM', movement: 'wheeled' },
  { id: 'sof', label: 'Спецназ', dimension: 'F', code: 'G', movement: 'foot' },
  { id: 'helicopter', label: 'Вертолёт', dimension: 'A', code: 'MH', movement: 'air' },
  { id: 'attackHelicopter', label: 'Ударный вертолёт', dimension: 'A', code: 'MHA', movement: 'air' },
  { id: 'uav', label: 'БПЛА', dimension: 'A', code: 'MFQ', movement: 'air' },
];

export const ECHELONS: Entry<EchelonId>[] = [
  { id: 'none', label: 'Без эшелона', code: '-' },
  { id: 'team', label: 'Группа, расчёт', code: 'A' },
  { id: 'squad', label: 'Отделение', code: 'B' },
  { id: 'section', label: 'Секция', code: 'C' },
  { id: 'platoon', label: 'Взвод', code: 'D' },
  { id: 'company', label: 'Рота', code: 'E' },
  { id: 'battalion', label: 'Батальон', code: 'F' },
  { id: 'regiment', label: 'Полк', code: 'G' },
  { id: 'brigade', label: 'Бригада', code: 'H' },
  { id: 'division', label: 'Дивизия', code: 'I' },
];

export const STATUSES: Entry<UnitStatus>[] = [
  { id: 'present', label: 'На месте', code: 'P' },
  { id: 'anticipated', label: 'Предполагаемое положение', code: 'A' },
  { id: 'capable', label: 'Боеспособен', code: 'C' },
  { id: 'damaged', label: 'Повреждён', code: 'D' },
  { id: 'destroyed', label: 'Уничтожен', code: 'X' },
];

function entry<Id extends string, E extends Entry<Id>>(list: E[], id: Id): E {
  const found = list.find((item) => item.id === id);
  if (!found) throw new Error(`Неизвестное значение: ${id}`);
  return found;
}

export const affiliation = (id: Affiliation) => entry(AFFILIATIONS, id);
export const unitType = (id: UnitTypeId) => entry(UNIT_TYPES, id);
export const echelon = (id: EchelonId) => entry(ECHELONS, id);
export const status = (id: UnitStatus) => entry(STATUSES, id);

export function hasEchelon(type: UnitTypeId): boolean {
  return unitType(type).dimension !== 'A';
}

export type SymbolSpec = Pick<Unit, 'affiliation' | 'type' | 'echelon' | 'status'>;

/** 15-значный буквенный код символа. */
export function sidc(spec: SymbolSpec): string {
  const type = unitType(spec.type);
  const size = hasEchelon(spec.type) ? echelon(spec.echelon).code : '-';
  return [
    'S',
    affiliation(spec.affiliation).code,
    type.dimension,
    status(spec.status).code,
    type.code.padEnd(6, '-'),
    type.headquarters ? 'A' : '-',
    size,
    '---',
  ].join('');
}

/** Имя юнита для списков: позывной, а без него — тип и эшелон. */
export function unitTitle(unit: Pick<Unit, 'callsign' | 'type' | 'echelon'>): string {
  const callsign = unit.callsign.trim();
  if (callsign) return callsign;
  return unitDescription(unit);
}

export function unitDescription(unit: Pick<Unit, 'type' | 'echelon'>): string {
  const type = unitType(unit.type).label;
  if (!hasEchelon(unit.type) || unit.echelon === 'none') return type;
  return `${type}, ${echelon(unit.echelon).label.toLowerCase()}`;
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type UnitTemplate = Pick<Unit, 'affiliation' | 'type' | 'echelon'>;

export function createUnit(template: UnitTemplate, position: [number, number]): Unit {
  return {
    id: newId(),
    affiliation: template.affiliation,
    type: template.type,
    echelon: template.echelon,
    status: 'present',
    callsign: '',
    position,
    movement: unitType(template.type).movement,
    ranges: [],
    showRanges: false,
    showReach: false,
    notes: '',
  };
}

export function duplicateUnit(unit: Unit, position: [number, number]): Unit {
  return {
    ...unit,
    id: newId(),
    position,
    ranges: unit.ranges.map((range) => ({ ...range })),
  };
}

/** Смена типа. Профиль движения следует за типом, пока пользователь не выбрал его сам. */
export function retype(
  unit: Pick<Unit, 'type' | 'movement'>,
  type: UnitTypeId,
): Pick<Unit, 'type' | 'movement'> {
  const untouched = unit.movement === unitType(unit.type).movement;
  return { type, movement: untouched ? unitType(type).movement : unit.movement };
}
