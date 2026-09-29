/**
 * Инструменты карты: постановка фишки, линейка, рисование знака, прокладка маршрута, видимость.
 * Работает один за раз: взять новый — значит закончить прежний.
 */

import type { GraphicKind } from '../core/graphics';
import type { Route } from '../core/route';
import type { Unit, UnitTemplate } from '../core/units';
import { finishDraft, startDraft } from './draft.svelte';
import { continueRoute, finishRoute, startRoute } from './routeDraft.svelte';
import { finishRuler, startRuler } from './ruler.svelte';
import { select } from './scenario.svelte';
import { cancelPicking, startLine, startZone } from './sight.svelte';
import { tools } from './tools.svelte';

export function disarm(): void {
  tools.placing = null;
  finishRuler();
  finishDraft();
  finishRoute();
  cancelPicking();
}

export function armPlacing(template: UnitTemplate): void {
  disarm();
  select(null);
  tools.placing = template;
}

export function armRuler(): void {
  disarm();
  select(null);
  startRuler();
}

export function armDraft(kind: GraphicKind): void {
  disarm();
  select(null);
  startDraft(kind);
}

/** Прокладка нового маршрута; с фишкой — её маршрута, от её места. */
export function armRoute(unit?: Unit): void {
  disarm();
  select(null);
  startRoute(unit);
}

export function armContinue(route: Route): void {
  disarm();
  select(null);
  continueRoute(route);
}

/** Линия видимости: наблюдатель и цель указываются щелчками; от фишки — только цель. */
export function armSightLine(unit?: Unit): void {
  disarm();
  select(null);
  startLine(unit);
}

/** Зона обзора: точка указывается щелчком. */
export function armSightZone(): void {
  disarm();
  select(null);
  startZone();
}
