import { describe, expect, it } from "vitest";
import {
  fileExtension,
  formatFileSize,
  formatMoney,
  formatPercent,
  formatRelativeDay,
  pluralize,
} from "./format";
import { parseAmount, toCreateApplication, validateCreateCheck, validateFile } from "./validation";
import { fieldLabel, selectableTypes, typeShort, typeTitle } from "./documentTypes";
import {
  completenessRows,
  confidenceTone,
  documentTone,
  findingSeverity,
  groupFindings,
  matchesFilter,
  matchesSearch,
  needsConfirmation,
  reportStatusView,
} from "./presentation";
import { makeApplication, makeDocument, makeReport } from "@/test/fixtures";

describe("format", () => {
  it("форматирует деньги в рублях", () => {
    expect(formatMoney(850000)).toBe("850 000 ₽");
    expect(formatMoney("1500.5")).toBe("1 500,5 ₽");
    expect(formatMoney(null)).toBe("—");
  });

  it("форматирует размер файла, проценты и окончания", () => {
    expect(formatFileSize(512)).toBe("512 Б");
    expect(formatFileSize(2048)).toBe("2,0 КБ");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3,0 МБ");
    expect(formatPercent(0.934)).toBe("93%");
    expect(formatPercent(undefined)).toBe("—");
    expect(pluralize(1, ["документ", "документа", "документов"])).toBe("документ");
    expect(pluralize(3, ["документ", "документа", "документов"])).toBe("документа");
    expect(pluralize(11, ["документ", "документа", "документов"])).toBe("документов");
    expect(pluralize(25, ["документ", "документа", "документов"])).toBe("документов");
  });

  it("показывает «Сегодня» и «Вчера»", () => {
    const now = new Date(2026, 9, 9, 15, 0);
    expect(formatRelativeDay(new Date(2026, 9, 9, 1, 0).toISOString(), now)).toBe("Сегодня");
    expect(formatRelativeDay(new Date(2026, 9, 8, 23, 0).toISOString(), now)).toBe("Вчера");
    expect(formatRelativeDay("bad", now)).toBe("—");
  });

  it("определяет расширение файла", () => {
    expect(fileExtension("Scan.JPEG")).toBe("jpeg");
    expect(fileExtension("noext")).toBe("");
  });
});

describe("validation", () => {
  const valid = { applicantName: "ООО Ромашка", inn: "6161234567", projectName: "Проект", requestedAmount: "850 000" };

  it("пропускает корректные данные", () => {
    expect(validateCreateCheck(valid)).toEqual({});
    expect(toCreateApplication({ ...valid, applicantName: "  ООО  " })).toEqual({
      applicantName: "ООО",
      inn: "6161234567",
      projectName: "Проект",
      requestedAmount: 850000,
    });
  });

  it("проверяет ИНН: только цифры, 10 или 12 знаков", () => {
    expect(validateCreateCheck({ ...valid, inn: "" }).inn).toBe("Укажите ИНН");
    expect(validateCreateCheck({ ...valid, inn: "61612a4567" }).inn).toMatch(/только из цифр/);
    expect(validateCreateCheck({ ...valid, inn: "12345" }).inn).toMatch(/10/);
    expect(validateCreateCheck({ ...valid, inn: "123456789012" }).inn).toBeUndefined();
  });

  it("проверяет сумму и обязательные поля", () => {
    const errors = validateCreateCheck({ applicantName: " ", inn: "6161234567", projectName: "", requestedAmount: "0" });
    expect(errors.applicantName).toBeDefined();
    expect(errors.projectName).toBeDefined();
    expect(errors.requestedAmount).toBe("Сумма должна быть больше нуля");
    expect(validateCreateCheck({ ...valid, requestedAmount: "abc" }).requestedAmount).toMatch(/число/);
    expect(validateCreateCheck({ ...valid, applicantName: "x".repeat(201) }).applicantName).toMatch(/200/);
  });

  it("разбирает сумму с пробелами, запятой и знаком рубля", () => {
    expect(parseAmount("1 250 000,50 ₽")).toBe(1250000.5);
    expect(parseAmount("12.345")).toBeNaN();
    expect(parseAmount("-5")).toBeNaN();
  });

  it("проверяет файл перед загрузкой", () => {
    expect(validateFile(new File(["x"], "a.pdf"))).toBeNull();
    expect(validateFile(new File(["x"], "a.exe"))).toMatch(/Формат/);
    expect(validateFile(new File([], "a.pdf"))).toBe("Файл пустой");
    const big = new File(["x"], "big.png");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    expect(validateFile(big)).toMatch(/10 МБ/);
  });
});

