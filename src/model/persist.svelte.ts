/** Сохранение состояния в браузере: с задержкой после правки и сразу при уходе со страницы. */

const SAVE_DELAY_MS = 400;

/**
 * Следит за состоянием и пишет его в localStorage под ключом `key`.
 * `read` должна прочитать состояние целиком: по тому, что она прочла, отслеживаются правки.
 */
export function persist(key: string, read: () => string): void {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    if (pending === null) return;
    try {
      localStorage.setItem(key, pending);
    } catch {
      // Хранилище недоступно или переполнено: состояние останется только в памяти вкладки.
    }
    pending = null;
  };

  $effect.root(() => {
    $effect(() => {
      pending = read();
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    });
  });

  // Правка, сделанная за мгновение до закрытия или перезагрузки страницы, не должна пропасть.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
