/** Картинки, которые слои рисуют сами: наконечник стрелки и плашка под подпись. */

import type { Map as MlMap } from 'maplibre-gl';
import type { GraphicInk } from '../core/graphics';

const PIXEL_RATIO = 2;

/** Половина угла между усами наконечника стрелки. */
const HEAD_ANGLE = (28 * Math.PI) / 180;

const PLATE = 'label-plate';
const PLATE_FILL = 'rgba(53, 53, 59, 0.94)';

/** Картинка наконечника стрелки: остриё в центре, смотрит на север. Возвращает имя картинки. */
export function arrowHead(map: MlMap, ink: GraphicInk, width: number, casing: number): string {
  const name = `arrow-head:${ink.id}:${width}`;
  if (map.hasImage(name)) return name;

  const length = 9 + width * 2.4;
  const half = Math.ceil(length + width + casing);
  const size = half * 2 * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.scale(PIXEL_RATIO, PIXEL_RATIO);
  context.translate(half, half);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const x = length * Math.sin(HEAD_ANGLE);
  const y = length * Math.cos(HEAD_ANGLE);
  const barbs = () => {
    context.beginPath();
    context.moveTo(-x, y);
    context.lineTo(0, 0);
    context.lineTo(x, y);
    context.stroke();
  };
  context.strokeStyle = ink.casing;
  context.lineWidth = width + casing;
  barbs();
  context.strokeStyle = ink.line;
  context.lineWidth = width;
  barbs();
  // Окантовка усов легла поверх самой стрелки; её конец рисуется заново.
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, y);
  context.stroke();

  map.addImage(name, context.getImageData(0, 0, size, size), { pixelRatio: PIXEL_RATIO });
  return name;
}

/**
 * Плашка под подпись: растягивается под текст, скруглённые углы остаются как есть.
 * На пёстрой карте текст с одной обводкой не читается. Возвращает имя картинки.
 */
export function labelPlate(map: MlMap): string {
  if (map.hasImage(PLATE)) return PLATE;

  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = PLATE_FILL;
  context.beginPath();
  context.roundRect(1, 1, size - 2, size - 2, 6);
  context.fill();

  map.addImage(PLATE, context.getImageData(0, 0, size, size), {
    pixelRatio: PIXEL_RATIO,
    stretchX: [[10, 14]],
    stretchY: [[10, 14]],
    content: [8, 6, 16, 18],
  });
  return PLATE;
}

const SIGN = 'hazard-sign';

/** Знак «не пройти»: жёлтый треугольник с восклицательным знаком. Возвращает имя картинки. */
export function hazardSign(map: MlMap, fill: string, ink: string): string {
  if (map.hasImage(SIGN)) return SIGN;

  const size = 22;
  const canvas = document.createElement('canvas');
  canvas.width = size * PIXEL_RATIO;
  canvas.height = size * PIXEL_RATIO;
  const context = canvas.getContext('2d')!;
  context.scale(PIXEL_RATIO, PIXEL_RATIO);
  context.lineJoin = 'round';
  context.lineCap = 'round';

  context.beginPath();
  context.moveTo(size / 2, 2.5);
  context.lineTo(size - 2, size - 3);
  context.lineTo(2, size - 3);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = ink;
  context.lineWidth = 2;
  context.stroke();

  context.beginPath();
  context.moveTo(size / 2, 8.5);
  context.lineTo(size / 2, 13);
  context.lineWidth = 2.25;
  context.stroke();
  context.beginPath();
  context.arc(size / 2, 16.25, 1.25, 0, 2 * Math.PI);
  context.fillStyle = ink;
  context.fill();

  map.addImage(SIGN, context.getImageData(0, 0, canvas.width, canvas.height), {
    pixelRatio: PIXEL_RATIO,
  });
  return SIGN;
}
