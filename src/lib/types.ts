/**
 * Контракт backend API (/api/v1), полностью описан в docs/API_CONTRACT.md.
 * Обязательные поля соответствуют текущему backend, опциональные — расширенному
 * контракту кейса (программы субсидий, AI-классификация, фоновая обработка, решение, журнал).
 * Фронтенд только отображает эти данные и не вычисляет их сам.
 */

export type DocumentTypeCode = string;

/**
 * Этапы фоновой обработки файла: принят → определяется тип → извлекаются поля → проверяется → готово.
 * PENDING/PROCESSING — обобщённые статусы для backend без детализации этапов.
 */
export type ProcessingStatus =
  | "UPLOADED"
  | "PENDING"
  | "CLASSIFYING"
  | "EXTRACTING"
  | "CHECKING"
  | "PROCESSING"
  | "DONE"
  | "FAILED";

/** Итог по файлу и по пакету: пройдено / требует внимания / есть ошибки. */
export type CheckOutcome = "PASSED" | "ATTENTION" | "ERRORS";

/** Кто установил тип документа: модель или специалист вручную. */
export type TypeSource = "MODEL" | "SPECIALIST";

/** RECOGNIZED — значение прочитано из документа, NOT_RECOGNIZED — прочитать не удалось, нужна проверка специалиста. */
export type FieldStatus = "RECOGNIZED" | "NOT_RECOGNIZED";

export interface ExtractedField {
  name: string;
  /** Текущее значение: извлечённое или исправленное специалистом. null — не распознано. */
  value: string | number | null;
  /** Без status поле считается распознанным, если value не пустое. */
  status?: FieldStatus;
  confidence?: number | null;
  manuallyCorrected?: boolean;
  /** Где в документе найдено значение — фрагмент текста или номер страницы. */
  source?: string | null;
  /** Значение, которое извлекла модель, до ручной правки (null — не распознано). */
  originalValue?: string | number | null;
  correctedBy?: string | null;
  correctedAt?: string | null;
}

/** Реквизит карточки заявки, извлечённый из документа пакета. */
export interface ApplicationRequisite extends ExtractedField {
  /** Документ, из которого взято значение, — чтобы показать оригинал рядом. */
  documentId?: string | null;
}

export interface DocumentView {
  id: string;
  type: DocumentTypeCode | null;
  filename: string;
  size: number;
  uploadedAt: string;
  /** Тип, определённый моделью по содержимому (если backend поддерживает AI-классификацию). */
  detectedType?: DocumentTypeCode | null;
  confidence?: number | null;
  processingStatus?: ProcessingStatus;
  /** Понятная причина, если обработка не удалась (модель недоступна, файл не читается). */
  processingError?: string | null;
  typeSource?: TypeSource;
  typeChangedBy?: string | null;
  typeChangedAt?: string | null;
  /** Итог проверки этого файла, посчитанный сервером. */
  outcome?: CheckOutcome | null;
  fields?: ExtractedField[];
}

export type Severity = "ERROR" | "WARNING" | "INFO" | "OK";

export interface Finding {
  code: string;
  message: string;
  documentType: DocumentTypeCode | null;
  severity?: Severity;
  documentId?: string | null;
  /** Код правила администратора, которое сформировало замечание. */
  rule?: string | null;
  /** Поле документа, к которому относится замечание. */
  field?: string | null;
}

/** Строка комплектности, посчитанная сервером по перечню программы. */
/** CONDITIONAL_UNKNOWN — условный документ, но признак проекта, от которого он зависит, не указан. */
export type CompletenessStatus = "FOUND" | "MISSING" | "CONDITIONAL_MISSING" | "CONDITIONAL_UNKNOWN" | "EXTRA";

export interface CompletenessItem {
  type: DocumentTypeCode;
  status: CompletenessStatus;
  /** Обязательный (REQUIRED) или условный (CONDITIONAL) документ программы; EXTRA — лишний. */
  requirement?: "REQUIRED" | "CONDITIONAL" | "EXTRA";
  documentIds?: string[];
  /** Условие для условного документа, например «если проект подлежит сертификации». */
  condition?: string | null;
  /** Код признака проекта, от которого зависит условный документ. */
  conditionAttribute?: string | null;
  /** Можно ли дослать документ в эту заявку. */
  canUpload?: boolean;
}

export type ReportStatus = CheckOutcome | "INCOMPLETE" | "REVIEW_REQUIRED" | "APPROVED" | "REJECTED" | "PROCESSING" | string;

export interface CheckReport {
  status: ReportStatus;
  checkedAt: string;
  findings: Finding[];
  completeness?: CompletenessItem[];
  checkedBy?: string | null;
}

export type DecisionCode = "ACCEPTED" | "RETURNED" | "REJECTED";

