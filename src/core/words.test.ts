import { describe, expect, it } from 'vitest';
import { plural, pluralForm } from './words';

describe('согласование с числом', () => {
  const forms: [string, string, string] = ['фишка', 'фишки', 'фишек'];

  it('выбирает форму слова', () => {
    expect(plural(1, forms)).toBe('1 фишка');
    expect(plural(3, forms)).toBe('3 фишки');
    expect(plural(5, forms)).toBe('5 фишек');
    expect(plural(0, forms)).toBe('0 фишек');
  });

  it('помнит про второй десяток и сотни', () => {
    expect(plural(11, forms)).toBe('11 фишек');
    expect(plural(14, forms)).toBe('14 фишек');
    expect(plural(21, forms)).toBe('21 фишка');
    expect(plural(112, forms)).toBe('112 фишек');
    expect(plural(122, forms)).toBe('122 фишки');
  });

  it('отдаёт форму и без числа', () => {
    expect(pluralForm(2, ['Передвинута', 'Передвинуты', 'Передвинуто'])).toBe('Передвинуты');
  });
});
