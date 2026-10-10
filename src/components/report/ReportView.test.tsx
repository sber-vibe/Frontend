import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportView } from "./ReportView";
import { buildProtocol } from "@/lib/protocol";
import { jsonResponse, makeApplication, makeDocument, makeReport } from "@/test/fixtures";
import { mockApi } from "@/test/mockApi";
import { renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => import("@/test/navigation"));

const REQUIRED = ["APPLICATION", "BANK_STATEMENT", "COST_JUSTIFICATION"];

const report = makeReport({
  status: "ERRORS",
  findings: [
    { code: "MISSING_DOCUMENT", message: "Отсутствует обоснование затрат", documentType: "COST_JUSTIFICATION" },
    { code: "INN_MISMATCH", message: "ИНН в выписке отличается от заявления", documentType: "BANK_STATEMENT", severity: "WARNING", documentId: "d2" },
    { code: "INN_VALID", message: "ИНН корректен", documentType: null, severity: "OK" },
  ],
});
const app = makeApplication({
  documents: [
    makeDocument({ id: "d1", type: "APPLICATION", processingStatus: "DONE" }),
    makeDocument({ id: "d2", type: "BANK_STATEMENT", filename: "scan4.jpg", processingStatus: "DONE" }),
  ],
  report,
});

describe("ReportView", () => {
  it("показывает итог, счётчики, комплектность и группы замечаний с сервера", async () => {
    mockApi({ "GET /applications/app-1": app, "GET /document-types": REQUIRED });
    renderWithProviders(<ReportView id="app-1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Есть ошибки" })).toBeInTheDocument();
    expect(screen.getByText("Ошибка").previousSibling).toHaveTextContent("1");
    expect(screen.getByText("Требуют внимания", { selector: "span" }).previousSibling).toHaveTextContent("1");
    expect(screen.getByRole("img", { name: "2 из 3 обязательных" })).toBeInTheDocument();
    expect(screen.getByText(/Не хватает: Обоснование затрат/)).toBeInTheDocument();

    const errors = screen.getByRole("heading", { name: /^Ошибки/ }).closest("section")!;
    expect(within(errors).getByText("Отсутствует обоснование затрат")).toBeInTheDocument();
    const warnings = screen.getByRole("heading", { name: /^Требуют внимания/ }).closest("section")!;
    // переход к оригиналу документа, к которому относится замечание
    expect(within(warnings).getByRole("link", { name: /Оригинал/ })).toHaveAttribute("href", "/checks/app-1?doc=d2");
    expect(screen.getByRole("heading", { name: /Пройденные проверки/ })).toBeInTheDocument();
    // технические коды замечаний специалисту не показываются
    expect(screen.queryByText("INN_MISMATCH")).not.toBeInTheDocument();
  });

  it("показывает комплектность сервера: условные и лишние документы, дослать недостающее", async () => {
    const withCompleteness = makeApplication({
      ...app,
      report: makeReport({
        status: "ATTENTION",
        findings: [],
        completeness: [
          { type: "APPLICATION", status: "FOUND", requirement: "REQUIRED", documentIds: ["d1"] },
          { type: "BANK_STATEMENT", status: "MISSING", requirement: "REQUIRED", canUpload: true },
          { type: "CONFORMITY_CERTIFICATE", status: "CONDITIONAL_MISSING", requirement: "CONDITIONAL", condition: "если продукция подлежит сертификации" },
          { type: "GIMS_DECLARATION", status: "EXTRA", requirement: "EXTRA", documentIds: ["d2"] },
        ],
      }),
    });
    mockApi({ "GET /applications/app-1": withCompleteness, "GET /document-types": REQUIRED });
    renderWithProviders(<ReportView id="app-1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Требует внимания" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 из 2 обязательных" })).toBeInTheDocument();
    const list = screen.getByRole("heading", { name: "Комплектность" }).closest("section")!;
    expect(within(list).getByText(/не хватает/)).toBeInTheDocument();
    expect(within(list).getByText(/условно требуется — если продукция подлежит сертификации/)).toBeInTheDocument();
    expect(within(list).getByText(/лишний для программы/)).toBeInTheDocument();
    expect(within(list).getAllByRole("link", { name: /Дослать/ })[0]).toHaveAttribute("href", "/checks/app-1#upload");
  });

  it("перезапускает проверку на сервере", async () => {
    const api = mockApi({
      "GET /applications/app-1": app,
      "GET /document-types": REQUIRED,
      "POST /applications/app-1/check": makeReport({ status: "PASSED", findings: [] }),
    });
    renderWithProviders(<ReportView id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Перепроверить" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Пройдено" })).toBeInTheDocument();
    expect(screen.getByText("Замечаний нет")).toBeInTheDocument();
    expect(api.calls("POST /applications/app-1/check")).toHaveLength(1);
  });

  it("FE-01: не показывает «Пройдено», если по части файлов нет результата обработки", async () => {
    mockApi({
      "GET /applications/app-1": {
        ...app,
        documents: [...app.documents, makeDocument({ id: "d9", filename: "x.pdf" })],
        report: makeReport({ status: "PASSED", findings: [] }),
      },
      "GET /document-types": REQUIRED,
    });
    renderWithProviders(<ReportView id="app-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Результат неполный" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Пройдено" })).not.toBeInTheDocument();
  });

  it("сохраняет решение специалиста; для возврата нужна причина", async () => {
    const decided = { ...app, decision: { decision: "RETURNED" as const, comment: "Дослать обоснование", decidedBy: "Анна", decidedAt: "2026-10-10T09:00:00Z" } };
    const api = mockApi({
      "GET /applications/app-1": app,
      "GET /document-types": REQUIRED,
      "POST /applications/app-1/decision": decided,
    });
    renderWithProviders(<ReportView id="app-1" />);

    await userEvent.click(await screen.findByRole("radio", { name: /Вернуть на доработку/ }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить решение" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Укажите причину");
    expect(api.calls("POST /applications/app-1/decision")).toHaveLength(0);

    await userEvent.type(screen.getByLabelText(/Причина/), "Дослать обоснование");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить решение" }));
    expect(await screen.findByText("Возвращена на доработку")).toBeInTheDocument();
    expect(JSON.parse(String(api.calls("POST /applications/app-1/decision")[0][1]?.body))).toEqual({
      decision: "RETURNED",
      comment: "Дослать обоснование",
    });
  });

  it("сообщает, если сервер ещё не принимает решения", async () => {
    mockApi({
      "GET /applications/app-1": app,
      "GET /document-types": REQUIRED,
      "POST /applications/app-1/decision": () => jsonResponse({ status: 405 }, 405),
    });
    renderWithProviders(<ReportView id="app-1" />);
    await userEvent.click(await screen.findByRole("radio", { name: /Принять заявку/ }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить решение" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер пока не принимает решения по заявкам");
  });

  it("выгружает протокол проверки файлом", async () => {
    mockApi({ "GET /applications/app-1": app, "GET /document-types": REQUIRED });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderWithProviders(<ReportView id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Скачать протокол" }));
    expect(click).toHaveBeenCalled();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("protocol_6161234567_2026-10-09.txt");
  });

  it("предлагает запустить проверку, если отчёта ещё нет", async () => {
    mockApi({ "GET /applications/app-1": { ...app, report: null }, "GET /document-types": REQUIRED });
    renderWithProviders(<ReportView id="app-1" />);
    expect(await screen.findByText("Проверка ещё не запускалась")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Запустить проверку" })).toBeEnabled());
  });

  it("пока файлы обрабатываются в фоне, ждёт результат вместо кнопки проверки", async () => {
    const processing = { ...app, report: null, documents: [makeDocument({ id: "d1", type: null, processingStatus: "CLASSIFYING" as const })] };
    mockApi({ "GET /applications/app-1": processing, "GET /document-types": REQUIRED });
    renderWithProviders(<ReportView id="app-1" />);
    expect(await screen.findByText("Документы обрабатываются")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Запустить проверку" })).not.toBeInTheDocument();
  });
});

describe("buildProtocol", () => {
  it("переносит отчёт сервера в текстовый протокол без изменений", () => {
    const text = buildProtocol({ ...app, programName: "Инновационный проект" }, report, REQUIRED, "Анна Петрова");
    expect(text).toContain("Организация: ООО Ромашка");
    expect(text).toContain("Программа субсидии: Инновационный проект");
    expect(text).toContain("ИТОГ АВТОМАТИЧЕСКОЙ ПРОВЕРКИ: Есть ошибки");
    expect(text).toContain("КОМПЛЕКТНОСТЬ (обязательные): 2 / 3");
    expect(text).toContain("[ ] Обоснование затрат — не хватает");
    expect(text).toContain("[x] Заявление на субсидию");
    expect(text).toContain("- Требует внимания [Выписка из банка]: ИНН в выписке отличается от заявления");
    expect(text).toContain("РЕШЕНИЕ СПЕЦИАЛИСТА: не принято");
    expect(text).toContain("Специалист: Анна Петрова");
    expect(text).not.toContain("INN_MISMATCH");
  });
});
