import { describe, expect, it } from 'vitest';
import { HOTKEYS, hotkeyFor, hotkeyGroups, panelKey, type KeyPress } from './hotkeys';

function press(code: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return { code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...modifiers };
}

describe('hotkeyFor', () => {
  it('цифры открывают панели по порядку', () => {
    expect(hotkeyFor(press('Digit1'))).toEqual({ do: 'panel', panel: 'layers' });
    expect(hotkeyFor(press('Digit7'))).toEqual({ do: 'panel', panel: 'sight' });
    expect(hotkeyFor(press('Numpad9'))).toEqual({ do: 'panel', panel: 'scenario' });
    expect(hotkeyFor(press('Digit0'))).toBeNull();
  });

  it('цифры с Shift рисуют знаки', () => {
    expect(hotkeyFor(press('Digit1', { shiftKey: true }))).toEqual({ do: 'draw', kind: 'line' });
    expect(hotkeyFor(press('Digit5', { shiftKey: true }))).toEqual({ do: 'draw', kind: 'point' });
    expect(hotkeyFor(press('Digit6', { shiftKey: true }))).toBeNull();
  });

  it('буквы берут инструменты и переключают слои', () => {
    expect(hotkeyFor(press('KeyR'))).toEqual({ do: 'ruler' });
    expect(hotkeyFor(press('KeyM'))).toEqual({ do: 'route' });
    expect(hotkeyFor(press('KeyL'))).toEqual({ do: 'sightLine' });
    expect(hotkeyFor(press('KeyV'))).toEqual({ do: 'sightZone' });
    expect(hotkeyFor(press('KeyT'))).toEqual({ do: 'terrain' });
    expect(hotkeyFor(press('KeyG'))).toEqual({ do: 'grid' });
    expect(hotkeyFor(press('KeyP'))).toEqual({ do: 'snapshot' });
  });

  it('буква с Shift — не та же клавиша', () => {
    expect(hotkeyFor(press('KeyR', { shiftKey: true }))).toBeNull();
  });

  it('сочетания с Ctrl, Alt и Meta оставлены правке и браузеру', () => {
    expect(hotkeyFor(press('KeyV', { ctrlKey: true }))).toBeNull();
    expect(hotkeyFor(press('KeyC', { ctrlKey: true }))).toBeNull();
    expect(hotkeyFor(press('KeyR', { metaKey: true }))).toBeNull();
    expect(hotkeyFor(press('Digit1', { altKey: true }))).toBeNull();
  });

  it('ходы переводятся скобками и знаками рядом с ними', () => {
    expect(hotkeyFor(press('BracketRight'))).toEqual({ do: 'turn', by: 1 });
    expect(hotkeyFor(press('Period'))).toEqual({ do: 'turn', by: 1 });
    expect(hotkeyFor(press('BracketLeft'))).toEqual({ do: 'turn', by: -1 });
    expect(hotkeyFor(press('Comma'))).toEqual({ do: 'turn', by: -1 });
  });

  it('масштаб меняется и с цифрового блока', () => {
    expect(hotkeyFor(press('Equal'))).toEqual({ do: 'zoom', by: 1 });
    expect(hotkeyFor(press('NumpadSubtract'))).toEqual({ do: 'zoom', by: -1 });
  });

  it('справка открывается знаком вопроса и F1', () => {
    expect(hotkeyFor(press('Slash', { shiftKey: true }))).toEqual({ do: 'help' });
    expect(hotkeyFor(press('Slash'))).toEqual({ do: 'help' });
    expect(hotkeyFor(press('F1'))).toEqual({ do: 'help' });
  });
});

describe('таблица клавиш', () => {
  it('одна клавиша не занята двумя действиями', () => {
    const seen = new Set<string>();
    for (const { codes, shift = false } of HOTKEYS) {
      for (const code of codes) {
        const key = `${shift ? 'Shift+' : ''}${code}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it('не занимает клавиши правки', () => {
    const codes = HOTKEYS.flatMap((hotkey) => hotkey.codes);
    for (const taken of ['Escape', 'Enter', 'Delete', 'Backspace', 'KeyZ', 'KeyY', 'KeyD']) {
      expect(codes).not.toContain(taken);
    }
  });

  it('знает клавишу каждой панели', () => {
    expect(panelKey('layers')).toBe('1');
    expect(panelKey('sight')).toBe('7');
  });

  it('справка идёт по группам, правка в конце вместе с прежними сочетаниями', () => {
    const groups = hotkeyGroups();
    expect(groups.map(({ group }) => group)).toEqual([
      'Панели',
      'Инструменты',
      'Карта',
      'Ходы',
      'Правка',
    ]);
    expect(groups[0].keys).toHaveLength(9);
    expect(groups.at(-1)!.keys.map(({ keys }) => keys)).toContain('Ctrl+Z');
    expect(groups.every(({ keys }) => keys.length > 0)).toBe(true);
  });
});
