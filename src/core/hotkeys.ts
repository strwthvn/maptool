/** Горячие клавиши: что нажимается и что делает. Клавиши заданы местом на клавиатуре, а не буквой. */

export type HotkeyGroup = 'Панели' | 'Инструменты' | 'Карта' | 'Ходы' | 'Правка';

export type PanelKey =
  | 'layers'
  | 'palette'
  | 'graphics'
  | 'routes'
  | 'roster'
  | 'ruler'
  | 'sight'
  | 'coords'
  | 'scenario';

export type DrawKey = 'line' | 'arrow' | 'area' | 'sector' | 'point';

export type HotkeyAction =
  | { do: 'panel'; panel: PanelKey }
  | { do: 'draw'; kind: DrawKey }
  | { do: 'ruler' }
  | { do: 'route' }
  | { do: 'sightLine' }
  | { do: 'sightZone' }
  | { do: 'terrain' }
  | { do: 'north' }
  | { do: 'fit' }
  | { do: 'zoom'; by: number }
  | { do: 'base' }
  | { do: 'satellite' }
  | { do: 'hillshade' }
  | { do: 'contours' }
  | { do: 'grid' }
  | { do: 'snapshot' }
  | { do: 'turn'; by: number }
  | { do: 'advance' }
  | { do: 'help' };

export interface Hotkey {
  /** Коды клавиш (KeyboardEvent.code): основной и запасные, например на цифровом блоке. */
  codes: string[];
  shift?: boolean;
  /** Как клавиша названа в справке. */
  keys: string;
  label: string;
  group: HotkeyGroup;
  action: HotkeyAction;
}

const PANELS: { panel: PanelKey; label: string }[] = [
  { panel: 'layers', label: 'Слои' },
  { panel: 'palette', label: 'Фишки' },
  { panel: 'graphics', label: 'Графика' },
  { panel: 'routes', label: 'Маршруты' },
  { panel: 'roster', label: 'Состав' },
  { panel: 'ruler', label: 'Линейка' },
  { panel: 'sight', label: 'Видимость' },
  { panel: 'coords', label: 'Координаты' },
  { panel: 'scenario', label: 'Сценарий' },
];

const DRAWINGS: { kind: DrawKey; label: string }[] = [
  { kind: 'line', label: 'линию' },
  { kind: 'arrow', label: 'стрелку' },
  { kind: 'area', label: 'район' },
  { kind: 'sector', label: 'сектор' },
  { kind: 'point', label: 'точку' },
];

function letter(
  key: string,
  group: HotkeyGroup,
  label: string,
  action: HotkeyAction,
): Hotkey {
  return { codes: [`Key${key}`], keys: key, label, group, action };
}

