import type {
  ApplicationView,
  CheckReport,
  CreateApplication,
  DecisionRequest,
  DocumentPatch,
  DocumentTypeCode,
  DocumentView,
  JournalEntry,
  ProblemDetail,
  Program,
  Rule,
} from "./types";

const BASE = "/api/v1";

const STATUS_MESSAGES: Record<number, string> = {
  400: "Некорректный запрос",
  401: "Требуется вход в систему",
  403: "Недостаточно прав",
  404: "Не найдено",
  405: "Операция не поддерживается сервером",
  409: "Конфликт: достигнут лимит",
  413: "Файл слишком большой",
  415: "Неподдерживаемый формат файла",
  500: "Ошибка сервера",
  502: "Сервер проверки недоступен",
  503: "Сервер проверки недоступен",
};

/** Известные сообщения backend → понятный специалисту текст. */
const DETAIL_TRANSLATIONS: Record<string, string> = {
  "Application not found": "Проверка не найдена",
  "Document not found": "Документ не найден",
  "File must not be empty": "Файл пустой",
  "Invalid filename": "Недопустимое имя файла",
  "Demo storage limit exceeded": "Превышен лимит хранилища (10 МБ на файл, 50 МБ всего)",
  "Demo document limit reached": "Достигнут лимит документов в проверке",
  "Demo application limit reached": "Достигнут лимит проверок",
  "Allowed extensions: pdf, docx, txt, png, jpg, jpeg": "Допустимые форматы: PDF, DOCX, TXT, PNG, JPG",
  "Unable to read uploaded file": "Не удалось прочитать загруженный файл",
  "Invalid request content.": "Проверьте правильность заполнения полей",
  "Maximum upload size exceeded": "Файл больше 10 МБ",
  "Program not found": "Программа субсидии не найдена",
  "Rule not found": "Правило не найдено",
  "Model unavailable": "Модель недоступна, попробуйте повторить позже",
  "Document is being processed": "Документ ещё обрабатывается",
};

export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetail;

  constructor(status: number, message: string, problem?: ProblemDetail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  /**
   * Сервер не знает этот метод или маршрут (функция ещё не реализована на backend).
   * 404 считается «не реализовано», только если это не ответ бизнес-логики о ненайденной сущности:
   * Spring отдаёт «No static resource …», прокси — 404 без Problem Details.
   */
  get isUnsupported(): boolean {
    if (this.status === 405 || this.status === 501) return true;
    if (this.status !== 404) return false;
    const detail = this.problem?.detail ?? "";
    return !this.problem || detail.startsWith("No static resource") || detail.startsWith("No endpoint");
  }
}

let tokenProvider: () => string | null = () => null;

/** Подключение OIDC/JWT: AuthProvider передаёт сюда функцию получения access token. */
export function setTokenProvider(provider: () => string | null) {
  tokenProvider = provider;
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetail | undefined;
  try {
    const text = await response.text();
    if (text) problem = JSON.parse(text) as ProblemDetail;
  } catch {
    problem = undefined;
  }
  const detail = problem?.detail;
  const message =
    (detail && (DETAIL_TRANSLATIONS[detail] ?? detail)) ||
    STATUS_MESSAGES[response.status] ||
    `Ошибка ${response.status}`;
  return new ApiError(response.status, message, problem);
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = tokenProvider();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, application/problem+json");

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Нет связи с сервером. Проверьте, что backend запущен.");
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  return (await response.json()) as T;
}

function sendJson<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  return json<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const app = (id: string) => `/applications/${encodeURIComponent(id)}`;
const doc = (id: string, documentId: string) => `${app(id)}/documents/${encodeURIComponent(documentId)}`;

export const api = {
  documentTypes: () => json<DocumentTypeCode[]>("/document-types"),

  listApplications: () => json<ApplicationView[]>("/applications"),

  getApplication: (id: string) => json<ApplicationView>(`/applications/${encodeURIComponent(id)}`),

  createApplication: (body: CreateApplication) =>
    json<ApplicationView>("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  /** type = null — тип определяет backend по содержимому. */
  uploadDocument: (applicationId: string, file: File, type: DocumentTypeCode | null) => {
    const form = new FormData();
    if (type) form.append("type", type);
    form.append("file", file);
    return json<DocumentView>(`/applications/${encodeURIComponent(applicationId)}/documents`, {
      method: "POST",
      body: form,
    });
  },

  updateDocument: (applicationId: string, documentId: string, patch: DocumentPatch) =>
    json<DocumentView>(
      `/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    ),

  downloadDocument: async (applicationId: string, documentId: string): Promise<Blob> => {
    const response = await request(
      `/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
      { headers: { Accept: "*/*" } },
    );
    return response.blob();
  },

  deleteDocument: async (applicationId: string, documentId: string): Promise<void> => {
    await request(
      `/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" },
    );
  },

  runCheck: (applicationId: string) =>
    json<CheckReport>(`/applications/${encodeURIComponent(applicationId)}/check`, { method: "POST" }),

  /** Повторить обработку файла моделью после ошибки (модель была недоступна, таймаут). */
  reprocessDocument: (applicationId: string, documentId: string) =>
    json<DocumentView>(`${doc(applicationId, documentId)}/reprocess`, { method: "POST" }),

  /** Решение специалиста по заявке: принять, вернуть на доработку, отклонить. */
  decide: (applicationId: string, body: DecisionRequest) =>
    sendJson<ApplicationView>(`${app(applicationId)}/decision`, "POST", body),

  applicationJournal: (applicationId: string) => json<JournalEntry[]>(`${app(applicationId)}/journal`),

  /** Программы субсидий с перечнями документов — для выбора при создании заявки. */
  programs: () => json<Program[]>("/programs"),

  admin: {
    programs: () => json<Program[]>("/admin/programs"),
    createProgram: (program: Program) => sendJson<Program>("/admin/programs", "POST", program),
    saveProgram: (program: Program) =>
      sendJson<Program>(`/admin/programs/${encodeURIComponent(program.code)}`, "PUT", program),
    rules: () => json<Rule[]>("/admin/rules"),
    saveRule: (rule: Rule) => sendJson<Rule>(`/admin/rules/${encodeURIComponent(rule.code)}`, "PUT", rule),
    journal: (limit = 200) => json<JournalEntry[]>(`/admin/journal?limit=${limit}`),
  },
};
