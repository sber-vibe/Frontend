import { config } from "./config";
import { fileExtension } from "./format";
import type { CreateApplication } from "./types";

/**
 * Валидация ввода в формах — только для удобства специалиста (подсказать до отправки).
 * Сервер повторяет эти проверки сам; бизнес-правила проверки пакета здесь не выполняются.
 */

export interface CreateCheckValues {
  applicantName: string;
  inn: string;
  projectName: string;
  requestedAmount: string;
}

export type CreateCheckErrors = Partial<Record<keyof CreateCheckValues, string>>;

export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s₽]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export function validateCreateCheck(values: CreateCheckValues): CreateCheckErrors {
  const errors: CreateCheckErrors = {};
  const name = values.applicantName.trim();
  if (!name) errors.applicantName = "Укажите организацию";
  else if (name.length > 200) errors.applicantName = "Не более 200 символов";

  const inn = values.inn.trim();
  if (!inn) errors.inn = "Укажите ИНН";
  else if (!/^\d+$/.test(inn)) errors.inn = "ИНН состоит только из цифр";
  else if (inn.length !== 10 && inn.length !== 12) errors.inn = "ИНН содержит 10 (юрлицо) или 12 (ИП) цифр";

  const project = values.projectName.trim();
  if (!project) errors.projectName = "Укажите название проекта или субсидии";
  else if (project.length > 300) errors.projectName = "Не более 300 символов";

  if (!values.requestedAmount.trim()) errors.requestedAmount = "Укажите сумму";
  else {
    const amount = parseAmount(values.requestedAmount);
    if (Number.isNaN(amount)) errors.requestedAmount = "Введите число, например 850 000";
    else if (amount <= 0) errors.requestedAmount = "Сумма должна быть больше нуля";
  }
  return errors;
}

export function toCreateApplication(values: CreateCheckValues): CreateApplication {
  return {
    applicantName: values.applicantName.trim(),
    inn: values.inn.trim(),
    projectName: values.projectName.trim(),
    requestedAmount: parseAmount(values.requestedAmount),
  };
}

export function validateFile(file: File): string | null {
  if (!config.acceptedExtensions.includes(fileExtension(file.name))) {
    return "Формат не поддерживается. Допустимы PDF, DOCX, TXT, PNG, JPG";
  }
  if (file.size === 0) return "Файл пустой";
  if (file.size > config.maxFileSize) return "Файл больше 10 МБ";
  return null;
}
