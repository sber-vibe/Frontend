import type { DocumentTypeCode } from "./types";

/**
 * Справочник подписей для типов документов. Это только локализация названий:
 * перечень обязательных типов и правила комплектности приходят с backend.
 * Неизвестный код показывается как есть, поэтому новые типы на сервере не ломают интерфейс.
 */
const LABELS: Record<string, { title: string; short: string }> = {
  APPLICATION: { title: "Заявление на предоставление субсидии", short: "Заявление" },
  REGISTRATION_EXTRACT: { title: "Выписка из ЕГРЮЛ/ЕГРИП", short: "Выписка ЕГРЮЛ" },
  COST_ESTIMATE: { title: "Смета расходов проекта", short: "Смета" },
  SUPPORTING_DOCUMENT: { title: "Дополнительный документ", short: "Доп. документ" },
  TAX_CERTIFICATE: { title: "Справка об отсутствии задолженности", short: "Справка ФНС" },
  CONSENT: { title: "Согласие на обработку персональных данных", short: "Согласие" },
  BUSINESS_PLAN: { title: "Бизнес-план проекта", short: "Бизнес-план" },
  FINANCIAL_STATEMENT: { title: "Бухгалтерская отчётность", short: "Отчётность" },
  POWER_OF_ATTORNEY: { title: "Доверенность", short: "Доверенность" },
  BANK_DETAILS: { title: "Банковские реквизиты", short: "Реквизиты" },
};

/** Типы, которые специалист может выбрать вручную (если сервер не прислал свой список). */
export const KNOWN_TYPES: DocumentTypeCode[] = [
  "APPLICATION",
  "REGISTRATION_EXTRACT",
  "COST_ESTIMATE",
  "SUPPORTING_DOCUMENT",
];

export function typeTitle(code: DocumentTypeCode | null | undefined): string {
  if (!code) return "Тип не определён";
  return LABELS[code]?.title ?? code;
}

export function typeShort(code: DocumentTypeCode | null | undefined): string {
  if (!code) return "Не определён";
  return LABELS[code]?.short ?? code;
}

/** Объединяет типы с сервера и известные типы, сохраняя порядок и без дублей. */
export function selectableTypes(serverTypes: DocumentTypeCode[]): DocumentTypeCode[] {
  return Array.from(new Set([...serverTypes, ...KNOWN_TYPES]));
}

const FIELD_LABELS: Record<string, string> = {
  company_name: "Организация",
  organization_name: "Организация",
  inn: "ИНН",
  ogrn: "ОГРН",
  kpp: "КПП",
  requested_amount: "Запрашиваемая сумма",
  total_cost: "Стоимость проекта",
  director: "Руководитель",
  date: "Дата документа",
  valid_until: "Действителен до",
  address: "Адрес",
};

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
