/** Состояние вида: камера и слои. Переживает перезагрузку страницы. */

import { persist } from './persist.svelte';

export type BaseLayerId = 'topo' | 'osm' | 'satellite';

export interface ViewState {
  center: [lng: number, lat: number];
  zoom: number;
  bearing: number;
  pitch: number;
  base: BaseLayerId;
  satellite: { on: boolean; opacity: number };
  hillshade: { on: boolean; strength: number };
  contours: { on: boolean };
  grid: { on: boolean };
  /** Кольца вокруг всех фишек разом; у отдельной фишки они включаются в её редакторе. */
  rings: { weapons: boolean; reach: boolean };
  terrain3d: boolean;
}

const STORAGE_KEY = 'maptool.view';

function defaults(): ViewState {
  return {
    // Джелалабад
    center: [70.45, 34.43],
    zoom: 11.5,
    bearing: 0,
    pitch: 0,
    base: 'topo',
    satellite: { on: false, opacity: 0.6 },
    hillshade: { on: false, strength: 0.5 },
    contours: { on: false },
    grid: { on: false },
    rings: { weapons: false, reach: false },
    terrain3d: false,
  };
}

function load(): ViewState {
  const state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(state) as (keyof ViewState)[]) {
        const value = saved[key];
        if (value === undefined || value === null) continue;
        const current = state[key];
        if (typeof current === 'object' && !Array.isArray(current)) {
          Object.assign(current, value);
        } else {
          (state[key] as unknown) = value;
        }
      }
    }
  } catch {
    // Хранилище недоступно или повреждено — работаем с настройками по умолчанию.
  }
  return state;
}

export const view = $state<ViewState>(load());

persist(STORAGE_KEY, () => JSON.stringify(view));
