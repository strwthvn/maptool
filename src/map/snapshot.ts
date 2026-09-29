/** Снимок вида карты в PNG: видимая часть карты, метка и подпись под ней. */

import type { Map as MlMap } from 'maplibre-gl';
import type { LngLat } from '../core/geodesy';
import { formatDistance, metersPerPixel, scaleBar } from '../core/scale';
import { visibleFrame } from '../core/snapshot';
import type { Insets } from './insets';

export interface SnapshotNotes {
  /** Сценарий, ход и его время. */
  title: string;
  /** Чьи карты и снимки на картинке: без этого ими нельзя делиться. */
  credits: string;
  /** Метка, если она стоит на карте. */
  pin: LngLat | null;
}

const SURFACE = '#35353b';
const INK = '#edebe8';
const INK_SOFT = '#bdb8b4';
const ACCENT = '#ff5e2c';
const CASING = 'rgba(30, 30, 34, 0.75)';

const FONT = "'Sofia Sans Semi Condensed Variable', 'Sofia Sans Semi Condensed', system-ui, sans-serif";

/** Размеры подписи в пикселях экрана; на плотном экране умножаются на его плотность. */
const ROW = 30;
const PAD = 12;
const GAP = 18;
const SCALE_MAX = 140;

function shorten(context: CanvasRenderingContext2D, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Метка: тот же прицел, что на карте. */
function drawPin(context: CanvasRenderingContext2D, x: number, y: number, unit: number): void {
  const stroke = (color: string, width: number) => {
    context.strokeStyle = color;
    context.lineWidth = width * unit;
    context.beginPath();
    context.arc(x, y, 9 * unit, 0, 2 * Math.PI);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      context.moveTo(x + dx * 6 * unit, y + dy * 6 * unit);
      context.lineTo(x + dx * 16 * unit, y + dy * 16 * unit);
    }
    context.stroke();
  };
  context.lineCap = 'round';
  stroke(CASING, 5);
  stroke(ACCENT, 2.25);
  context.fillStyle = ACCENT;
  context.beginPath();
  context.arc(x, y, 1.75 * unit, 0, 2 * Math.PI);
  context.fill();
}

/** Стрелка на север, повёрнутая так же, как карта. */
function drawNorth(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  bearing: number,
): void {
  context.save();
  context.translate(x, y);
  context.rotate((-bearing * Math.PI) / 180);
  context.fillStyle = ACCENT;
  context.beginPath();
  context.moveTo(0, -9 * unit);
  context.lineTo(4 * unit, 0);
  context.lineTo(-4 * unit, 0);
  context.closePath();
  context.fill();
  context.fillStyle = INK_SOFT;
  context.beginPath();
  context.moveTo(0, 9 * unit);
  context.lineTo(4 * unit, 0);
  context.lineTo(-4 * unit, 0);
  context.closePath();
  context.fill();
  context.restore();
}

/**
 * Снимает видимую часть карты. Карта перерисовывается тут же: без этого холст WebGL
 * между кадрами пуст.
 */
export function snapshot(map: MlMap, insets: Insets, notes: SnapshotNotes): Promise<Blob> {
  map.redraw();
  const source = map.getCanvas();
  const unit = source.width / source.clientWidth;
  const frame = visibleFrame(
    { width: source.clientWidth, height: source.clientHeight },
    insets,
    unit,
  );

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = (weight: number) => `${weight} ${14 * unit}px ${FONT}`;

  // Масштаб и стрелка севера — слева, источники — справа, между ними подпись.
  // Если всё в строку не помещается, источники уходят на вторую.
  const pitched = map.getPitch() > 0;
  const bar = scaleBar(metersPerPixel(map.getCenter().lat, map.getZoom()), SCALE_MAX);
  const scaleText = `${formatDistance(bar.meters)}${pitched ? ' у центра' : ''}`;
  context.font = font(400);
  const scaleWidth = (26 + bar.px + 8) * unit + context.measureText(scaleText).width;
  const creditsWidth = context.measureText(notes.credits).width;
  context.font = font(600);
  const titleWidth = context.measureText(notes.title).width;
  const inner = frame.width - 2 * PAD * unit;
  const oneRow = scaleWidth + titleWidth + creditsWidth + 2 * GAP * unit <= inner;
  const rows = oneRow ? 1 : 2;

  canvas.width = frame.width;
  canvas.height = frame.height + rows * ROW * unit;
  context.drawImage(
    source,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    0,
    0,
    frame.width,
    frame.height,
  );

  if (notes.pin) {
    const at = map.project(notes.pin);
    const x = at.x * unit - frame.x;
    const y = at.y * unit - frame.y;
    if (x >= 0 && x <= frame.width && y >= 0 && y <= frame.height) drawPin(context, x, y, unit);
  }

  context.fillStyle = SURFACE;
  context.fillRect(0, frame.height, canvas.width, rows * ROW * unit);
  context.textBaseline = 'middle';
  const first = frame.height + (ROW * unit) / 2;

  let x = PAD * unit;
  drawNorth(context, x + 6 * unit, first, unit, map.getBearing());
  x += 26 * unit;
  context.strokeStyle = INK;
  context.lineWidth = unit;
  context.strokeRect(x, first - 3.5 * unit, bar.px * unit, 7 * unit);
  context.fillStyle = INK;
  context.fillRect(x, first - 3.5 * unit, (bar.px * unit) / 2, 7 * unit);
  x += (bar.px + 8) * unit;
  context.font = font(400);
  context.fillStyle = INK_SOFT;
  context.fillText(scaleText, x, first);
  x += context.measureText(scaleText).width + GAP * unit;

  const right = canvas.width - PAD * unit;
  const titleRoom = (oneRow ? right - creditsWidth - GAP * unit : right) - x;
  context.font = font(600);
  context.fillStyle = INK;
  context.fillText(shorten(context, notes.title, Math.max(0, titleRoom)), x, first);

  context.font = font(400);
  context.fillStyle = INK_SOFT;
  if (oneRow) {
    context.textAlign = 'right';
    context.fillText(notes.credits, right, first);
  } else {
    context.fillText(shorten(context, notes.credits, inner), PAD * unit, first + ROW * unit);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось собрать картинку'));
    }, 'image/png');
  });
}
