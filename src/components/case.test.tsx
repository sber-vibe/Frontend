import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PackageWorkspace } from "./package/PackageWorkspace";
import { CreateCheckForm } from "./checks/CreateCheckForm";
import { ProgramsEditor } from "./admin/ProgramsEditor";
import { RulesEditor } from "./admin/RulesEditor";
import { JournalList } from "./journal/JournalList";
import AdminPage from "@/app/(workspace)/admin/page";
import { ApiError } from "@/lib/api";
import { rolesFromClaims } from "@/lib/auth";
import { jsonResponse, makeApplication, makeDocument } from "@/test/fixtures";
import { mockApi } from "@/test/mockApi";
import { renderWithProviders } from "@/test/render";
import type { Program, Rule } from "@/lib/types";

vi.mock("next/navigation", () => import("@/test/navigation"));

const INNOVATION: Program = {
  code: "INNOVATION",
  name: "Инновационный проект",
  active: true,
  documents: [
    { type: "APPLICATION", requirement: "REQUIRED" },
    { type: "PD_CONSENT", requirement: "REQUIRED" },
    { type: "CONFORMITY_CERTIFICATE", requirement: "CONDITIONAL", condition: "если продукция подлежит сертификации" },
  ],
};

describe("Фоновая обработка пакета", () => {
  const routesFor = (app: ReturnType<typeof makeApplication>) => ({
    "GET /applications/app-1": app,
    "GET /document-types": [],
    "GET /applications/app-1/documents/d1": () => new Response("%PDF"),
    "GET /applications/app-1/documents/d2": () => new Response("%PDF"),
  });

  it("показывает этапы по каждому файлу и обновляет результат по мере готовности", async () => {
    const processing = makeApplication({
      documents: [
        makeDocument({ id: "d1", type: null, filename: "scan_001.pdf", processingStatus: "CLASSIFYING" }),
        makeDocument({ id: "d2", type: "APPLICATION", detectedType: "APPLICATION", confidence: 0.97, processingStatus: "DONE", outcome: "PASSED", typeSource: "MODEL" }),
      ],
    });
    const done = makeApplication({
      documents: [
        makeDocument({ id: "d1", type: "BANK_STATEMENT", detectedType: "BANK_STATEMENT", confidence: 0.91, filename: "scan_001.pdf", processingStatus: "DONE", outcome: "ERRORS" }),
        processing.documents[1],
      ],
    });
    let calls = 0;
    mockApi({ ...routesFor(processing), "GET /applications/app-1": () => jsonResponse(calls++ === 0 ? processing : done) });
    renderWithProviders(<PackageWorkspace id="app-1" />);

    expect(await screen.findByText(/Обрабатывается 1 файл из 2/)).toBeInTheDocument();
    const list = screen.getByRole("navigation", { name: "Документы пакета" });
    expect(within(list).getByText("Определяется…")).toBeInTheDocument();
    expect(within(list).getByText("Определяется тип документа")).toBeInTheDocument();
    // полная шкала этапов — на панели разбора выбранного файла
    await userEvent.click(within(list).getByText("scan_001.pdf"));
    expect(await screen.findByLabelText("Этапы обработки")).toBeInTheDocument();
    expect(within(list).getByText("Пройдено")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Запустить проверку" })).toBeDisabled();

    // сервер закончил обработку — список обновился сам, без перезагрузки страницы
    expect(await within(list).findByText("Выписка из банка", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(within(list).getByText("Есть ошибки")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Обрабатывается/)).not.toBeInTheDocument());
  });

  it("при ошибке модели показывает причину и повторяет обработку", async () => {
    const failed = makeApplication({
      documents: [makeDocument({ id: "d1", type: null, processingStatus: "FAILED", processingError: "Модель не ответила за 60 секунд" })],
    });
    const api = mockApi({
      ...routesFor(failed),
      "POST /applications/app-1/documents/d1/reprocess": makeDocument({ id: "d1", type: null, processingStatus: "PENDING" }),
    });
    renderWithProviders(<PackageWorkspace id="app-1" />);
    expect(await screen.findByText("Модель не ответила за 60 секунд")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Повторить обработку" }));
    await waitFor(() => expect(api.calls("POST /applications/app-1/documents/d1/reprocess")).toHaveLength(1));
    expect(await screen.findByText("Документ отправлен на повторную обработку")).toBeInTheDocument();
  });

  it("отмечает тип, указанный специалистом, и предупреждает о повторном пакете", async () => {
    const app = makeApplication({
      duplicateOf: "app-0",
      programName: "Инновационный проект",
      programDetected: true,
      documents: [
        makeDocument({ id: "d1", type: "GUARANTEE_LETTER", detectedType: "BANK_STATEMENT", typeSource: "SPECIALIST", typeChangedBy: "Анна Петрова", processingStatus: "DONE" }),
      ],
    });
    mockApi(routesFor(app));
    renderWithProviders(<PackageWorkspace id="app-1" />);
    expect(await screen.findByText(/Тип указан специалистом Анна Петрова/)).toBeInTheDocument();
    expect(screen.getByText(/модель предлагала: Выписка из банка/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть предыдущую проверку" })).toHaveAttribute("href", "/checks/app-0");
    expect(screen.getByText(/определена по заявлению/)).toBeInTheDocument();
  });
});

describe("CreateCheckForm: программа субсидии", () => {
  it("показывает перечень документов программы и отправляет её код", async () => {
    const onSubmit = vi.fn().mockResolvedValue(makeApplication());
    render(<CreateCheckForm programs={[INNOVATION]} onSubmit={onSubmit} onCreated={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Программа субсидии"), "INNOVATION");
    expect(screen.getByText("Согласие на обработку персональных данных")).toBeInTheDocument();
    expect(screen.getByText(/условно: если продукция подлежит сертификации/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ programCode: "INNOVATION" }));
  });

  it("без перечня программ с сервера не обещает автоопределение и не создаёт заявку", () => {
    render(<CreateCheckForm programs={null} onSubmit={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByLabelText("Программа субсидии")).not.toBeInTheDocument();
    expect(screen.getByText(/Не удалось получить перечень программ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать/ })).toBeDisabled();
  });

  it("без активных программ просит обратиться к администратору", () => {
    render(<CreateCheckForm programs={[{ ...INNOVATION, active: false }]} onSubmit={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByText(/Нет активных программ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать/ })).toBeDisabled();
  });
});

describe("Администрирование", () => {
  it("меняет перечень документов программы и сохраняет на сервер", async () => {
    const onSave = vi.fn(async (p: Program) => p);
    render(<ProgramsEditor programs={[INNOVATION]} types={[]} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    await userEvent.selectOptions(screen.getByLabelText("Требование для «Гарантийное письмо»"), "REQUIRED");
    await userEvent.selectOptions(screen.getByLabelText("Требование для «Согласие на обработку персональных данных»"), "NONE");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.documents.map((d) => `${d.type}:${d.requirement}`)).toEqual([
      "APPLICATION:REQUIRED",
      "CONFORMITY_CERTIFICATE:CONDITIONAL",
      "GUARANTEE_LETTER:REQUIRED",
    ]);
  });

  it("добавляет новый вид документа в перечень", async () => {
    const onSave = vi.fn(async (p: Program) => p);
    render(<ProgramsEditor programs={[INNOVATION]} types={[]} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    await userEvent.type(screen.getByLabelText("Новый вид документа"), "license");
    await userEvent.click(screen.getByRole("button", { name: "Добавить в перечень" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(onSave.mock.calls[0][0].documents).toContainEqual({ type: "LICENSE", requirement: "REQUIRED", condition: null }));
  });

  it("меняет порог правила без правки кода", async () => {
    const rule: Rule = {
      code: "OWN_FUNDS_SHARE",
      name: "Доля собственных средств",
      enabled: true,
      severity: "ERROR",
      params: { minOwnFundsShare: 0.5 },
    };
    const onSave = vi.fn(async (r: Rule) => r);
    render(<RulesEditor rules={[rule]} onSave={onSave} />);
    const input = screen.getByLabelText("Минимальная доля собственных средств");
    await userEvent.clear(input);
    await userEvent.type(input, "0.6");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ params: { minOwnFundsShare: 0.6 } })));
  });

  it("закрыт для специалиста без роли администратора", async () => {
    mockApi({});
    renderWithProviders(<AdminPage />, { roles: ["specialist"] });
    expect(await screen.findByText("Нужна роль администратора")).toBeInTheDocument();
  });

  it("показывает понятное состояние, если сервер ещё не умеет настройки", async () => {
    // так Spring отвечает на маршрут, которого ещё нет на backend
    mockApi({
      "GET /document-types": [],
      "GET /admin/programs": () => jsonResponse({ status: 404, detail: "No static resource api/v1/admin/programs." }, 404),
    });
    renderWithProviders(<AdminPage />, { roles: ["specialist", "admin"] });
    expect(await screen.findByText(/Сервер пока не поддерживает настройку программ субсидий/)).toBeInTheDocument();
  });
});

describe("Журнал", () => {
  it("показывает кто, когда и что сделал, включая отказы с причиной", () => {
    render(
      <JournalList
        entries={[
          { id: "1", at: "2026-10-10T09:00:00Z", actor: "llm-provider", actorType: "SYSTEM", action: "DOCUMENT_CLASSIFIED", message: "scan_001.pdf → Выписка из банка (0.91)" },
          { id: "2", at: "2026-10-10T09:01:00Z", actor: "Анна Петрова", actorType: "SPECIALIST", action: "DOCUMENT_TYPE_CHANGED", message: "Тип изменён на «Гарантийное письмо»" },
          { id: "3", at: "2026-10-10T09:02:00Z", actor: "llm-provider", actorType: "SYSTEM", action: "PROCESSING_FAILED", message: "Не удалось разобрать 7.pdf", outcome: "FAILED", reason: "Таймаут модели" },
        ]}
      />,
    );
    expect(screen.getByText("Определён тип")).toBeInTheDocument();
    expect(screen.getByText("Специалист: Анна Петрова")).toBeInTheDocument();
    expect(screen.getByText("Причина: Таймаут модели")).toBeInTheDocument();
    expect(screen.getByText("Отказ")).toBeInTheDocument();
  });
});

describe("Служебные функции", () => {
  it("берёт роли из access token Keycloak", () => {
    expect(rolesFromClaims({ realm_access: { roles: ["offline_access", "specialist"] } })).toEqual(["specialist"]);
    expect(rolesFromClaims({ realm_access: { roles: ["admin", "specialist"] } })).toEqual(["specialist", "admin"]);
    expect(rolesFromClaims({})).toEqual([]);
  });

  it("отличает «не реализовано на сервере» от «не найдено»", () => {
    expect(new ApiError(405, "x").isUnsupported).toBe(true);
    expect(new ApiError(404, "x").isUnsupported).toBe(true);
    expect(new ApiError(404, "x", { detail: "No static resource api/v1/programs." }).isUnsupported).toBe(true);
    expect(new ApiError(404, "x", { detail: "Application not found" }).isUnsupported).toBe(false);
    expect(new ApiError(500, "x").isUnsupported).toBe(false);
  });
});
