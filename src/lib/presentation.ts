import { config } from "./config";
import type { ApplicationView, CheckReport, DocumentView, Finding, Severity } from "./types";

/**
 * Отображение данных, пришедших с сервера: подписи, цвета, группировка.
 * Здесь нет правил проверки — статус, комплектность и замечания вычисляет backend.
 */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Если сервер не прислал severity, берём уровень по известному коду замечания. */
const SEVERITY_BY_CODE: Record<string, Severity> = {
  MISSING_DOCUMENT: "ERROR",
  DUPLICATE_DOCUMENT: "WARNING",
  MANUAL_REVIEW_REQUIRED: "INFO",
};

export function findingSeverity(finding: Finding): Severity {
  return finding.severity ?? SEVERITY_BY_CODE[finding.code] ?? "WARNING";
}

export const SEVERITY_TONE: Record<Severity, Tone> = {
  ERROR: "danger",
  WARNING: "warning",
  INFO: "info",
  OK: "success",
};

export interface GroupedFindings {
  errors: Finding[];
  warnings: Finding[];
  info: Finding[];
  passed: Finding[];
}

export function groupFindings(findings: Finding[]): GroupedFindings {
  const groups: GroupedFindings = { errors: [], warnings: [], info: [], passed: [] };
  for (const f of findings) {
    const s = findingSeverity(f);
    if (s === "ERROR") groups.errors.push(f);
    else if (s === "WARNING") groups.warnings.push(f);
    else if (s === "OK") groups.passed.push(f);
    else groups.info.push(f);
  }
  return groups;
}

export interface StatusView {
  label: string;
  tone: Tone;
  description: string;
}

const REPORT_STATUS: Record<string, StatusView> = {
  INCOMPLETE: {
    label: "Требует доработки",
    tone: "danger",
    description: "В пакете есть критические замечания — его нужно дополнить или исправить.",
  },
  REVIEW_REQUIRED: {
    label: "Готов к экспертизе",
    tone: "info",
    description: "Автоматические проверки пройдены, требуется решение специалиста.",
  },
  APPROVED: { label: "Проверено", tone: "success", description: "Пакет прошёл проверку." },
  REJECTED: { label: "Отклонено", tone: "danger", description: "Пакет отклонён." },
};

export function reportStatusView(report: CheckReport | null, documentsCount = 0): StatusView {
  if (!report) {
    return documentsCount === 0
      ? { label: "Ожидает документы", tone: "neutral", description: "Загрузите пакет документов организации." }
      : { label: "Не проверено", tone: "neutral", description: "Документы загружены, запустите проверку." };
  }
  return (
    REPORT_STATUS[report.status] ?? { label: report.status, tone: "neutral", description: "Статус получен от сервера." }
  );
}

export type DashboardFilter = "all" | "waiting" | "errors" | "review";

export const DASHBOARD_FILTERS: { id: DashboardFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "waiting", label: "Ожидают проверки" },
  { id: "errors", label: "Есть ошибки" },
  { id: "review", label: "Проверены" },
];

export function matchesFilter(app: ApplicationView, filter: DashboardFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return app.report === null;
    case "errors":
      return app.report !== null && reportStatusView(app.report).tone === "danger";
    case "review":
      return app.report !== null && reportStatusView(app.report).tone !== "danger";
  }
}

export function matchesSearch(app: ApplicationView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [app.applicantName, app.inn, app.projectName].some((v) => v.toLowerCase().includes(q));
}

/** Тип для отображения: подтверждённый специалистом/сервером, иначе предложенный моделью. */
export function effectiveType(doc: DocumentView): string | null {
  return doc.type ?? doc.detectedType ?? null;
}

/** Нужно ли показать «Тип документа требует подтверждения специалиста». */
export function needsConfirmation(doc: DocumentView): boolean {
  if (doc.processingStatus === "PENDING" || doc.processingStatus === "PROCESSING") return false;
  if (!effectiveType(doc)) return true;
  return typeof doc.confidence === "number" && doc.confidence < config.confidenceThreshold;
}

export function confidenceTone(confidence: number | null | undefined): Tone {
  if (typeof confidence !== "number") return "neutral";
  if (confidence >= config.confidenceThreshold) return "success";
  if (confidence >= config.confidenceThreshold - 0.25) return "warning";
  return "danger";
}

/** Отметка документа в списке пакета — на основе замечаний сервера, привязанных к документу/типу. */
export function documentTone(doc: DocumentView, report: CheckReport | null): Tone {
  if (needsConfirmation(doc)) return "warning";
  if (!report) return "neutral";
  const related = report.findings.filter(
    (f) => (f.documentId && f.documentId === doc.id) || (!f.documentId && f.documentType && f.documentType === effectiveType(doc)),
  );
  if (related.some((f) => findingSeverity(f) === "ERROR")) return "danger";
  if (related.some((f) => findingSeverity(f) === "WARNING")) return "warning";
  return "success";
}

/** Строки «Комплектность» итогового экрана: обязательные типы из API + отсутствующие по замечаниям сервера. */
export function completenessRows(requiredTypes: string[], report: CheckReport) {
  const missing = new Set(
    report.findings.filter((f) => f.code === "MISSING_DOCUMENT" && f.documentType).map((f) => f.documentType as string),
  );
  const all = Array.from(new Set([...requiredTypes, ...missing]));
  return {
    rows: all.map((type) => ({ type, present: !missing.has(type) })),
    present: all.length - missing.size,
    total: all.length,
    missing: Array.from(missing),
  };
}
