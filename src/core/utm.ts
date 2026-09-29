/**
 * Проекция UTM на эллипсоиде WGS 84 по рядам Крюгера (точность — доли миллиметра
 * в пределах зоны). Полярные области (UPS) не поддерживаются.
 */

import { WGS84_A, WGS84_F, wrapLng, type LngLat } from './geodesy';

/** Широты, между которыми определены UTM и MGRS. */
export const UTM_SOUTH = -80;
export const UTM_NORTH = 84;

const BANDS = 'CDEFGHJKLMNPQRSTUVWX';

/** Высота широтного пояса, градусы. Последний пояс X выше остальных: 72…84°. */
const BAND_HEIGHT = 8;

const K0 = 0.9996;
const FALSE_EASTING = 500_000;
const FALSE_NORTHING = 10_000_000;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const E = Math.sqrt(WGS84_F * (2 - WGS84_F));
const N = WGS84_F / (2 - WGS84_F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
const N5 = N4 * N;
const N6 = N5 * N;

/** Радиус выпрямляющей сферы с учётом масштаба на осевом меридиане. */
const RADIUS = (K0 * WGS84_A * (1 + N2 / 4 + N4 / 64 + N6 / 256)) / (1 + N);

const ALPHA = [
  N / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180 - (127 * N5) / 288 + (7891 * N6) / 37800,
  (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440 + (281 * N5) / 630 - (1983433 * N6) / 1935360,
  (61 * N3) / 240 - (103 * N4) / 140 + (15061 * N5) / 26880 + (167603 * N6) / 181440,
  (49561 * N4) / 161280 - (179 * N5) / 168 + (6601661 * N6) / 7257600,
  (34729 * N5) / 80640 - (3418889 * N6) / 1995840,
  (212378941 * N6) / 319334400,
];

const BETA = [
  N / 2 - (2 * N2) / 3 + (37 * N3) / 96 - N4 / 360 - (81 * N5) / 512 + (96199 * N6) / 604800,
  N2 / 48 + N3 / 15 - (437 * N4) / 1440 + (46 * N5) / 105 - (1118711 * N6) / 3870720,
  (17 * N3) / 480 - (37 * N4) / 840 - (209 * N5) / 4480 + (5569 * N6) / 90720,
  (4397 * N4) / 161280 - (11 * N5) / 504 - (830251 * N6) / 7257600,
  (4583 * N5) / 161280 - (108847 * N6) / 3991680,
  (20648693 * N6) / 638668800,
];

export interface Utm {
  zone: number;
  /** Южное полушарие: северная координата отсчитывается от 10 000 км. */
  south: boolean;
  easting: number;
  northing: number;
}

export function inUtmRange(lat: number): boolean {
  return lat >= UTM_SOUTH && lat <= UTM_NORTH;
}

/** Номер широтного пояса: 0 — C, 19 — X. */
export function bandIndex(lat: number): number {
  const index = Math.floor((lat - UTM_SOUTH) / BAND_HEIGHT);
  return Math.max(0, Math.min(BANDS.length - 1, index));
}

export function bandLetter(lat: number): string {
  return BANDS[bandIndex(lat)];
}

export function bandIndexOf(letter: string): number {
  return BANDS.indexOf(letter);
}

export function bandCount(): number {
  return BANDS.length;
}

/** Южная и северная границы пояса. */
export function bandLimits(index: number): [south: number, north: number] {
  const south = UTM_SOUTH + index * BAND_HEIGHT;
  return [south, index === BANDS.length - 1 ? UTM_NORTH : south + BAND_HEIGHT];
}

/** Южные пояса — от C до M. */
export function isSouthBand(index: number): boolean {
  return index < BANDS.length / 2;
}

/** Зона UTM с учётом расширенных зон у Норвегии и Шпицбергена. */
export function utmZone(lng: number, lat: number): number {
  const wrapped = wrapLng(lng);
  if (lat >= 56 && lat < 64 && wrapped >= 3 && wrapped < 12) return 32;
  if (lat >= 72 && lat <= UTM_NORTH) {
    if (wrapped >= 0 && wrapped < 9) return 31;
    if (wrapped >= 9 && wrapped < 21) return 33;
    if (wrapped >= 21 && wrapped < 33) return 35;
    if (wrapped >= 33 && wrapped < 42) return 37;
  }
  return Math.floor((wrapped + 180) / 6) + 1;
}

export function centralMeridian(zone: number): number {
  return zone * 6 - 183;
}

/** Границы ячейки «зона + пояс» по долготе и широте; null, если такой ячейки нет. */
export function zoneCell(
  zone: number,
  band: number,
): { west: number; east: number; south: number; north: number } | null {
  const [south, north] = bandLimits(band);
  let west = centralMeridian(zone) - 3;
  let east = west + 6;

  const letter = BANDS[band];
  if (letter === 'V') {
    if (zone === 31) east = 3;
    if (zone === 32) west = 3;
  } else if (letter === 'X') {
    if (zone === 32 || zone === 34 || zone === 36) return null;
    if (zone === 31) east = 9;
    if (zone === 33) [west, east] = [9, 21];
    if (zone === 35) [west, east] = [21, 33];
    if (zone === 37) west = 33;
  }
  return { west, east, south, north };
}

/** Координаты UTM. Зону можно задать, чтобы пересчитать точку в соседнюю. */
export function toUtm(lng: number, lat: number, zone = utmZone(lng, lat), south = lat < 0): Utm {
  const lambda = wrapLng(lng - centralMeridian(zone)) * RAD;
  const tau = Math.tan(lat * RAD);
  const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.hypot(1, tau)));
  const tauPrime = tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);

  const xiPrime = Math.atan2(tauPrime, Math.cos(lambda));
  const etaPrime = Math.asinh(Math.sin(lambda) / Math.hypot(tauPrime, Math.cos(lambda)));

  let xi = xiPrime;
  let eta = etaPrime;
  for (let j = 1; j <= ALPHA.length; j++) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += ALPHA[j - 1] * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }

  return {
    zone,
    south,
    easting: FALSE_EASTING + RADIUS * eta,
    northing: (south ? FALSE_NORTHING : 0) + RADIUS * xi,
  };
}

export function fromUtm({ zone, south, easting, northing }: Utm): LngLat {
  const xi = (northing - (south ? FALSE_NORTHING : 0)) / RADIUS;
  const eta = (easting - FALSE_EASTING) / RADIUS;

  let xiPrime = xi;
  let etaPrime = eta;
  for (let j = 1; j <= BETA.length; j++) {
    xiPrime -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  const tauPrime = Math.sin(xiPrime) / Math.hypot(Math.sinh(etaPrime), Math.cos(xiPrime));
  const lambda = Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));

  // Широта восстанавливается из конформной методом Ньютона; трёх шагов хватает с запасом.
  let tau = tauPrime;
  for (let i = 0; i < 5; i++) {
    const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.hypot(1, tau)));
    const current = tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);
    const delta =
      ((tauPrime - current) / Math.hypot(1, current)) *
      ((1 + (1 - E * E) * tau * tau) / ((1 - E * E) * Math.hypot(1, tau)));
    tau += delta;
    if (Math.abs(delta) < 1e-14) break;
  }

  return [centralMeridian(zone) + lambda * DEG, Math.atan(tau) * DEG];
}
