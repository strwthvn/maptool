/** Что умеет слой карты, с которым работают мышью и пальцем. */

import type { MapMouseEvent, MapTouchEvent } from 'maplibre-gl';

export type PointerEvent = MapMouseEvent | MapTouchEvent;

/**
 * MapView спрашивает слои по очереди, от верхнего к нижнему. Слой, взявший нажатие
 * или щелчок себе, возвращает true, и до остальных событие не доходит.
 */
export interface Interactive {
  press(
    event: PointerEvent,
    moveEvent: 'mousemove' | 'touchmove',
    endEvent: 'mouseup' | 'touchend',
  ): boolean;
  click(event: MapMouseEvent): boolean;
  /** Курсор, который нужен слою в этой точке, или null, если ему всё равно. */
  hover(event: MapMouseEvent): string | null;
}
