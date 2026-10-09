import type {
  ApplicationView,
  CheckReport,
  CreateApplication,
  DocumentPatch,
  DocumentTypeCode,
  DocumentView,
  ProblemDetail,
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

  get isUnsupported(): boolean {
    return this.status === 405 || this.status === 501;
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
};
