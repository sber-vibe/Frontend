import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportView } from "./ReportView";
import { buildProtocol } from "@/lib/protocol";
import { makeApplication, makeDocument, makeReport } from "@/test/fixtures";
import { mockApi } from "@/test/mockApi";
import { renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => import("@/test/navigation"));

const REQUIRED = ["APPLICATION", "REGISTRATION_EXTRACT", "COST_ESTIMATE"];

const report = makeReport({
  findings: [
    { code: "MISSING_DOCUMENT", message: "Отсутствует обязательный документ", documentType: "COST_ESTIMATE" },
    { code: "INN_MISMATCH", message: "Несоответствие ИНН между документами", documentType: "REGISTRATION_EXTRACT", severity: "WARNING", documentId: "d2" },
    { code: "INN_VALID", message: "ИНН корректен", documentType: null, severity: "OK" },
    { code: "MANUAL_REVIEW_REQUIRED", message: "Проверена только комплектность.", documentType: null },
  ],
});
const app = makeApplication({
  documents: [
    makeDocument({ id: "d1", type: "APPLICATION" }),
    makeDocument({ id: "d2", type: "REGISTRATION_EXTRACT", filename: "scan4.jpg" }),
  ],
  report,
});

describe("ReportView", () => {
  it("показывает итог, счётчики, комплектность и группы замечаний с сервера", async () => {
    mockApi({ "GET /applications/app-1": app, "GET /document-types": REQUIRED });
    renderWithProviders(<ReportView id="app-1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Требует доработки" })).toBeInTheDocument();
    expect(screen.getByText("Критических ошибок").previousSibling).toHaveTextContent("1");
    expect(screen.getByText("Предупреждений").previousSibling).toHaveTextContent("1");
    expect(screen.getByRole("img", { name: "2 из 3 документов" })).toBeInTheDocument();
    expect(screen.getByText("Отсутствует: Смета расходов проекта")).toBeInTheDocument();

    const errors = screen.getByRole("heading", { name: /^Ошибки/ }).closest("section")!;
    expect(within(errors).getByText("Отсутствует обязательный документ")).toBeInTheDocument();
    const warnings = screen.getByRole("heading", { name: /^Предупреждения/ }).closest("section")!;
    // переход к оригиналу документа, к которому относится замечание
    expect(within(warnings).getByRole("link", { name: /Оригинал/ })).toHaveAttribute("href", "/checks/app-1?doc=d2");
    expect(screen.getByRole("heading", { name: /Успешные проверки/ })).toBeInTheDocument();
    expect(screen.getByText("ИНН корректен")).toBeInTheDocument();
  });

  it("перезапускает проверку на сервере", async () => {
    const api = mockApi({
      "GET /applications/app-1": app,
      "GET /document-types": REQUIRED,
      "POST /applications/app-1/check": makeReport({ status: "REVIEW_REQUIRED", findings: [] }),
    });
    renderWithProviders(<ReportView id="app-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Перепроверить" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Готов к экспертизе" })).toBeInTheDocument();
    expect(screen.getByText("Замечаний нет")).toBeInTheDocument();
    expect(api.calls("POST /applications/app-1/check")).toHaveLength(1);
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
});

describe("buildProtocol", () => {
  it("переносит отчёт сервера в текстовый протокол без изменений", () => {
    const text = buildProtocol(app, report, REQUIRED, "Анна Петрова");
    expect(text).toContain("Организация: ООО Ромашка");
    expect(text).toContain("ИТОГ: Требует доработки (INCOMPLETE)");
    expect(text).toContain("КОМПЛЕКТНОСТЬ: 2 / 3");
    expect(text).toContain("[ ] Смета расходов проекта");
    expect(text).toContain("[x] Заявление на предоставление субсидии");
    expect(text).toContain("- Предупреждение [Выписка ЕГРЮЛ]: Несоответствие ИНН между документами (INN_MISMATCH)");
    expect(text).toContain("Специалист: Анна Петрова");
  });
});
