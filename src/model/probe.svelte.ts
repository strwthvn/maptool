/** Точка, о которой сообщает строка состояния: под курсором, а без курсора — центр карты. */

export interface Probe {
  source: 'cursor' | 'center';
  lng: number;
  lat: number;
  /** null — высота ещё не получена или недоступна. */
  elevation: number | null;
}

export const probe = $state<Probe>({ source: 'center', lng: 0, lat: 0, elevation: null });
