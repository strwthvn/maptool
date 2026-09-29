/**
 * Настройки показа: формат координат, единицы углов, развёрнут ли профиль высот.
 * Переживают перезагрузку страницы.
 */

import { ANGLE_UNITS, isAngleUnit, type AngleUnit } from '../core/angles';
import { COORD_FORMATS, isCoordFormat, type CoordFormat } from '../core/coords';
import { persist } from './persist.svelte';

export interface Settings {
  coords: CoordFormat;
  angles: AngleUnit;
  /** Профиль высот под картой развёрнут. */
  profile: boolean;
}

const STORAGE_KEY = 'maptool.settings';

function load(): Settings {
  const state: Settings = { coords: 'dd', angles: 'deg', profile: true };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (isCoordFormat(saved?.coords)) state.coords = saved.coords;
    if (isAngleUnit(saved?.angles)) state.angles = saved.angles;
    if (typeof saved?.profile === 'boolean') state.profile = saved.profile;
  } catch {
    // Хранилище недоступно или повреждено — работаем с настройками по умолчанию.
  }
  return state;
}

export const settings = $state<Settings>(load());

/** Следующий по кругу формат координат. */
export function nextCoordFormat(): void {
  const index = COORD_FORMATS.findIndex((format) => format.id === settings.coords);
  settings.coords = COORD_FORMATS[(index + 1) % COORD_FORMATS.length].id;
}

export { ANGLE_UNITS, COORD_FORMATS };

persist(STORAGE_KEY, () => JSON.stringify(settings));