describe("documentTypes", () => {
  it("локализует известные коды и не ломается на неизвестных", () => {
    expect(typeShort("REGISTRATION_EXTRACT")).toBe("Выписка ЕГРЮЛ");
    expect(typeTitle("NEW_SERVER_TYPE")).toBe("NEW_SERVER_TYPE");
    expect(typeTitle(null)).toBe("Тип не определён");
    expect(fieldLabel("inn")).toBe("ИНН");
    expect(fieldLabel("custom_value")).toBe("Custom value");
  });

  it("объединяет типы с сервера и известные без дублей", () => {
    const types = selectableTypes(["APPLICATION", "CONSENT"]);
    expect(types[0]).toBe("APPLICATION");
    expect(types).toContain("CONSENT");
    expect(types.filter((t) => t === "APPLICATION")).toHaveLength(1);
  });
});

describe("presentation", () => {
  it("берёт severity с сервера, иначе по известному коду", () => {
    expect(findingSeverity({ code: "MISSING_DOCUMENT", message: "", documentType: null })).toBe("ERROR");
    expect(findingSeverity({ code: "X", message: "", documentType: null, severity: "OK" })).toBe("OK");
    expect(findingSeverity({ code: "UNKNOWN", message: "", documentType: null })).toBe("WARNING");
  });

  it("группирует замечания", () => {
    const groups = groupFindings([
      ...makeReport().findings,
      { code: "INN_MATCH", message: "ИНН совпадает", documentType: null, severity: "OK" },
      { code: "DUPLICATE_DOCUMENT", message: "", documentType: "APPLICATION" },
    ]);
    expect(groups.errors).toHaveLength(1);
    expect(groups.warnings).toHaveLength(1);
    expect(groups.info).toHaveLength(1);
    expect(groups.passed).toHaveLength(1);
  });

  it("подписывает статус отчёта", () => {
    expect(reportStatusView(null, 0).label).toBe("Ожидает документы");
    expect(reportStatusView(null, 2).label).toBe("Не проверено");
    expect(reportStatusView(makeReport()).tone).toBe("danger");
    expect(reportStatusView(makeReport({ status: "REVIEW_REQUIRED" })).label).toBe("Готов к экспертизе");
    expect(reportStatusView(makeReport({ status: "CUSTOM" })).label).toBe("CUSTOM");
  });

  it("фильтрует и ищет проверки на дашборде", () => {
    const waiting = makeApplication();
    const failed = makeApplication({ report: makeReport() });
    const ok = makeApplication({ report: makeReport({ status: "REVIEW_REQUIRED" }) });
    expect([waiting, failed, ok].filter((a) => matchesFilter(a, "waiting"))).toEqual([waiting]);
    expect([waiting, failed, ok].filter((a) => matchesFilter(a, "errors"))).toEqual([failed]);
    expect([waiting, failed, ok].filter((a) => matchesFilter(a, "review"))).toEqual([ok]);
    expect(matchesSearch(waiting, "ромаш")).toBe(true);
    expect(matchesSearch(waiting, "6161")).toBe(true);
    expect(matchesSearch(waiting, "альфа")).toBe(false);
  });

  it("требует подтверждения при низкой уверенности модели", () => {
    expect(needsConfirmation(makeDocument())).toBe(false);
    expect(needsConfirmation(makeDocument({ type: null, detectedType: "APPLICATION", confidence: 0.63 }))).toBe(true);
    expect(needsConfirmation(makeDocument({ type: null, detectedType: "APPLICATION", confidence: 0.94 }))).toBe(false);
    expect(needsConfirmation(makeDocument({ type: null }))).toBe(true);
    expect(needsConfirmation(makeDocument({ type: null, processingStatus: "PROCESSING" }))).toBe(false);
    expect(confidenceTone(0.94)).toBe("success");
    expect(confidenceTone(0.63)).toBe("warning");
    expect(confidenceTone(0.2)).toBe("danger");
  });

  it("отмечает документ по замечаниям сервера", () => {
    const doc = makeDocument({ type: "COST_ESTIMATE" });
    expect(documentTone(doc, null)).toBe("neutral");
    expect(documentTone(doc, makeReport())).toBe("danger");
    expect(documentTone(makeDocument(), makeReport())).toBe("success");
  });

  it("строит строки комплектности по обязательным типам и замечаниям", () => {
    const result = completenessRows(["APPLICATION", "REGISTRATION_EXTRACT", "COST_ESTIMATE"], makeReport());
    expect(result.present).toBe(2);
    expect(result.total).toBe(3);
    expect(result.missing).toEqual(["COST_ESTIMATE"]);
  });
});
