import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProgramsEditor, validateProgram } from "./ProgramsEditor";
import { RulesEditor } from "./RulesEditor";
import { changedFields, JournalList } from "@/components/journal/JournalList";
import { AttributesPanel, relevantAttributes } from "@/components/package/AttributesPanel";
import { ToastProvider } from "@/components/ui/Toast";
import AdminPage from "@/app/(workspace)/admin/page";
import WorkspaceLayout from "@/app/(workspace)/layout";
import { ApiError } from "@/lib/api";
import { hasRole, homePath } from "@/lib/auth";
import { KNOWN_TYPES } from "@/lib/documentTypes";
import { parseParam, toInput } from "@/lib/ruleParams";
import { jsonResponse, makeApplication } from "@/test/fixtures";
import { mockApi } from "@/test/mockApi";
import { renderWithProviders } from "@/test/render";
import type { ApplicationAttribute, Program, Rule } from "@/lib/types";

vi.mock("next/navigation", () => import("@/test/navigation"));

const CERT: ApplicationAttribute = { code: "requiresCertification", name: "Продукция подлежит сертификации" };

const INNOVATION: Program = {
  code: "INNOVATION",
  name: "Инновационный проект",
  active: true,
  documents: [
    { type: "APPLICATION", requirement: "REQUIRED" },
    {
      type: "CONFORMITY_CERTIFICATE",
      requirement: "CONDITIONAL",
      condition: "если продукция подлежит сертификации",
      conditionAttribute: "requiresCertification",
    },
  ],
};

const SHARE: Rule = {
  code: "OWN_FUNDS_SHARE",
  name: "Доля собственных средств",
  enabled: true,
  severity: "ERROR",
  params: { minOwnFundsShare: 0.5 },
};

describe("ADM-07: доступ по ролям, отказ по умолчанию", () => {
  it("без сессии или без ролей — нет ролей", () => {
    expect(hasRole(null, "specialist")).toBe(false);
    expect(hasRole({ name: "x", mode: "oidc" }, "specialist")).toBe(false);
    expect(hasRole({ name: "x", mode: "oidc", roles: ["admin"] }, "specialist")).toBe(false);
    expect(homePath({ name: "x", mode: "oidc", roles: ["admin"] })).toBe("/admin");
    expect(homePath({ name: "x", mode: "oidc", roles: ["specialist", "admin"] })).toBe("/checks");
  });

  it("вошедший без рабочей роли не видит рабочих экранов", async () => {
    renderWithProviders(
      <WorkspaceLayout>
        <p>список заявок</p>
      </WorkspaceLayout>,
      { roles: [] },
    );
    expect(await screen.findByText("Нет доступа к рабочему месту")).toBeInTheDocument();
    expect(screen.queryByText("список заявок")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  });

  it("администратор без роли специалиста не открывает заявки", async () => {
    renderWithProviders(
      <WorkspaceLayout>
        <p>список заявок</p>
      </WorkspaceLayout>,
      { roles: ["admin"] },
    );
    expect(await screen.findByText("Нужна роль специалиста")).toBeInTheDocument();
    expect(screen.queryByText("список заявок")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Новая заявка" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Администрирование" })).toBeInTheDocument();
  });

  it("старая сессия без ролей не даёт доступа", async () => {
    sessionStorage.setItem("subsidy.session", JSON.stringify({ name: "Анна", mode: "demo" }));
    renderWithProviders(
      <WorkspaceLayout>
        <p>список заявок</p>
      </WorkspaceLayout>,
      { user: null },
    );
    expect(await screen.findByText("Нет доступа к рабочему месту")).toBeInTheDocument();
  });
});

