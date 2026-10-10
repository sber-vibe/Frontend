import { config } from "./config";
import type {
  ApplicationView,
  CheckOutcome,
  CheckReport,
  CompletenessItem,
  DecisionCode,
  DocumentView,
  Finding,
  ProcessingStatus,
  Severity,
} from "./types";

/**
 * Отображение данных, пришедших с сервера: подписи, цвета, группировка.
 * Здесь нет правил проверки — статус, комплектность и замечания вычисляет backend.
 */

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Если сервер не прислал severity, берём уровень по известному коду замечания. */
const SEVERITY_BY_CODE: Record<string, Severity> = {
  MISSING_DOCUMENT: "ERROR",
  CONDITIONAL_DOCUMENT_MISSING: "WARNING",
  DUPLICATE_DOCUMENT: "WARNING",
  EXTRA_DOCUMENT: "INFO",
  MANUAL_REVIEW_REQUIRED: "INFO",
  TYPE_NOT_DETERMINED: "WARNING",
  DOCUMENT_EXPIRED: "ERROR",
  DOCUMENT_EXPIRES_SOON: "WARNING",
  DATE_IN_FUTURE: "ERROR",
  INN_INVALID: "ERROR",
  INN_MISMATCH: "WARNING",
  OWN_FUNDS_SHARE_LOW: "ERROR",
  AMOUNT_MISMATCH: "ERROR",
  REQUIRED_FIELD_MISSING: "WARNING",
  CADASTRAL_NUMBER_INVALID: "ERROR",
  EMPTY_CONTENT: "ERROR",
  PROCESSING_FAILED: "WARNING",
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

/** Итог по пакету и по файлу в формулировках кейса: пройдено / требует внимания / есть ошибки. */
export const OUTCOME_VIEW: Record<CheckOutcome, StatusView> = {
  PASSED: {
    label: "Пройдено",
    tone: "success",
    description: "Автоматические проверки пройдены. Решение по заявке принимает специалист.",
  },
  ATTENTION: {
    label: "Требует внимания",
    tone: "warning",
    description: "Есть замечания, которые нужно посмотреть специалисту: условные документы, неуверенный тип, расхождения.",
  },
  ERRORS: {
    label: "Есть ошибки",
    tone: "danger",
    description: "Найдены ошибки: не хватает обязательных документов или нарушены правила проверки.",
  },
};

const REPORT_STATUS: Record<string, StatusView> = {
  ...OUTCOME_VIEW,
  PROCESSING: {
    label: "Идёт проверка",
    tone: "info",
    description: "Сервер обрабатывает документы в фоне. Результат появится по мере готовности.",
  },
  // статусы ранней заготовки backend
  INCOMPLETE: {
    label: "Есть ошибки",
    tone: "danger",
    description: "В пакете есть критические замечания — его нужно дополнить или исправить.",
  },
  REVIEW_REQUIRED: {
    label: "Требует внимания",
    tone: "warning",
    description: "Комплект собран, требуется решение специалиста.",
  },
  APPROVED: { label: "Пройдено", tone: "success", description: "Пакет прошёл проверку." },
  REJECTED: { label: "Есть ошибки", tone: "danger", description: "Пакет не прошёл проверку." },
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

/* ---------- Решение специалиста ---------- */

export const DECISION_VIEW: Record<DecisionCode, { label: string; tone: Tone; action: string; icon: "success" | "refresh" | "error" }> = {
  ACCEPTED: { label: "Принята", tone: "success", action: "Принять заявку", icon: "success" },
  RETURNED: { label: "Возвращена на доработку", tone: "warning", action: "Вернуть на доработку", icon: "refresh" },
  REJECTED: { label: "Отклонена", tone: "danger", action: "Отклонить", icon: "error" },
};

/* ---------- Фоновая обработка файлов ---------- */

/** Шаги, которые видит специалист: принят → определяется → проверен. */
export const PROCESSING_STEPS = ["Принят", "Определяется", "Проверен"] as const;

const STAGE: Record<ProcessingStatus, number> = {
  UPLOADED: 0,
  PENDING: 0,
  CLASSIFYING: 1,
  EXTRACTING: 1,
  PROCESSING: 1,
  CHECKING: 1,
  DONE: 2,
  FAILED: 2,
};

const STAGE_LABEL: Record<ProcessingStatus, string> = {
  UPLOADED: "Принят, ждёт обработки",
  PENDING: "Принят, ждёт обработки",
  CLASSIFYING: "Определяется тип документа",
  EXTRACTING: "Извлекаются поля",
  CHECKING: "Проверяется по правилам",
  PROCESSING: "Обрабатывается",
  DONE: "Проверен",
  FAILED: "Обработка не удалась",
};

/** Документ без processingStatus — backend без фоновой обработки, файл уже обработан при загрузке. */
export function processingStatus(doc: DocumentView): ProcessingStatus {
  return doc.processingStatus ?? "DONE";
}

export function isProcessing(doc: DocumentView): boolean {
  const s = processingStatus(doc);
  return s !== "DONE" && s !== "FAILED";
}

export function processingStage(doc: DocumentView): number {
  return STAGE[processingStatus(doc)] ?? 0;
}

export function processingLabel(doc: DocumentView): string {
  return STAGE_LABEL[processingStatus(doc)] ?? processingStatus(doc);
}

/** Нужно ли опрашивать сервер: есть файлы в обработке или отчёт ещё формируется. */
export function needsPolling(app: ApplicationView): boolean {
  return app.documents.some(isProcessing) || app.report?.status === "PROCESSING";
}

/* ---------- Дашборд ---------- */

export type DashboardFilter = "all" | "waiting" | "errors" | "attention" | "passed" | "decided";

export const DASHBOARD_FILTERS: { id: DashboardFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "waiting", label: "Ожидают проверки" },
  { id: "errors", label: "Есть ошибки" },
  { id: "attention", label: "Требуют внимания" },
  { id: "passed", label: "Пройдены" },
  { id: "decided", label: "Решение принято" },
];

export function matchesFilter(app: ApplicationView, filter: DashboardFilter): boolean {
  const tone = app.report ? reportStatusView(app.report).tone : null;
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return app.report === null || app.report.status === "PROCESSING";
    case "errors":
      return tone === "danger";
    case "attention":
      return tone === "warning" || tone === "info";
    case "passed":
      return tone === "success";
    case "decided":
      return Boolean(app.decision);
  }
}

