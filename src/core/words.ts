/** Согласование слов с числами. */

/** Число со словом в нужной форме: 1 фишка, 2 фишки, 5 фишек. */
export function plural(count: number, [one, few, many]: [string, string, string]): string {
  return `${count} ${pluralForm(count, [one, few, many])}`;
}

/** Форма слова при числе, без самого числа. */
export function pluralForm<T>(count: number, [one, few, many]: [T, T, T]): T {
  const tens = Math.abs(count) % 100;
  const ones = tens % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (ones === 1) return one;
  if (ones >= 2 && ones <= 4) return few;
  return many;
}
