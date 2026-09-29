/** Знак графики, который сейчас рисуется на карте, и стиль для новых знаков. */

import type { LngLat } from '../core/geodesy';
import {
  createGraphic,
  defaultStyle,
  pointsLimit,
  pointsNeeded,
  type Graphic,
  type GraphicKind,
  type GraphicStyle,
} from '../core/graphics';
import { addGraphic, selectGraphic } from './scenario.svelte';

/** Стиль, с которым рисуются новые знаки. */
export const brush = $state<GraphicStyle>(defaultStyle());

export const draft = $state<{
  /** Вид знака, который рисуется; null — ничего не рисуется. */
  kind: GraphicKind | null;
  points: LngLat[];
  /** Положение курсора, до которого тянется линия от последней точки. */
  cursor: LngLat | null;
}>({ kind: null, points: [], cursor: null });

export function startDraft(kind: GraphicKind): void {
  draft.kind = kind;
  draft.points = [];
  draft.cursor = null;
}

export function cancelDraft(): void {
  draft.kind = null;
  draft.points = [];
  draft.cursor = null;
}

/** Заканчивает рисование. Знак появляется, если точек хватило; иначе рисование отменяется. */
export function finishDraft(): void {
  if (!draft.kind) return;
  const graphic = createGraphic(
    draft.kind,
    $state.snapshot(brush),
    $state.snapshot(draft.points) as LngLat[],
  );
  cancelDraft();
  if (!graphic) return;
  addGraphic(graphic);
  selectGraphic(graphic.id, true);
}

/** Ставит точку. Знак, которому больше точек не нужно, сразу готов. */
export function addDraftPoint(point: LngLat): void {
  if (!draft.kind) return;
  draft.points.push(point);
  if (draft.points.length >= pointsLimit(draft.kind)) finishDraft();
}

export function removeLastDraftPoint(): void {
  draft.points.pop();
}

/** Хватит ли поставленных точек, чтобы закончить знак. */
export function draftReady(): boolean {
  return draft.kind !== null && draft.points.length >= pointsNeeded(draft.kind);
}

const sketch = $derived.by<Graphic | null>(() => {
  if (!draft.kind) return null;
  const points = $state.snapshot(draft.points) as LngLat[];
  if (draft.cursor) points.push([draft.cursor[0], draft.cursor[1]]);
  if (points.length === 0) return null;

  // Район из двух точек и сектор из одной ещё не построить: пока показывается линия.
  const kind = points.length >= pointsNeeded(draft.kind) ? draft.kind : 'line';
  const graphic = createGraphic(kind, $state.snapshot(brush), points);
  return graphic && { ...graphic, id: 'draft' };
});

/** Набросок рисуемого знака вместе с точкой под курсором. */
export function draftSketch(): Graphic | null {
  return sketch;
}
