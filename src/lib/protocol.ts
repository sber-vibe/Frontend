import { typeShort, typeTitle } from "./documentTypes";
import { formatDateTime, formatMoney } from "./format";
import { completenessRows, findingSeverity, groupFindings, reportStatusView } from "./presentation";
import type { ApplicationView, CheckReport, Finding } from "./types";

const SEVERITY_LABEL = { ERROR: "Ошибка", WARNING: "Предупреждение", INFO: "Информация", OK: "Пройдено" } as const;

function findingLine(f: Finding): string {
  const type = f.documentType ? ` [${typeShort(f.documentType)}]` : "";
  return `- ${SEVERITY_LABEL[findingSeverity(f)]}${type}: ${f.message} (${f.code})`;
}

/** Текстовый протокол проверки — дословно по отчёту сервера, для выгрузки и архива. */
export function buildProtocol(app: ApplicationView, report: CheckReport, requiredTypes: string[], specialist?: string): string {
  const status = reportStatusView(report, app.documents.length);
  const groups = groupFindings(report.findings);
  const completeness = completenessRows(requiredTypes, report);
  const lines = [
    "ПРОТОКОЛ ПРОВЕРКИ ПАКЕТА ДОКУМЕНТОВ НА СУБСИДИЮ",
    "",
    `Организация: ${app.applicantName}`,
    `ИНН: ${app.inn}`,
    `Проект: ${app.projectName}`,
    `Запрашиваемая сумма: ${formatMoney(app.requestedAmount)}`,
    `Дата проверки: ${formatDateTime(report.checkedAt)}`,
    specialist ? `Специалист: ${specialist}` : null,
    "",
    `ИТОГ: ${status.label} (${report.status})`,
    `Критических ошибок: ${groups.errors.length}`,
    `Предупреждений: ${groups.warnings.length}`,
    "",
    `КОМПЛЕКТНОСТЬ: ${completeness.present} / ${completeness.total}`,
    ...completeness.rows.map((r) => `  [${r.present ? "x" : " "}] ${typeTitle(r.type)}`),
    "",
    "ДОКУМЕНТЫ ПАКЕТА:",
    ...(app.documents.length
      ? app.documents.map((d) => `  - ${d.filename}: ${typeTitle(d.type ?? d.detectedType)}`)
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
