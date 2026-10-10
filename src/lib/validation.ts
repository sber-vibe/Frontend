import { config } from "./config";
import { fileExtension } from "./format";

/**
 * Валидация ввода в формах — только для удобства специалиста (подсказать до отправки).
 * Сервер повторяет эти проверки сам; бизнес-правила проверки пакета здесь не выполняются.
 * Реквизиты заявки (организация, ИНН, сумма) специалист не вводит — их извлекает сервер.
 */

export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s₽]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export function validateFile(file: File): string | null {
  if (!config.acceptedExtensions.includes(fileExtension(file.name))) {
    return `Формат не поддерживается. Допустимы ${config.acceptedFormatsLabel}`;
  }
  if (file.size === 0) return "Файл пустой";
  if (file.size > config.maxFileSize) return "Файл больше 50 МБ";
  return null;
}
