/** Отдаёт данные пользователю файлом. */
export function download(blob: Blob, name: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  // Браузер начинает сохранение не в тот же миг: адрес освобождается чуть позже.
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
