/** Стиль карты и применение к нему состояния слоёв. */

import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import type { BaseLayerId, ViewState } from '../model/view.svelte';
import { CREDITS, DEM_MAXZOOM, DEM_TILES, RASTER_SOURCES, type Credit } from './sources';

const BASE_IDS = Object.keys(RASTER_SOURCES) as BaseLayerId[];

const GLYPHS = `${location.origin}${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`;

/** Наклон камеры в 3D-режиме по умолчанию и его предел. */
export const PITCH_3D = 60;
export const MAX_PITCH_3D = 80;

const CONTOUR_INK = {
  light: { line: '#7a3d12', text: '#5e2e0c', halo: 'rgba(255, 255, 255, 0.85)' },
  dark: { line: '#ffc9ad', text: '#ffe3d4', halo: 'rgba(30, 30, 34, 0.85)' },
};

function visibility(on: boolean): 'visible' | 'none' {
  return on ? 'visible' : 'none';
}

function satelliteOverlayOn(view: ViewState): boolean {
  return view.satellite.on && view.base !== 'satellite';
}

/** Подложка тёмная, если видны в основном снимки: линиям поверх неё нужен светлый цвет. */
export function darkBackdrop(view: ViewState): boolean {
  return view.base === 'satellite' || (satelliteOverlayOn(view) && view.satellite.opacity > 0.5);
}

function contourInk(view: ViewState) {
  return darkBackdrop(view) ? CONTOUR_INK.dark : CONTOUR_INK.light;
}

export function buildStyle(view: ViewState, contourTiles: string): StyleSpecification {
  const ink = contourInk(view);
  const dem = {
    type: 'raster-dem' as const,
    tiles: [DEM_TILES],
    encoding: 'terrarium' as const,
    tileSize: 256,
    maxzoom: DEM_MAXZOOM,
  };

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      ...Object.fromEntries(
        BASE_IDS.map((id) => [id, { type: 'raster', tileSize: 256, ...RASTER_SOURCES[id] }]),
      ),
      // Отмывке и 3D-рельефу нужны отдельные источники, иначе на стыках тайлов появляются швы.
      'dem-hillshade': dem,
      'dem-terrain': dem,
      contours: { type: 'vector', tiles: [contourTiles], maxzoom: 15 },
    },
    sky: {
      'sky-color': '#2b2b30',
      'horizon-color': '#6a6a73',
      'fog-color': '#424249',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.85,
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#35353b' } },
      ...BASE_IDS.map((id) => ({
        id: `base-${id}`,
        type: 'raster' as const,
        source: id,
        layout: { visibility: visibility(view.base === id) },
      })),
      {
        id: 'overlay-satellite',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: visibility(satelliteOverlayOn(view)) },
        paint: { 'raster-opacity': view.satellite.opacity },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem-hillshade',
        layout: { visibility: visibility(view.hillshade.on) },
        paint: {
          'hillshade-exaggeration': view.hillshade.strength,
          'hillshade-shadow-color': '#1e1e22',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#1e1e22',
        },
      },
      {
        id: 'contour-lines',
        type: 'line',
        source: 'contours',
        'source-layer': 'contours',
        layout: { visibility: visibility(view.contours.on), 'line-join': 'round' },
        paint: {
          'line-color': ink.line,
          'line-opacity': ['match', ['get', 'level'], 1, 1, 0.7],
          'line-width': ['match', ['get', 'level'], 1, 1.4, 0.7],
        },
      },
      {
        id: 'contour-labels',
        type: 'symbol',
        source: 'contours',
        'source-layer': 'contours',
        filter: ['>', ['get', 'level'], 0],
        layout: {
          visibility: visibility(view.contours.on),
          'symbol-placement': 'line',
          'symbol-spacing': 200,
          'text-field': ['to-string', ['get', 'ele']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 10,
          // Горизонтали из 30-метрового DEM ломаные. При меньшем допуске подписи почти нигде
          // не помещаются, при большем — на изрезанных линиях долин цифры налезают друг на друга.
          'text-max-angle': 55,
        },
        paint: {
          'text-color': ink.text,
          'text-halo-color': ink.halo,
          'text-halo-width': 1.4,
        },
      },
    ],
  };
}

export function applyBase(map: MlMap, view: ViewState): void {
  for (const id of BASE_IDS) {
    map.setLayoutProperty(`base-${id}`, 'visibility', visibility(view.base === id));
  }
}

export function applySatellite(map: MlMap, view: ViewState): void {
  map.setLayoutProperty('overlay-satellite', 'visibility', visibility(satelliteOverlayOn(view)));
  map.setPaintProperty('overlay-satellite', 'raster-opacity', view.satellite.opacity);
}

export function applyHillshade(map: MlMap, view: ViewState): void {
  map.setLayoutProperty('hillshade', 'visibility', visibility(view.hillshade.on));
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', view.hillshade.strength);
}

export function applyContours(map: MlMap, view: ViewState): void {
  const ink = contourInk(view);
  const shown = visibility(view.contours.on);
  map.setLayoutProperty('contour-lines', 'visibility', shown);
  map.setLayoutProperty('contour-labels', 'visibility', shown);
  map.setPaintProperty('contour-lines', 'line-color', ink.line);
  map.setPaintProperty('contour-labels', 'text-color', ink.text);
  map.setPaintProperty('contour-labels', 'text-halo-color', ink.halo);
}

/** Источники, которым обязаны видимые сейчас слои. */
export function activeCredits(view: ViewState): Credit[] {
  const credits: Credit[] = [];
  if (view.base !== 'satellite') credits.push(CREDITS.osm);
  if (view.base === 'topo') credits.push(CREDITS.topo);
  if (view.base === 'satellite' || satelliteOverlayOn(view)) credits.push(CREDITS.satellite);
  if (view.hillshade.on || view.contours.on || view.terrain3d) credits.push(CREDITS.dem);
  return credits;
}
