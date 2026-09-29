/** Тайловые источники. Ключи не нужны, все отдают Access-Control-Allow-Origin: *. */

import type { BaseLayerId } from '../model/view.svelte';

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Глубже данные SRTM только интерполируются, новых деталей рельефа не появляется. */
export const DEM_MAXZOOM = 13;

export interface RasterSource {
  tiles: string[];
  maxzoom: number;
}

export const RASTER_SOURCES: Record<BaseLayerId, RasterSource> = {
  topo: {
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    maxzoom: 17,
  },
  osm: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
  },
  satellite: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    maxzoom: 18,
  },
};

export const BASE_LABELS: Record<BaseLayerId, string> = {
  topo: 'Топокарта',
  osm: 'OpenStreetMap',
  satellite: 'Спутник',
};

export interface Credit {
  text: string;
  href: string;
}

export const CREDITS = {
  osm: { text: '© участники OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
  topo: { text: '© OpenTopoMap (CC-BY-SA)', href: 'https://opentopomap.org/about' },
  satellite: {
    text: 'Снимки: Esri, Maxar, Earthstar Geographics',
    href: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
  },
  dem: {
    text: 'Рельеф: Terrain Tiles (SRTM)',
    href: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  },
} satisfies Record<string, Credit>;
