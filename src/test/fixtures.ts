import type { ApplicationView, CheckReport, DocumentView } from "@/lib/types";

export function makeDocument(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: "doc-1",
    type: "APPLICATION",
    filename: "1.pdf",
    size: 2048,
    uploadedAt: "2026-10-09T08:00:00Z",
    ...overrides,
  };
}

export function makeReport(overrides: Partial<CheckReport> = {}): CheckReport {
  return {
    status: "INCOMPLETE",
    checkedAt: "2026-10-09T09:00:00Z",
    findings: [
      { code: "MISSING_DOCUMENT", message: "Отсутствует обязательный документ", documentType: "COST_ESTIMATE" },
      {
        code: "MANUAL_REVIEW_REQUIRED",
        message: "Проверена только комплектность.",
        documentType: null,
      },
    ],
    ...overrides,
  };
}

export function makeApplication(overrides: Partial<ApplicationView> = {}): ApplicationView {
  return {
    id: "app-1",
    applicantName: "ООО Ромашка",
    inn: "6161234567",
    projectName: "Цифровая платформа",
    requestedAmount: 850000,
    createdAt: "2026-10-09T07:00:00Z",
    documents: [],
    report: null,
    ...overrides,
  };
}

/** Ответ fetch для моков. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}
