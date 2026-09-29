/** Геодезия на эллипсоиде WGS 84: расстояние, азимут, точка по азимуту и дальности, площадь. */

export type LngLat = [lng: number, lat: number];

/** Большая полуось, м, и сжатие. */
export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;

const B = WGS84_A * (1 - WGS84_F);
const E2 = WGS84_F * (2 - WGS84_F);
const E = Math.sqrt(E2);

/** Радиус для запасного расчёта по сфере, когда основной не сходится. */
const MEAN_RADIUS = 6371008.8;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const ITERATIONS = 200;
const PRECISION = 1e-12;

/** Долгота в пределах от −180° до 180°. */
export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function normalizeAzimuth(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export interface Inverse {
  /** Расстояние по поверхности эллипсоида, м. */
  distance: number;
  /** Азимут в начальной точке, градусы от севера по часовой стрелке. */
  azimuth: number;
  /** Азимут того же направления в конечной точке. */
  finalAzimuth: number;
}

/** Обратная геодезическая задача по формулам Винсенти. */
export function inverse(from: LngLat, to: LngLat): Inverse {
  const L = ((((to[0] - from[0]) % 360) + 540) % 360) * RAD - Math.PI;
  const tanU1 = (1 - WGS84_F) * Math.tan(from[1] * RAD);
  const tanU2 = (1 - WGS84_F) * Math.tan(to[1] * RAD);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const cosU2 = 1 / Math.sqrt(1 + tanU2 * tanU2);
  const sinU1 = tanU1 * cosU1;
  const sinU2 = tanU2 * cosU2;

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 1;
  let sigma = 0;
  let cosSqAlpha = 1;
  let cos2SigmaM = 0;
  let converged = false;

  for (let i = 0; i < ITERATIONS; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return { distance: 0, azimuth: 0, finalAzimuth: 0 };

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    // На экваторе cosSqAlpha обращается в ноль, и поправка не нужна.
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    const next =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    const change = Math.abs(next - lambda);
    lambda = next;
    if (change < PRECISION) {
      converged = true;
      break;
    }
  }

  // Почти противоположные точки Земли: формулы Винсенти не сходятся, считаем по сфере.
  if (!converged) return sphericalInverse(from, to);

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - B * B)) / (B * B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bc = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    Bc *
    sinSigma *
    (cos2SigmaM +
      (Bc / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (Bc / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  return {
    distance: B * A * (sigma - deltaSigma),
    azimuth: normalizeAzimuth(
      Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * DEG,
    ),
    finalAzimuth: normalizeAzimuth(
      Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda) * DEG,
    ),
  };
}

function sphericalInverse(from: LngLat, to: LngLat): Inverse {
  const phi1 = from[1] * RAD;
  const phi2 = to[1] * RAD;
  const dLambda = (to[0] - from[0]) * RAD;
  const h =
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const azimuth = Math.atan2(
    Math.sin(dLambda) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda),
  );
  const finalAzimuth = Math.atan2(
    Math.sin(dLambda) * Math.cos(phi1),
    -Math.cos(phi2) * Math.sin(phi1) + Math.sin(phi2) * Math.cos(phi1) * Math.cos(dLambda),
  );
  return {
    distance: 2 * MEAN_RADIUS * Math.asin(Math.min(1, Math.sqrt(h))),
    azimuth: normalizeAzimuth(azimuth * DEG),
    finalAzimuth: normalizeAzimuth(finalAzimuth * DEG),
  };
}

export function distance(from: LngLat, to: LngLat): number {
  return inverse(from, to).distance;
}

/**
 * Прямая геодезическая задача: точка на расстоянии `meters` по азимуту `azimuth`.
 * Долгота не приводится к ±180°, чтобы линия через 180-й меридиан оставалась непрерывной.
 */
export function destination(from: LngLat, azimuth: number, meters: number): LngLat {
  const alpha1 = azimuth * RAD;
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);

  const tanU1 = (1 - WGS84_F) * Math.tan(from[1] * RAD);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - B * B)) / (B * B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bc = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = meters / (B * A);
  let sinSigma = 0;
  let cosSigma = 1;
  let cos2SigmaM = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      Bc *
      sinSigma *
      (cos2SigmaM +
        (Bc / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            (Bc / 6) *
              cos2SigmaM *
              (-3 + 4 * sinSigma * sinSigma) *
              (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    const next = meters / (B * A) + deltaSigma;
    const change = Math.abs(next - sigma);
    sigma = next;
    if (change < PRECISION) break;
  }
  sinSigma = Math.sin(sigma);
  cosSigma = Math.cos(sigma);
  cos2SigmaM = Math.cos(2 * sigma1 + sigma);

  const across = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - WGS84_F) * Math.hypot(sinAlpha, across),
  );
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
  const L =
    lambda -
    (1 - C) *
      WGS84_F *
      sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

  return [from[0] + L * DEG, lat * DEG];
}

