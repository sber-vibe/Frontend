import { fieldLabel, formatFieldValue } from "./documentTypes";
import { isProcessing } from "./presentation";
import type { ApplicationRequisite, ApplicationView, ExtractedField } from "./types";

/**
 * Реквизиты карточки заявки. Специалист их не вводит — сервер извлекает из документов пакета.
 * Нераспознанное значение показывается как «требуется проверка», а не как выполненное извлечение.
 */

export const NOT_RECOGNIZED = "Не распознано / требуется проверка";

/** Распознано ли поле: сервер явно не пометил его как нераспознанное и значение не пустое. */
export function isRecognized(field: Pick<ExtractedField, "status" | "value">): boolean {
  if (field.status === "NOT_RECOGNIZED") return false;
  return field.value !== null && field.value !== undefined && String(field.value).trim() !== "";
}

/** Реквизиты в порядке показа: имя поля в API и значение верхнего уровня ApplicationView. */
export const REQUISITES = [
  { name: "company_name", pick: (a: ApplicationView) => a.applicantName },
  { name: "inn", pick: (a: ApplicationView) => a.inn },
  { name: "project_name", pick: (a: ApplicationView) => a.projectName },
  { name: "requested_amount", pick: (a: ApplicationView) => a.requestedAmount },
] as const;

export type RequisiteName = (typeof REQUISITES)[number]["name"];

export type RequisiteView =
  /** Значение есть (извлечено или исправлено специалистом). */
  | { kind: "value"; name: string; label: string; text: string; field: ApplicationRequisite }
  /** Документы ещё разбираются или пакет не загружен. */
  | { kind: "pending"; name: string; label: string; text: string; field: ApplicationRequisite | null }
  /** Извлечение завершено, но значение не прочитано. */
  | { kind: "missing"; name: string; label: string; text: string; field: ApplicationRequisite | null };

function extractionPending(app: ApplicationView): boolean {
  return app.documents.length === 0 || app.documents.some(isProcessing);
}

function pendingText(app: ApplicationView): string {
  return app.documents.length === 0 ? "Появится после загрузки пакета" : "Извлекается из документов…";
}

export function requisiteView(app: ApplicationView, name: string): RequisiteView {
  const label = fieldLabel(name);
  const fromServer = app.requisites?.find((r) => r.name === name) ?? null;
  const top = REQUISITES.find((r) => r.name === name)?.pick(app) ?? null;
  const field: ApplicationRequisite | null = fromServer ?? (top !== null ? { name, value: top } : null);

  if (field && isRecognized(field)) {
    return { kind: "value", name, label, text: formatFieldValue(name, field.value), field };
  }
  if (extractionPending(app) && field?.status !== "NOT_RECOGNIZED") {
    return { kind: "pending", name, label, text: pendingText(app), field };
  }
  return { kind: "missing", name, label, text: NOT_RECOGNIZED, field };
}

/** Все реквизиты карточки: базовые и дополнительные, которые прислал сервер (например, КПП). */
export function requisiteViews(app: ApplicationView): RequisiteView[] {
  const names: string[] = REQUISITES.map((r) => r.name);
  for (const r of app.requisites ?? []) if (!names.includes(r.name)) names.push(r.name);
  return names.map((n) => requisiteView(app, n));
}

/** Короткий текст реквизита для карточек, заголовков и протокола. */
export function requisiteText(app: ApplicationView, name: RequisiteName): string {
  return requisiteView(app, name).text;
}

/** Заголовок заявки: организация, а пока она не извлечена — понятная заглушка. */
export function applicationTitle(app: ApplicationView): string {
  const view = requisiteView(app, "company_name");
  if (view.kind === "value") return view.text;
  return view.kind === "pending" ? "Новая заявка" : "Организация не распознана";
}

/** ИНН для ссылок на историю организации — только распознанный. */
export function recognizedInn(app: ApplicationView): string | null {
  const view = requisiteView(app, "inn");
  return view.kind === "value" ? String(view.field.value) : null;
}

/** Сколько полей документа распознано: нераспознанные не считаются извлечёнными. */
export function extractionSummary(fields: ExtractedField[]): { recognized: number; total: number } {
  return { recognized: fields.filter(isRecognized).length, total: fields.length };
}