export function matchesSearch(app: ApplicationView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [app.applicantName, app.inn, app.projectName, app.programName ?? ""].some((v) => v.toLowerCase().includes(q));
}

/* ---------- Документы ---------- */

/** Тип для отображения: подтверждённый специалистом/сервером, иначе предложенный моделью. */
export function effectiveType(doc: DocumentView): string | null {
  const type = doc.type ?? doc.detectedType ?? null;
  return type === "UNKNOWN" ? null : type;
}

/** Нужно ли показать «Тип документа требует подтверждения специалиста». */
export function needsConfirmation(doc: DocumentView): boolean {
  if (isProcessing(doc) || processingStatus(doc) === "FAILED") return false;
  if (doc.typeSource === "SPECIALIST") return false;
  if (!effectiveType(doc)) return true;
  return typeof doc.confidence === "number" && doc.confidence < config.confidenceThreshold;
}

export function confidenceTone(confidence: number | null | undefined): Tone {
  if (typeof confidence !== "number") return "neutral";
  if (confidence >= config.confidenceThreshold) return "success";
  if (confidence >= config.confidenceThreshold - 0.25) return "warning";
  return "danger";
}

const OUTCOME_TONE: Record<CheckOutcome, Tone> = { PASSED: "success", ATTENTION: "warning", ERRORS: "danger" };

/** Замечания сервера, относящиеся к документу: по id или по типу, если id не указан. */
export function documentFindings(doc: DocumentView, report: CheckReport | null): Finding[] {
  if (!report) return [];
  return report.findings.filter(
    (f) => (f.documentId && f.documentId === doc.id) || (!f.documentId && f.documentType && f.documentType === effectiveType(doc)),
  );
}

/** Отметка документа в списке пакета: итог сервера по файлу, иначе — по замечаниям, привязанным к документу. */
export function documentTone(doc: DocumentView, report: CheckReport | null): Tone {
  if (isProcessing(doc)) return "info";
  if (processingStatus(doc) === "FAILED") return "danger";
  if (doc.outcome) return OUTCOME_TONE[doc.outcome];
  if (needsConfirmation(doc)) return "warning";
  if (!report) return "neutral";
  const related = documentFindings(doc, report);
  if (related.some((f) => findingSeverity(f) === "ERROR")) return "danger";
  if (related.some((f) => findingSeverity(f) === "WARNING")) return "warning";
  return "success";
}