describe("ADM-04: параметры правил", () => {
  const percent = { kind: "percent" as const, min: 0, max: 100 };

  it("доля показывается в процентах и сохраняется долей; пустое не становится 0", () => {
    expect(toInput(0.5, percent)).toBe("50");
    expect(toInput(0.55, percent)).toBe("55");
    expect(parseParam("60", percent)).toEqual({ ok: true, value: 0.6 });
    expect(parseParam("12,5", percent)).toEqual({ ok: true, value: 0.125 });
    expect(parseParam("", percent)).toEqual({ ok: false, error: "Укажите значение" });
    expect(parseParam("101", percent)).toMatchObject({ ok: false });
    expect(parseParam("-1", percent)).toMatchObject({ ok: false });
    expect(parseParam("abc", percent)).toEqual({ ok: false, error: "Введите число" });
  });

  it("целые, деньги и списки проверяются по своим правилам", () => {
    expect(parseParam("2.5", { kind: "integer", min: 0 })).toEqual({ ok: false, error: "Введите целое число" });
    expect(parseParam("-5", { kind: "money" })).toMatchObject({ ok: false });
    expect(parseParam("10, 12", { kind: "list", min: 1 })).toEqual({ ok: true, value: [10, 12] });
    expect(parseParam("10, x", { kind: "list" })).toMatchObject({ ok: false });
  });

  it("администратор вводит 60 % — сервер получает 0.6", async () => {
    const onSave = vi.fn(async (r: Rule) => r);
    render(<RulesEditor rules={[SHARE]} onSave={onSave} />);
    const input = screen.getByLabelText("Минимальная доля собственных средств");
    expect(input).toHaveValue("50");
    expect(screen.getByText("Сервер хранит долю 0.5")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "60");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ params: { minOwnFundsShare: 0.6 } })));
  });

  it("пустое и недопустимое значение не сохраняется", async () => {
    const onSave = vi.fn(async (r: Rule) => r);
    render(<RulesEditor rules={[SHARE]} onSave={onSave} />);
    const input = screen.getByLabelText("Минимальная доля собственных средств");
    await userEvent.clear(input);
    expect(screen.getByText("Укажите значение")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    await userEvent.type(input, "101");
    expect(screen.getByText(/Допустимо от 0 до 100/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("берёт описание параметра из схемы сервера", () => {
    render(
      <RulesEditor
        rules={[{ ...SHARE, params: { gimsDays: 30 }, paramSchema: { gimsDays: { kind: "integer", label: "Запас срока ГИМС", unit: "дн.", min: 0 } } }]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Запас срока ГИМС")).toHaveValue("30");
  });

  it("конфликт версий — понятное сообщение без ложного «Сохранено»", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError(409, "Conflict"));
    render(<RulesEditor rules={[{ ...SHARE, version: 3 }]} onSave={onSave} />);
    expect(screen.getByText("Версия 3")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Правило «Доля собственных средств» включено"));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("изменил другой администратор");
    expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
  });
});

describe("ADM-08 и ADM-03: перечни программ", () => {
  it("предлагает только виды документов из справочника сервера", async () => {
    render(<ProgramsEditor programs={[INNOVATION]} types={["APPLICATION", "CONFORMITY_CERTIFICATE", "BANK_STATEMENT"]} attributes={[CERT]} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    expect(screen.getByLabelText("Требование для «Выписка из банка»")).toBeInTheDocument();
    expect(screen.queryByLabelText("Требование для «Гарантийное письмо»")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Новый вид документа")).not.toBeInTheDocument();
  });

  it("условный документ сохраняется с признаком проекта", async () => {
    const onSave = vi.fn(async (p: Program) => p);
    render(<ProgramsEditor programs={[INNOVATION]} types={KNOWN_TYPES} attributes={[CERT, { code: "usesWaterArea", name: "Используется акватория" }]} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    await userEvent.selectOptions(screen.getByLabelText("Требование для «Декларация ГИМС»"), "CONDITIONAL");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(screen.getByText("Выберите признак проекта")).toBeInTheDocument();
    expect(screen.getByText("Опишите, когда документ нужен")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText("Признак проекта для «Декларация ГИМС»"), "usesWaterArea");
    await userEvent.type(screen.getByLabelText("Когда нужен «Декларация ГИМС»"), "если используется акватория");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].documents).toContainEqual({
      type: "GIMS_DECLARATION",
      requirement: "CONDITIONAL",
      condition: "если используется акватория",
      conditionAttribute: "usesWaterArea",
    });
  });

  it("проверяет код, название и обязательные документы", () => {
    const errors = validateProgram(
      { code: "INNOVATION", name: " ", documents: [] },
      { isNew: true, takenCodes: ["INNOVATION"], attributes: null },
    );
    expect(errors).toMatchObject({
      code: "Программа с таким кодом уже есть",
      name: "Укажите название",
      documents: "Добавьте хотя бы один обязательный документ",
    });
  });

  it("признаки, от которых зависят условные документы программы", () => {
    expect(relevantAttributes(INNOVATION, [CERT])).toEqual([{ attribute: CERT, documents: ["CONFORMITY_CERTIFICATE"] }]);
    expect(relevantAttributes(undefined, [CERT])).toEqual([]);
  });
});

describe("ADM-03: признак проекта в заявке", () => {
  it("неуказанный признак виден как неопределённость; выбор сохраняется на сервер", async () => {
    const app = { ...makeApplication(), programCode: "INNOVATION", attributes: {} };
    const api = mockApi({
      "GET /programs": [INNOVATION],
      "GET /application-attributes": [CERT],
      "PATCH /applications/app-1": { ...app, attributes: { requiresCertification: true } },
    });
    const onUpdated = vi.fn();
    render(
      <ToastProvider>
        <AttributesPanel app={app} onUpdated={onUpdated} />
      </ToastProvider>,
    );
    const panel = await screen.findByRole("region", { name: "Признаки проекта" });
    expect(within(panel).getByText("Не указан — применимость не определена")).toBeInTheDocument();
    expect(within(panel).getByText(/Нужен: Сертификат соответствия/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByLabelText("Да"));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(JSON.parse(api.calls("PATCH /applications/app-1")[0][1]?.body as string)).toEqual({
      attributes: { requiresCertification: true },
    });
  });

  it("без поддержки на сервере панели нет", async () => {
    mockApi({
      "GET /programs": [INNOVATION],
      "GET /application-attributes": () => new Response("", { status: 404 }),
    });
    render(
      <ToastProvider>
        <AttributesPanel app={{ ...makeApplication(), programCode: "INNOVATION" }} onUpdated={vi.fn()} />
      </ToastProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("region", { name: "Признаки проекта" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Не удалось загрузить признаки/)).not.toBeInTheDocument();
  });
});

describe("ADM-06: журнал", () => {
  it("показывает прежнее и новое значение, объект и версию", () => {
    render(
      <JournalList
        entries={[
          {
            id: "1",
            at: "2026-10-10T09:00:00Z",
            actor: "Иван Админ",
            actorType: "ADMIN",
            action: "RULE_CHANGED",
            message: "Изменено правило «Доля собственных средств»",
            before: { minOwnFundsShare: 0.5, enabled: true },
            after: { minOwnFundsShare: 0.6, enabled: true },
            objectType: "RULE",
            objectId: "OWN_FUNDS_SHARE",
            version: 4,
          },
        ]}
      />,
    );
    const changes = screen.getByRole("list", { name: "Изменения" });
    expect(changes).toHaveTextContent("minOwnFundsShare: 0.5 → 0.6");
    expect(changes).not.toHaveTextContent("enabled");
    expect(screen.getByText(/Правило OWN_FUNDS_SHARE · версия 4/)).toBeInTheDocument();
  });

  it("сравнивает простые значения одной строкой", () => {
    expect(changedFields(false, true)).toEqual([{ field: null, before: "нет", after: "да" }]);
  });

  it("подгружает более ранние записи и фильтрует по действию", async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`,
      at: new Date(Date.UTC(2026, 9, 10, 12, 0, 0) - i * 60000).toISOString(),
      actor: "Система",
      actorType: "SYSTEM",
      action: "CHECK_COMPLETED",
      message: `Проверка ${i}`,
    }));
    const api = mockApi({
      "GET /admin/journal?limit=50": page,
      [`GET /admin/journal?limit=50&before=${encodeURIComponent(page[49].at)}`]: [
        { id: "old", at: "2026-10-01T00:00:00Z", actor: "Система", actorType: "SYSTEM", action: "CHECK_COMPLETED", message: "Самая ранняя" },
      ],
      "GET /admin/journal?limit=50&action=RULE_CHANGED": [],
    });
    const nav = await import("@/test/navigation");
    vi.spyOn(nav, "useSearchParams").mockReturnValue(new URLSearchParams("tab=journal"));
    renderWithProviders(<AdminPage />, { roles: ["admin"] });
    expect(await screen.findByText("Проверка 0")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Показать более ранние" }));
    expect(await screen.findByText("Самая ранняя")).toBeInTheDocument();
    expect(screen.getByText("Показаны все записи.")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Действие"), "RULE_CHANGED");
    expect(await screen.findByText("Записей пока нет")).toBeInTheDocument();
    expect(api.unmatched).toEqual([]);
  });
});

describe("ADM-08: недоступные разделы", () => {
  it("без маршрута на сервере — понятное сообщение без ссылок на документацию", async () => {
    mockApi({
      "GET /admin/programs": () => jsonResponse({ status: 404, detail: "No static resource api/v1/admin/programs." }, 404),
      "GET /document-types": KNOWN_TYPES,
      "GET /application-attributes": () => new Response("", { status: 404 }),
    });
    renderWithProviders(<AdminPage />, { roles: ["admin"] });
    const notice = await screen.findByText(/Настройка программ субсидий пока недоступна/);
    expect(notice).not.toHaveTextContent("API_CONTRACT");
  });

  it("без справочника видов документов перечни не редактируются", async () => {
    mockApi({
      "GET /admin/programs": [INNOVATION],
      "GET /document-types": () => new Response("", { status: 404 }),
      "GET /application-attributes": [CERT],
    });
    renderWithProviders(<AdminPage />, { roles: ["admin"] });
    expect(await screen.findByText(/справочник видов документов пока недоступна/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
  });
});