/** Длинные отрезки рисуются по геодезической линии с таким шагом, м. */
const PATH_STEP = 20_000;
const PATH_MAX_POINTS = 96;

/**
 * Точки геодезической линии между двумя точками, включая концы.
 * Короткий отрезок остаётся отрезком: на карте он неотличим от геодезической.
 */
export function geodesicPath(from: LngLat, to: LngLat, step = PATH_STEP): LngLat[] {
  const { distance: length, azimuth } = inverse(from, to);
  const pieces = Math.min(PATH_MAX_POINTS, Math.ceil(length / step));
  // Конец приводится к той же «копии мира», что и начало.
  const turns = Math.round((to[0] - from[0]) / 360);
  const end: LngLat = turns === 0 ? to : [to[0] - turns * 360, to[1]];
  if (pieces <= 1) return [from, end];

  const path: LngLat[] = [from];
  for (let i = 1; i < pieces; i++) path.push(destination(from, azimuth, (length * i) / pieces));
  path.push(end);
  return path;
}

/** Точка на середине геодезической линии. */
export function midpoint(from: LngLat, to: LngLat): LngLat {
  const { distance: length, azimuth } = inverse(from, to);
  if (length === 0) return from;
  return destination(from, azimuth, length / 2);
}

/** Синус равновеликой широты: с ним площадь на эллипсоиде считается как на шаре. */
function sinAuthalic(lat: number): number {
  return q(Math.sin(lat * RAD)) / q(1);
}

function q(sinPhi: number): number {
  const es = E * sinPhi;
  return (1 - E2) * (sinPhi / (1 - es * es) - Math.log((1 - es) / (1 + es)) / (2 * E));
}

const AUTHALIC_RADIUS_SQ = (WGS84_A * WGS84_A * q(1)) / 2;

/** Стороны многоугольника при расчёте площади дробятся с таким шагом, м. */
const AREA_STEP = 1000;

/**
 * Площадь многоугольника, м². Вершины перечисляются по обходу, замыкающую повторять не нужно,
 * стороны — геодезические линии. Считается в равновеликой цилиндрической проекции:
 * прямая в ней немного расходится с геодезической, поэтому стороны дробятся.
 */
export function polygonArea(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const dense = ring.flatMap((point, i) =>
    geodesicPath(point, ring[(i + 1) % ring.length], AREA_STEP).slice(0, -1),
  );
  const origin = dense[0][0];
  const x = (lng: number) => (((((lng - origin) % 360) + 540) % 360) - 180) * RAD;

  let sum = 0;
  for (let i = 0; i < dense.length; i++) {
    const current = dense[i];
    const next = dense[(i + 1) % dense.length];
    sum += x(current[0]) * sinAuthalic(next[1]) - x(next[0]) * sinAuthalic(current[1]);
  }
  return (Math.abs(sum) * AUTHALIC_RADIUS_SQ) / 2;
}