export function documentOutcomeLabel(doc: DocumentView, report: CheckReport | null): string {
  if (isProcessing(doc)) return processingLabel(doc);
  if (processingStatus(doc) === "FAILED") return "Обработка не удалась";
  if (doc.outcome) return OUTCOME_VIEW[doc.outcome].label;
  if (needsConfirmation(doc)) return "Требует проверки типа";
  const tone = documentTone(doc, report);
  if (!report) return "Ждёт проверки пакета";
  return tone === "danger" ? "Есть ошибки" : tone === "warning" ? "Требует внимания" : "Пройдено";
}

/* ---------- Комплектность ---------- */

export interface CompletenessRow {
  type: string;
  status: CompletenessItem["status"];
  requirement: NonNullable<CompletenessItem["requirement"]>;
  condition?: string | null;
  documentIds: string[];
  canUpload: boolean;
}

export interface CompletenessView {
  rows: CompletenessRow[];
  /** Обязательные документы: найдено / всего. */
  present: number;
  total: number;
  missing: string[];
  conditionalMissing: string[];
  extra: string[];
}

/**
 * Строки «Комплектность»: берутся из report.completeness, который считает сервер по перечню программы.
 * Для backend без этого поля — обязательные типы из API + отсутствующие по замечаниям MISSING_DOCUMENT.
 */
export function completenessRows(requiredTypes: string[], report: CheckReport): CompletenessView {
  let rows: CompletenessRow[];
  if (report.completeness && report.completeness.length > 0) {
    rows = report.completeness.map((c) => ({
      type: c.type,
      status: c.status,
      requirement: c.requirement ?? (c.status === "EXTRA" ? "EXTRA" : c.status === "CONDITIONAL_MISSING" ? "CONDITIONAL" : "REQUIRED"),
      condition: c.condition,
      documentIds: c.documentIds ?? [],
      canUpload: c.canUpload ?? c.status !== "EXTRA",
    }));
  } else {
    const missing = new Set(
      report.findings.filter((f) => f.code === "MISSING_DOCUMENT" && f.documentType).map((f) => f.documentType as string),
    );
    const conditional = new Set(
      report.findings.filter((f) => f.code === "CONDITIONAL_DOCUMENT_MISSING" && f.documentType).map((f) => f.documentType as string),
    );
    rows = Array.from(new Set([...requiredTypes, ...missing])).map((type) => ({
      type,
      status: missing.has(type) ? "MISSING" : "FOUND",
      requirement: "REQUIRED",
      documentIds: [],
      canUpload: true,
    }));
    for (const type of conditional) {
      rows.push({ type, status: "CONDITIONAL_MISSING", requirement: "CONDITIONAL", documentIds: [], canUpload: true });
    }
  }
  const required = rows.filter((r) => r.requirement === "REQUIRED");
  return {
    rows,
    present: required.filter((r) => r.status === "FOUND").length,
    total: required.length,
    missing: rows.filter((r) => r.status === "MISSING").map((r) => r.type),
    conditionalMissing: rows.filter((r) => r.status === "CONDITIONAL_MISSING").map((r) => r.type),
    extra: rows.filter((r) => r.status === "EXTRA").map((r) => r.type),
  };
}

/* ---------- Сводки по потоку заявок (по данным сервера) ---------- */

export interface FrequentFinding {
  code: string;
  example: string;
  severity: Severity;
  count: number;
  applications: number;
}

/** Частые замечания по всем проверенным заявкам — показатель качества потока. */
export function frequentFindings(apps: ApplicationView[], limit = 5): FrequentFinding[] {
  const byCode = new Map<string, FrequentFinding & { apps: Set<string> }>();
  for (const app of apps) {
    for (const f of app.report?.findings ?? []) {
      const severity = findingSeverity(f);
      if (severity === "OK" || severity === "INFO") continue;
      const entry = byCode.get(f.code) ?? { code: f.code, example: f.message, severity, count: 0, applications: 0, apps: new Set() };
      entry.count++;
      entry.apps.add(app.id);
      byCode.set(f.code, entry);
    }
  }
  return Array.from(byCode.values())
    .map(({ apps: set, ...rest }) => ({ ...rest, applications: set.size }))
    .sort((a, b) => b.applications - a.applications || b.count - a.count)
    .slice(0, limit);
}

export interface ExpiringDocument {
  app: ApplicationView;
  finding: Finding;
}

/** Документы с истекающим или истёкшим сроком — по замечаниям сервера. */
export function expiringDocuments(apps: ApplicationView[]): ExpiringDocument[] {
  return apps.flatMap((app) =>
    (app.report?.findings ?? [])
      .filter((f) => f.code === "DOCUMENT_EXPIRES_SOON" || f.code === "DOCUMENT_EXPIRED")
      .map((finding) => ({ app, finding })),
  );
}
