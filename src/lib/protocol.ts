import { typeShort, typeTitle } from "./documentTypes";
import { formatDateTime } from "./format";
import { completenessRows, DECISION_VIEW, findingSeverity, groupFindings, reportStatusView } from "./presentation";
import { requisiteText } from "./requisites";
import type { ApplicationView, CheckReport, Finding } from "./types";

const SEVERITY_LABEL = { ERROR: "Ошибка", WARNING: "Требует внимания", INFO: "Информация", OK: "Пройдено" } as const;

const ROW_MARK = { FOUND: "x", MISSING: " ", CONDITIONAL_MISSING: "?", CONDITIONAL_UNKNOWN: "?", EXTRA: "+" } as const;
const ROW_NOTE = {
  FOUND: "",
  MISSING: " — не хватает",
  CONDITIONAL_MISSING: " — условно требуется",
  CONDITIONAL_UNKNOWN: " — не указан признак проекта, применимость не определена",
  EXTRA: " — лишний",
} as const;

function findingLine(f: Finding): string {
  const type = f.documentType ? ` [${typeShort(f.documentType)}]` : "";
  return `- ${SEVERITY_LABEL[findingSeverity(f)]}${type}: ${f.message}`;
}

/** Текстовый протокол проверки — дословно по отчёту сервера, для передачи заявителю и архива. */
export function buildProtocol(app: ApplicationView, report: CheckReport, requiredTypes: string[], specialist?: string): string {
  const status = reportStatusView(report, app.documents);
  const groups = groupFindings(report.findings);
  const completeness = completenessRows(requiredTypes, report);
  const decision = app.decision ? DECISION_VIEW[app.decision.decision] : null;
  const lines = [
    "ПРОТОКОЛ ПРОВЕРКИ ПАКЕТА ДОКУМЕНТОВ НА СУБСИДИЮ",
    "",
    `Организация: ${requisiteText(app, "company_name")}`,
    `ИНН: ${requisiteText(app, "inn")}`,
    `Проект: ${requisiteText(app, "project_name")}`,
    app.programName ? `Программа субсидии: ${app.programName}` : null,
    `Запрашиваемая сумма: ${requisiteText(app, "requested_amount")}`,
    `Дата проверки: ${formatDateTime(report.checkedAt)}`,
    specialist ? `Специалист: ${specialist}` : null,
    "",
    `ИТОГ АВТОМАТИЧЕСКОЙ ПРОВЕРКИ: ${status.label}`,
    `Ошибок: ${groups.errors.length}`,
    `Требуют внимания: ${groups.warnings.length}`,
    decision && app.decision
      ? `РЕШЕНИЕ СПЕЦИАЛИСТА: ${decision.label}${app.decision.comment ? ` — ${app.decision.comment}` : ""} (${formatDateTime(app.decision.decidedAt)})`
      : "РЕШЕНИЕ СПЕЦИАЛИСТА: не принято",
    "",
    `КОМПЛЕКТНОСТЬ (обязательные): ${completeness.present} / ${completeness.total}`,
    ...completeness.rows.map(
      (r) => `  [${ROW_MARK[r.status]}] ${typeTitle(r.type)}${ROW_NOTE[r.status]}${r.condition ? ` (${r.condition})` : ""}`,
    ),
    "",
    "ДОКУМЕНТЫ ПАКЕТА:",
    ...(app.documents.length
      ? app.documents.map((d) => `  - ${d.filename}: ${typeTitle(d.type ?? d.detectedType)}${d.typeSource === "SPECIALIST" ? " (тип указан специалистом)" : ""}`)
      : ["  (нет документов)"]),
    "",
    "ЗАМЕЧАНИЯ:",
    ...(report.findings.length ? report.findings.map(findingLine) : ["  (нет замечаний)"]),
  ];
  return lines.filter((l): l is string => l !== null).join("\n") + "\n";
}

export function downloadText(filename: string, content: string) {
  // BOM, чтобы «Блокнот» в Windows открыл кириллицу без кракозябр
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
