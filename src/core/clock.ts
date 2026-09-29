/** Игровые часы: начало сценария, длина хода и текущий ход. */

export interface Clock {
  /**
   * Начало сценария, «ГГГГ-ММ-ДДTЧЧ:ММ» по времени района действий; null — не задано,
   * и часы показывают только время от начала.
   */
  start: string | null;
  /** Длина хода, минуты. */
  turnMinutes: number;
  /** Сколько ходов прошло с начала сценария. */
  turn: number;
  /** Фишки идут по своим маршрутам вместе с ходом. */
  follow: boolean;
}

/** Длина хода, минуты. */
export const TURN_MIN = 1;
export const TURN_MAX = 1440;
export const DEFAULT_TURN = 10;

export const LAST_TURN = 9999;

const START = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function clampTurn(minutes: number): number {
  return Math.max(TURN_MIN, Math.min(TURN_MAX, Math.round(minutes)));
}

/** Номер хода в допустимых пределах. */
export function clampTurnNumber(turn: number): number {
  return Math.max(0, Math.min(LAST_TURN, Math.round(turn)));
}

export function defaultClock(): Clock {
  return { start: null, turnMinutes: DEFAULT_TURN, turn: 0, follow: false };
}

/** Время районa действий хранится без часового пояса: считаем его как UTC, чтобы не вмешалось летнее время. */
function moment(start: string): Date | null {
  const match = START.exec(start);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const same =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute;
  return same ? date : null;
}

/** Начало сценария из произвольных данных; null, если это не дата со временем. */
export function readStart(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.slice(0, 16);
  return moment(text) ? text : null;
}

export function readClock(data: unknown): Clock {
  const clock = defaultClock();
  if (typeof data !== 'object' || data === null) return clock;
  const { start, turnMinutes, turn, follow } = data as Record<string, unknown>;
  clock.start = readStart(start);
  if (typeof turnMinutes === 'number' && Number.isFinite(turnMinutes)) {
    clock.turnMinutes = clampTurn(turnMinutes);
  }
  if (typeof turn === 'number' && Number.isFinite(turn)) clock.turn = clampTurnNumber(turn);
  if (typeof follow === 'boolean') clock.follow = follow;
  return clock;
}

/** Сколько минут прошло от начала сценария к концу хода `turn`. */
export function elapsedMinutes(clock: Pick<Clock, 'turnMinutes'>, turn: number): number {
  return turn * clock.turnMinutes;
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

/** Время от начала: «+0:30», «+26:10». */
export function formatElapsed(minutes: number): string {
  const whole = Math.round(minutes);
  return `+${Math.floor(whole / 60)}:${padded(whole % 60)}`;
}

export interface Moment {
  /** «14.06.2003»; пусто, если начало сценария не задано. */
  date: string;
  /** «06:30», а без начала сценария — время от начала, «+0:30». */
  time: string;
}

/** Дата и время к концу хода `turn`. Ход может быть дробным: так считается время прибытия. */
export function clockMoment(clock: Pick<Clock, 'start' | 'turnMinutes'>, turn: number): Moment {
  const minutes = elapsedMinutes(clock, turn);
  const start = clock.start ? moment(clock.start) : null;
  if (!start) return { date: '', time: formatElapsed(minutes) };

  const at = new Date(start.getTime() + Math.round(minutes) * 60_000);
  return {
    date: `${padded(at.getUTCDate())}.${padded(at.getUTCMonth() + 1)}.${at.getUTCFullYear()}`,
    time: `${padded(at.getUTCHours())}:${padded(at.getUTCMinutes())}`,
  };
}

/** Дата и время одной строкой: «14.06.2003 06:30» или «+0:30». */
export function formatMoment(clock: Pick<Clock, 'start' | 'turnMinutes'>, turn: number): string {
  const { date, time } = clockMoment(clock, turn);
  return date ? `${date} ${time}` : time;
}
