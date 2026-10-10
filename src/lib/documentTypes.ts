import { formatDate, formatMoney } from "./format";
import type { DocumentTypeCode } from "./types";

/**
 * Справочник подписей для типов документов. Это только локализация названий:
 * перечни обязательных и условных документов программ и правила приходят с backend.
 * Неизвестный код показывается как есть, поэтому новые типы на сервере не ломают интерфейс.
 */
const LABELS: Record<string, { title: string; short: string }> = {
  // восемь видов документов кейса + декларация ГИМС (условный документ программы «Обустройство пляжа»)
  APPLICATION: { title: "Заявление на субсидию", short: "Заявление" },
  PD_CONSENT: { title: "Согласие на обработку персональных данных", short: "Согласие на ПД" },
  CONFORMITY_CERTIFICATE: { title: "Сертификат соответствия", short: "Сертификат" },
  PROJECT_PRESENTATION: { title: "Презентация проекта", short: "Презентация" },
  COST_JUSTIFICATION: { title: "Обоснование затрат", short: "Обоснование затрат" },
  BANK_STATEMENT: { title: "Выписка из банка", short: "Выписка из банка" },
  REAL_ESTATE_DOCUMENT: { title: "Документ на недвижимое имущество", short: "Недвижимость" },
  GUARANTEE_LETTER: { title: "Гарантийное письмо", short: "Гарантийное письмо" },
  GIMS_DECLARATION: { title: "Декларация ГИМС", short: "Декларация ГИМС" },
  UNKNOWN: { title: "Тип не определён", short: "Не определён" },
  // демо-типы ранней заготовки backend
  REGISTRATION_EXTRACT: { title: "Выписка из ЕГРЮЛ/ЕГРИП", short: "Выписка ЕГРЮЛ" },
  COST_ESTIMATE: { title: "Смета расходов проекта", short: "Смета" },
  SUPPORTING_DOCUMENT: { title: "Дополнительный документ", short: "Доп. документ" },
  CONSENT: { title: "Согласие на обработку персональных данных", short: "Согласие" },
};

/** Типы кейса, которые специалист может выбрать вручную (если сервер не прислал свой список). */
export const KNOWN_TYPES: DocumentTypeCode[] = [
  "APPLICATION",
  "PD_CONSENT",
  "CONFORMITY_CERTIFICATE",
  "PROJECT_PRESENTATION",
  "COST_JUSTIFICATION",
  "BANK_STATEMENT",
  "REAL_ESTATE_DOCUMENT",
  "GUARANTEE_LETTER",
  "GIMS_DECLARATION",
];

export function typeTitle(code: DocumentTypeCode | null | undefined): string {
  if (!code) return "Тип не определён";
  return LABELS[code]?.title ?? code;
}

export function typeShort(code: DocumentTypeCode | null | undefined): string {
  if (!code) return "Не определён";
  return LABELS[code]?.short ?? code;
}

/** Типы для ручного выбора: сначала список сервера, затем известные типы кейса — без дублей и без UNKNOWN. */
export function selectableTypes(serverTypes: DocumentTypeCode[]): DocumentTypeCode[] {
  return Array.from(new Set([...serverTypes, ...KNOWN_TYPES])).filter((t) => t !== "UNKNOWN");
}

const FIELD_LABELS: Record<string, string> = {
  company_name: "Организация",
  organization_name: "Организация",
  organization: "Организация",
  guarantor: "Организация-гарант",
  inn: "ИНН",
  ogrn: "ОГРН",
  kpp: "КПП",
  requested_amount: "Запрашиваемая сумма",
  amount: "Сумма",
  total_cost: "Общая сумма расходов",
  total_expenses: "Общая сумма расходов",
  own_funds: "Собственные средства",
  own_funds_share: "Доля собственных средств",
  expense_items: "Статьи расходов",
  director: "Руководитель",
  signatory: "Подписант",
  full_name: "ФИО",
  passport: "Паспортные данные",
  date: "Дата документа",
  issue_date: "Дата выдачи",
  valid_until: "Действителен до",
  number: "Номер",
  certificate_number: "Номер сертификата",
  certification_body: "Орган сертификации",
  account: "Номер счёта",
  account_number: "Номер счёта",
  balance: "Остаток",
  bik: "БИК",
  cadastral_number: "Кадастровый номер",
  area: "Площадь",
  purpose: "Назначение",
  address: "Адрес",
  project_name: "Наименование проекта",
  summary: "Краткое описание",
  description: "Краткое описание",
};

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const MONEY_FIELDS = /amount|cost|expenses|funds$|balance|sum/;
const DATE_FIELDS = /(^|_)date$|valid_until|issue_date/;

/** Значение поля для показа: суммы с разрядами и ₽, даты по-русски. Само значение не меняется. */
export function formatFieldValue(name: string, value: string | number | null): string {
  if (value === null || value === "") return "—";
  if (MONEY_FIELDS.test(name) && !name.includes("share")) {
    const n = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return formatMoney(n);
  }
  if (DATE_FIELDS.test(name) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return formatDate(String(value));
  return String(value);
}
