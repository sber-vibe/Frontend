import { describe, expect, it } from "vitest";
import {
  fileExtension,
  formatFileSize,
  formatMoney,
  formatPercent,
  formatRelativeDay,
  pluralize,
} from "./format";
import { parseAmount, validateFile } from "./validation";
import { applicationTitle, extractionSummary, isRecognized, NOT_RECOGNIZED, requisiteText, requisiteView, requisiteViews } from "./requisites";
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
    expect(reportStatusView(makeReport({ status: "REVIEW_REQUIRED" })).label).toBe("Требует внимания");
    expect(reportStatusView(makeReport({ status: "PASSED" })).label).toBe("Пройдено");
    expect(reportStatusView(makeReport({ status: "ATTENTION" })).tone).toBe("warning");
    expect(reportStatusView(makeReport({ status: "ERRORS" })).label).toBe("Есть ошибки");
    expect(reportStatusView(makeReport({ status: "CUSTOM" })).label).toBe("CUSTOM");
  });

  it("фильтрует и ищет проверки на дашборде", () => {
    const waiting = makeApplication();
    const failed = makeApplication({ report: makeReport() });
    const attention = makeApplication({ report: makeReport({ status: "ATTENTION" }) });
    const ok = makeApplication({
      report: makeReport({ status: "PASSED" }),
      decision: { decision: "ACCEPTED", decidedAt: "2026-10-10T10:00:00Z" },
    });
    const all = [waiting, failed, attention, ok];
    expect(all.filter((a) => matchesFilter(a, "waiting"))).toEqual([waiting]);
    expect(all.filter((a) => matchesFilter(a, "errors"))).toEqual([failed]);
    expect(all.filter((a) => matchesFilter(a, "attention"))).toEqual([attention]);
    expect(all.filter((a) => matchesFilter(a, "passed"))).toEqual([ok]);
    expect(all.filter((a) => matchesFilter(a, "decided"))).toEqual([ok]);
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

describe("requisites", () => {
  const empty = { applicantName: null, inn: null, projectName: null, requestedAmount: null };

  it("пока пакет не загружен или разбирается — значение ещё не извлечено, а не «не распознано»", () => {
    const fresh = makeApplication(empty);
    expect(requisiteView(fresh, "inn").kind).toBe("pending");
    expect(requisiteText(fresh, "inn")).toBe("Появится после загрузки пакета");
    expect(applicationTitle(fresh)).toBe("Новая заявка");

    const processing = makeApplication({ ...empty, documents: [makeDocument({ processingStatus: "EXTRACTING" })] });
    expect(requisiteText(processing, "requested_amount")).toBe("Извлекается из документов…");
  });

  it("после разбора пустое значение — «Не распознано / требуется проверка»", () => {
    const done = makeApplication({ ...empty, documents: [makeDocument({ processingStatus: "DONE" })] });
    expect(requisiteView(done, "inn").kind).toBe("missing");
    expect(requisiteText(done, "inn")).toBe(NOT_RECOGNIZED);
    expect(applicationTitle(done)).toBe("Организация не распознана");
  });

  it("явный NOT_RECOGNIZED с сервера не считается извлечённым, даже со значением", () => {
    const app = makeApplication({
      requisites: [{ name: "inn", value: "123", status: "NOT_RECOGNIZED", documentId: "d1" }],
    });
    expect(requisiteView(app, "inn").kind).toBe("missing");
    expect(isRecognized({ value: "", status: undefined })).toBe(false);
    expect(isRecognized({ value: 0, status: "RECOGNIZED" })).toBe(true);
  });

  it("берёт значение и источник из requisites, форматирует сумму и добавляет дополнительные реквизиты", () => {
    const app = makeApplication({
      ...empty,
      documents: [makeDocument({ id: "d1", processingStatus: "DONE" })],
      requisites: [
        { name: "requested_amount", value: 850000, documentId: "d1", source: "Сумма: 850 000 руб." },
        { name: "kpp", value: "616101001", documentId: "d1" },
      ],
    });
    const amount = requisiteView(app, "requested_amount");
    expect(amount.kind).toBe("value");
    expect(amount.text).toBe("850 000 ₽");
    expect(amount.field?.documentId).toBe("d1");
    expect(requisiteViews(app).map((v) => v.name)).toEqual(["company_name", "inn", "project_name", "requested_amount", "kpp"]);
  });

  it("считает распознанными только непустые поля без NOT_RECOGNIZED", () => {
    expect(
      extractionSummary([
        { name: "inn", value: "6161234567" },
        { name: "kpp", value: null },
        { name: "date", value: "2026-10-01", status: "NOT_RECOGNIZED" },
      ]),
    ).toEqual({ recognized: 1, total: 3 });
  });
});
