/** Отрисовка условных знаков через milsymbol. */

import ms from 'milsymbol';
import { sidc, type SymbolSpec } from '../core/units';

const FONT = "'Sofia Sans Semi Condensed Variable', sans-serif";
const ACCENT = '#ff5e2c';

/** Размер знака на карте — базовая единица milsymbol, рамка получается примерно в полтора раза шире. */
export const MAP_SYMBOL_SIZE = 26;

export interface SymbolSvg {
  svg: string;
  width: number;
  height: number;
  /** Точка знака, которая указывает на место на местности. */
  anchor: { x: number; y: number };
}

/**
 * Знак без подписей для интерфейса. Текст пользователя сюда не попадает,
 * поэтому разметку можно вставлять в страницу как есть.
 */
export function symbolSvg(spec: SymbolSpec, size: number): SymbolSvg {
  const symbol = new ms.Symbol(sidc(spec), { size });
  return { svg: symbol.asSVG(), ...symbol.getSize(), anchor: symbol.getAnchor() };
}

export interface SymbolImage {
  data: ImageData;
  pixelRatio: number;
  /**
   * Где внутри картинки нарисован сам знак с подписью, в пикселях экрана относительно её центра.
   * Центр картинки совпадает с точкой на местности, поэтому вокруг знака есть прозрачные поля.
   */
  box: { left: number; top: number; right: number; bottom: number };
}

export function symbolImage(
  spec: SymbolSpec,
  callsign: string,
  selected: boolean,
  pixelRatio: number,
): SymbolImage {
  const symbol = new ms.Symbol(sidc(spec), {
    size: MAP_SYMBOL_SIZE,
    uniqueDesignation: callsign,
    fontfamily: FONT,
    // Светлая обводка отделяет знак и подпись от пёстрой подложки.
    outlineWidth: selected ? 5 : 3,
    outlineColor: selected ? ACCENT : 'rgba(255, 255, 255, 0.85)',
    infoSize: 52,
    infoOutlineWidth: 4,
    infoOutlineColor: 'rgba(255, 255, 255, 0.9)',
  });
  const drawn = symbol.asCanvas(pixelRatio);
  const anchor = symbol.getAnchor();
  const { width, height } = symbol.getSize();
  const box = { left: -anchor.x, top: -anchor.y, right: width - anchor.x, bottom: height - anchor.y };

  // Сдвиг значка нельзя задать отдельно для каждой фишки, поэтому точку привязки
  // ставим в центр картинки: карта выравнивает значок по центру сама.
  const halfWidth = Math.ceil(Math.max(-box.left, box.right) * pixelRatio);
  const halfHeight = Math.ceil(Math.max(-box.top, box.bottom) * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = halfWidth * 2;
  canvas.height = halfHeight * 2;
  const context = canvas.getContext('2d')!;
  context.drawImage(drawn, halfWidth + box.left * pixelRatio, halfHeight + box.top * pixelRatio);

  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio,
    box,
  };
}