export interface Decision {
  decision: DecisionCode;
  comment?: string | null;
  decidedBy?: string | null;
  decidedAt: string;
}

/**
 * Организацию, ИНН, проект и сумму специалист не вводит: сервер извлекает их из документов пакета.
 * До извлечения (или если не распознано) поля равны null.
 */
export interface ApplicationView {
  id: string;
  applicantName: string | null;
  inn: string | null;
  projectName: string | null;
  requestedAmount: number | null;
  createdAt: string;
  documents: DocumentView[];
  report: CheckReport | null;
  programCode?: string | null;
  programName?: string | null;
  /** Программа определена сервером из заявления, а не выбрана специалистом. */
  programDetected?: boolean;
  decision?: Decision | null;
  /** Пакет с теми же файлами уже проверялся — id той заявки. */
  duplicateOf?: string | null;
  createdBy?: string | null;
  /**
   * Реквизиты карточки с источником: company_name, inn, kpp, project_name, requested_amount.
   * Значения верхнего уровня (applicantName, inn, …) — те же, но без источника и статуса.
   */
  requisites?: ApplicationRequisite[];
  /** Признаки проекта для условных документов: true/false — указано, null или нет ключа — неизвестно. */
  attributes?: Record<string, boolean | null>;
}

/** Признак проекта, от которого зависит условный документ программы (например, «нужна сертификация»). */
export interface ApplicationAttribute {
  code: string;
  name: string;
  description?: string | null;
}

/** Заявка создаётся пустой: реквизиты сервер извлечёт из загруженного пакета. */
export interface CreateApplication {
  /** null — программу определит сервер из заявления. */
  programCode: string | null;
}

export interface ApplicationPatch {
  attributes: Record<string, boolean | null>;
}

export interface DocumentPatch {
  type?: DocumentTypeCode;
  fields?: { name: string; value: string }[];
}

export interface DecisionRequest {
  decision: DecisionCode;
  comment: string;
}

/* ---------- Настройки администратора ---------- */

export interface ProgramDocument {
  type: DocumentTypeCode;
  requirement: "REQUIRED" | "CONDITIONAL";
  /** Для условного документа — пояснение, когда он нужен. */
  condition?: string | null;
  /** Для условного документа — код признака проекта: документ нужен, когда признак равен true. */
  conditionAttribute?: string | null;
}

export interface Program {
  code: string;
  name: string;
  description?: string | null;
  active?: boolean;
  documents: ProgramDocument[];
  /** Версия для защиты от одновременной перезаписи: сервер отвечает 409, если она устарела. */
  version?: number | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export type RuleParamValue = string | number | boolean | number[] | null;

/**
 * Описание параметра правила с сервера. percent — UI принимает проценты (50), API хранит долю (0.5);
 * money — рубли; integer — целое (например, дни); list — список целых через запятую (длины ИНН).
 */
export interface RuleParamSchema {
  kind: "percent" | "number" | "integer" | "money" | "text" | "boolean" | "list";
  label?: string;
  hint?: string | null;
  unit?: string | null;
  /** Границы в единицах интерфейса (для percent — проценты). */
  min?: number | null;
  max?: number | null;
  /** По умолчанию параметр обязателен. */
  required?: boolean;
}

export interface Rule {
  code: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  severity: Severity;
  /** К каким типам документов применяется; пусто — ко всему пакету. */
  documentTypes?: DocumentTypeCode[];
  /** Настраиваемые параметры: порог, поле, срок и т.п. */
  params?: Record<string, RuleParamValue>;
  /** Схема параметров с сервера; без неё интерфейс использует встроенные описания известных параметров. */
  paramSchema?: Record<string, RuleParamSchema>;
  version?: number | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

/* ---------- Журнал ---------- */

export interface JournalEntry {
  id: string;
  at: string;
  actor: string;
  /** SYSTEM — действие сервера/модели, SPECIALIST/ADMIN — действие человека. */
  actorType?: "SYSTEM" | "SPECIALIST" | "ADMIN" | string;
  action: string;
  message: string;
  applicationId?: string | null;
  documentId?: string | null;
  outcome?: "OK" | "FAILED" | string;
  /** Причина отказа или ошибки. */
  reason?: string | null;
  /** Для изменения настроек: прежнее и новое значение, версия настроек после изменения. */
  before?: unknown;
  after?: unknown;
  version?: number | null;
  /** Затронутый объект: программа, правило, заявка, пользователь. */
  objectType?: "PROGRAM" | "RULE" | "APPLICATION" | "USER" | string | null;
  objectId?: string | null;
}

export interface JournalQuery {
  /** Записи строго раньше этого момента (ISO) — для загрузки следующей страницы. */
  before?: string;
  action?: string;
  limit?: number;
}

/** RFC 9457 Problem Details */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: unknown;
}
