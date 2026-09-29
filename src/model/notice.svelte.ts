/** Короткое сообщение поверх карты: что только что сделано или что не вышло. */

export type NoticeTone = 'done' | 'failed';

/** Сколько сообщение остаётся на виду, мс. */
const NOTICE_MS = 5000;

export const notice = $state<{ text: string; tone: NoticeTone }>({ text: '', tone: 'done' });

let timer: ReturnType<typeof setTimeout> | undefined;

export function notify(text: string, tone: NoticeTone = 'done'): void {
  clearTimeout(timer);
  notice.text = text;
  notice.tone = tone;
  timer = setTimeout(() => (notice.text = ''), NOTICE_MS);
}
