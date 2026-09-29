/** Снимок вида карты: какая часть холста в него идёт, как назван файл и чем подписан. */

export interface Frame {
  /** Часть холста карты в его собственных пикселях. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Covered {
  left: number;
  right: number;
  bottom?: number;
}

/** Меньше этого снимок не бывает: панели могут закрыть карту почти целиком, пикселей экрана. */
const MIN_SIDE = 64;

/**
 * Видимая часть карты в пикселях холста. `size` — размер карты на экране, `covered` —
 * сколько её закрыто панелями, `ratio` — пикселей холста в пикселе экрана.
 */
export function visibleFrame(
  size: { width: number; height: number },
  covered: Covered,
  ratio: number,
): Frame {
  const left = Math.max(0, Math.min(covered.left, size.width - MIN_SIDE));
  const right = Math.max(0, Math.min(covered.right, size.width - MIN_SIDE - left));
  const bottom = Math.max(0, Math.min(covered.bottom ?? 0, size.height - MIN_SIDE));
  return {
    x: Math.round(left * ratio),
    y: 0,
    width: Math.max(1, Math.round((size.width - left - right) * ratio)),
    height: Math.max(1, Math.round((size.height - bottom) * ratio)),
  };
}

/** Имя без знаков, которые не годятся для имени файла. */
export function fileStem(name: string, fallback: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || fallback
  );
}

/** Имя файла снимка: «Название — ход 12.png». */
export function snapshotName(scenario: string, turn: number): string {
  return `${fileStem(scenario, 'Карта')} — ход ${turn}.png`;
}

/** Подпись снимка: сценарий, ход и его время. */
export function snapshotTitle(scenario: string, turn: number, moment: string): string {
  const name = scenario.trim();
  return `${name ? `${name} · ` : ''}Ход ${turn} · ${moment}`;
}
