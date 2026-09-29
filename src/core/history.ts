/** История изменений для отмены и повтора. Хранит снимки состояния целиком. */

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(
    private limit = 100,
    /** Правки с одинаковым ключом, идущие подряд быстрее этого интервала, отменяются одним шагом. */
    private mergeWindowMs = 1000,
  ) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Запоминает состояние, каким оно было до правки. */
  record(before: T, key: string | null = null, now = Date.now()): void {
    const merges = key !== null && key === this.lastKey && now - this.lastTime < this.mergeWindowMs;
    this.lastKey = key;
    this.lastTime = now;
    if (merges) return;

    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | undefined {
    const previous = this.past.pop();
    if (previous === undefined) return undefined;
    this.future.push(current);
    this.lastKey = null;
    return previous;
  }

  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }
}
