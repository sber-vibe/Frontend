/**
 * Контракт backend API (/api/v1).
 * Обязательные поля соответствуют текущему backend, опциональные — расширенному
 * контракту из ТЗ (AI-классификация, confidence, извлечённые поля, severity).
 * Фронтенд только отображает эти данные и не вычисляет их сам.
 */

export type DocumentTypeCode = string;

export type ProcessingStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";

export interface ExtractedField {
  name: string;
  value: string | number | null;
  confidence?: number | null;
  manuallyCorrected?: boolean;
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
  fields?: ExtractedField[];
}

export type Severity = "ERROR" | "WARNING" | "INFO" | "OK";

export interface Finding {
  code: string;
  message: string;
  documentType: DocumentTypeCode | null;
  severity?: Severity;
  documentId?: string | null;
}

export type ReportStatus = "INCOMPLETE" | "REVIEW_REQUIRED" | "APPROVED" | "REJECTED" | string;

export interface CheckReport {
  status: ReportStatus;
  checkedAt: string;
  findings: Finding[];
}

export interface ApplicationView {
  id: string;
  applicantName: string;
  inn: string;
  projectName: string;
  requestedAmount: number;
  createdAt: string;
  documents: DocumentView[];
  report: CheckReport | null;
}

export interface CreateApplication {
  applicantName: string;
  inn: string;
  projectName: string;
  requestedAmount: number;
}

export interface DocumentPatch {
  type?: DocumentTypeCode;
  fields?: { name: string; value: string }[];
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
