import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { CreateCheckForm } from "./checks/CreateCheckForm";
import { ApiError } from "@/lib/api";
import { makeApplication } from "@/test/fixtures";

describe("LoginForm", () => {
  it("не пускает без имени и показывает ошибку", async () => {
    const onDemoLogin = vi.fn();
    render(<LoginForm oidcEnabled={false} demoEnabled onDemoLogin={onDemoLogin} onOidcLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Введите имя/);
    expect(onDemoLogin).not.toHaveBeenCalled();
  });

  it("входит в демо-режиме с введённым именем", async () => {
    const onDemoLogin = vi.fn();
    render(<LoginForm oidcEnabled={false} demoEnabled onDemoLogin={onDemoLogin} onOidcLogin={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Имя специалиста"), "  Анна Петрова ");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(onDemoLogin).toHaveBeenCalledWith("Анна Петрова", "specialist");
  });

  it("при настроенном Keycloak предлагает вход через OIDC", async () => {
    const onOidcLogin = vi.fn();
    render(<LoginForm oidcEnabled onDemoLogin={vi.fn()} onOidcLogin={onOidcLogin} />);
    expect(screen.queryByLabelText("Имя специалиста")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Keycloak/ }));
    expect(onOidcLogin).toHaveBeenCalled();
  });

  it("ADM-07: без Keycloak и без режима разработки входа нет и роль не выбрать", () => {
    render(<LoginForm oidcEnabled={false} onDemoLogin={vi.fn()} onOidcLogin={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Вход не настроен");
    expect(screen.queryByLabelText("Роль")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти" })).not.toBeInTheDocument();
  });
});

describe("CreateCheckForm", () => {
  const programs = [
    { code: "INNOVATION", name: "Инновационный проект", documents: [{ type: "APPLICATION", requirement: "REQUIRED" as const }] },
  ];

  it("не просит вводить организацию, ИНН и сумму — их извлечёт сервер", () => {
    render(<CreateCheckForm onSubmit={vi.fn()} onCreated={vi.fn()} programs={programs} />);
    expect(screen.queryByLabelText("Организация")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ИНН")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Запрашиваемая сумма")).not.toBeInTheDocument();
    expect(screen.getByText(/распознает их в документах/)).toBeInTheDocument();
  });

  it("по умолчанию оставляет определение программы серверу", async () => {
    const created = makeApplication({ applicantName: null, inn: null, projectName: null, requestedAmount: null });
    const onSubmit = vi.fn().mockResolvedValue(created);
    const onCreated = vi.fn();
    render(<CreateCheckForm onSubmit={onSubmit} onCreated={onCreated} programs={programs} />);
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(onSubmit).toHaveBeenCalledWith({ programCode: null });
  });

  it("отправляет выбранную программу и показывает её перечень документов", async () => {
    const onSubmit = vi.fn().mockResolvedValue(makeApplication());
    render(<CreateCheckForm onSubmit={onSubmit} onCreated={vi.fn()} programs={programs} />);
    await userEvent.selectOptions(screen.getByLabelText("Программа субсидии"), "INNOVATION");
    expect(screen.getByText("Документы программы")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ programCode: "INNOVATION" }));
  });

  it("без перечня программ не даёт создать заявку и предлагает повторить запрос", async () => {
    const onRetry = vi.fn();
    render(<CreateCheckForm onSubmit={vi.fn()} onCreated={vi.fn()} programs={null} onRetryPrograms={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Создать заявку сейчас нельзя/);
    expect(screen.queryByText(/определит backend/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("показывает ошибку сервера и позволяет повторить", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, "Достигнут лимит проверок"));
    render(<CreateCheckForm onSubmit={onSubmit} onCreated={vi.fn()} programs={programs} />);
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    expect(await screen.findByText("Достигнут лимит проверок")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать/ })).toBeEnabled();
  });
});