export const HOTKEYS: Hotkey[] = [
  ...PANELS.map(({ panel, label }, index): Hotkey => ({
    codes: [`Digit${index + 1}`, `Numpad${index + 1}`],
    keys: String(index + 1),
    label,
    group: 'Панели',
    action: { do: 'panel', panel },
  })),

  letter('R', 'Инструменты', 'Линейка: начать измерение', { do: 'ruler' }),
  letter('M', 'Инструменты', 'Проложить маршрут; у выделенной фишки — её маршрут', {
    do: 'route',
  }),
  letter('L', 'Инструменты', 'Линия видимости; у выделенной фишки — от неё', {
    do: 'sightLine',
  }),
  letter('V', 'Инструменты', 'Зона обзора; у выделенной фишки — что видит она', {
    do: 'sightZone',
  }),
  ...DRAWINGS.map(({ kind, label }, index): Hotkey => ({
    codes: [`Digit${index + 1}`],
    shift: true,
    keys: `Shift+${index + 1}`,
    label: `Нарисовать ${label}`,
    group: 'Инструменты',
    action: { do: 'draw', kind },
  })),

  letter('T', 'Карта', 'Рельеф: 2D или 3D', { do: 'terrain' }),
  letter('N', 'Карта', 'Повернуть карту на север', { do: 'north' }),
  letter('F', 'Карта', 'Показать всё расставленное', { do: 'fit' }),
  {
    codes: ['Equal', 'NumpadAdd'],
    keys: '+',
    label: 'Приблизить',
    group: 'Карта',
    action: { do: 'zoom', by: 1 },
  },
  {
    codes: ['Minus', 'NumpadSubtract'],
    keys: '−',
    label: 'Отдалить',
    group: 'Карта',
    action: { do: 'zoom', by: -1 },
  },
  letter('B', 'Карта', 'Следующая подложка', { do: 'base' }),
  letter('S', 'Карта', 'Спутник поверх подложки', { do: 'satellite' }),
  letter('H', 'Карта', 'Отмывка рельефа', { do: 'hillshade' }),
  letter('C', 'Карта', 'Горизонтали', { do: 'contours' }),
  letter('G', 'Карта', 'Сетка MGRS', { do: 'grid' }),
  letter('P', 'Карта', 'Сохранить вид карты в PNG', { do: 'snapshot' }),

  {
    codes: ['BracketRight', 'Period'],
    keys: '] или .',
    label: 'Ход вперёд',
    group: 'Ходы',
    action: { do: 'turn', by: 1 },
  },
  {
    codes: ['BracketLeft', 'Comma'],
    keys: '[ или ,',
    label: 'Ход назад',
    group: 'Ходы',
    action: { do: 'turn', by: -1 },
  },
  letter('A', 'Ходы', 'Продвинуть фишки по маршрутам', { do: 'advance' }),

  {
    codes: ['Slash', 'F1'],
    keys: '? или F1',
    label: 'Список клавиш',
    group: 'Правка',
    action: { do: 'help' },
  },
];

/** Клавиши, которые приложение понимало и раньше: в справке они стоят рядом с остальными. */
export const EDITING: { keys: string; label: string }[] = [
  { keys: 'Ctrl+Z', label: 'Отменить; пока что-то рисуется — убрать последнюю точку' },
  { keys: 'Ctrl+Y', label: 'Повторить; то же — Ctrl+Shift+Z' },
  { keys: 'Ctrl+C, Ctrl+V', label: 'Скопировать выделенную фишку и вставить под курсор' },
  { keys: 'Ctrl+D', label: 'Дублировать выделенную фишку' },
  { keys: 'Delete', label: 'Удалить выделенное; пока что-то рисуется — убрать точку. То же — Backspace' },
  { keys: 'Enter', label: 'Закончить измерение, знак или маршрут' },
  { keys: 'Esc', label: 'Отменить инструмент, снять выделение, выйти из поля ввода' },
];

export interface KeyPress {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Что делает нажатие. Сочетания с Ctrl, Alt и Meta сюда не относятся: они заняты правкой
 * и самим браузером. F1 и «?» открывают справку при любом Shift.
 */
export function hotkeyFor(press: KeyPress): HotkeyAction | null {
  if (press.ctrlKey || press.altKey || press.metaKey) return null;
  const found = HOTKEYS.find(
    ({ codes, shift = false, action }) =>
      codes.includes(press.code) && (action.do === 'help' || shift === press.shiftKey),
  );
  return found?.action ?? null;
}

/** Клавиша, которой открывается панель, для подсказки на её кнопке. */
export function panelKey(panel: PanelKey): string {
  return HOTKEYS.find(({ action }) => action.do === 'panel' && action.panel === panel)?.keys ?? '';
}

export interface HotkeyList {
  group: HotkeyGroup;
  /** Заголовок группы в справке. */
  title: string;
  keys: { keys: string; label: string }[];
}

/** Клавиши по группам, в порядке справки. */
export function hotkeyGroups(): HotkeyList[] {
  const order: HotkeyGroup[] = ['Панели', 'Инструменты', 'Карта', 'Ходы', 'Правка'];
  return order.map((group) => ({
    group,
    title: group === 'Панели' ? 'Панели: открыть и закрыть' : group,
    keys: [
      ...HOTKEYS.filter((hotkey) => hotkey.group === group).map(({ keys, label }) => ({
        keys,
        label,
      })),
      ...(group === 'Правка' ? EDITING : []),
    ],
  }));
}
