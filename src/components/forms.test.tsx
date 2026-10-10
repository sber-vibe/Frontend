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
    render(<LoginForm oidcEnabled={false} onDemoLogin={onDemoLogin} onOidcLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Введите имя/);
    expect(onDemoLogin).not.toHaveBeenCalled();
  });

  it("входит в демо-режиме с введённым именем", async () => {
    const onDemoLogin = vi.fn();
    render(<LoginForm oidcEnabled={false} onDemoLogin={onDemoLogin} onOidcLogin={vi.fn()} />);
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
});

describe("CreateCheckForm", () => {
  async function fill(values: Partial<Record<string, string>>) {
    const map: Record<string, string> = {
      org: "Организация",
      inn: "ИНН",
      amount: "Запрашиваемая сумма",
      project: "Проект / название субсидии",
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) await userEvent.type(screen.getByLabelText(map[key]), value);
    }
  }

  it("показывает ошибки валидации и не отправляет пустую форму", async () => {
    const onSubmit = vi.fn();
    render(<CreateCheckForm onSubmit={onSubmit} onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining(["Укажите организацию", "Укажите ИНН", "Укажите сумму", "Укажите название проекта или субсидии"]),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ИНН")).toHaveAttribute("aria-invalid", "true");
  });

  it("в поле ИНН принимает только цифры, не длиннее 12", async () => {
    render(<CreateCheckForm onSubmit={vi.fn()} onCreated={vi.fn()} />);
    await fill({ inn: "61a6-1234 5678999" });
    expect(screen.getByLabelText("ИНН")).toHaveValue("616123456789");
  });

  it("отправляет корректные данные и сообщает о создании", async () => {
    const created = makeApplication();
    const onSubmit = vi.fn().mockResolvedValue(created);
    const onCreated = vi.fn();
    render(<CreateCheckForm onSubmit={onSubmit} onCreated={onCreated} />);
    await fill({ org: "ООО Ромашка", inn: "6161234567", amount: "850 000,50", project: "Цифровая платформа" });
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(onSubmit).toHaveBeenCalledWith({
      applicantName: "ООО Ромашка",
      inn: "6161234567",
      projectName: "Цифровая платформа",
      requestedAmount: 850000.5,
      programCode: null,
    });
  });

  it("исправление поля после ошибки сразу снимает подсветку", async () => {
    render(<CreateCheckForm onSubmit={vi.fn()} onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    await fill({ inn: "6161234567" });
    expect(screen.getByLabelText("ИНН")).not.toHaveAttribute("aria-invalid");
  });

  it("показывает ошибку сервера и позволяет повторить", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, "Достигнут лимит проверок"));
    render(<CreateCheckForm onSubmit={onSubmit} onCreated={vi.fn()} />);
    await fill({ org: "ООО", inn: "6161234567", amount: "100", project: "П" });
    await userEvent.click(screen.getByRole("button", { name: /Создать/ }));
    expect(await screen.findByText("Достигнут лимит проверок")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать/ })).toBeEnabled();
  });
});
