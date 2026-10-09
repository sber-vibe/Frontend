import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge, Button, ProgressRing, TextField } from "./index";
import { ConfirmDialog } from "./Dialog";
import { ToastProvider, useToast } from "./Toast";

describe("UI-кит", () => {
  it("кнопка в состоянии загрузки заблокирована", () => {
    render(<Button loading>Сохранить</Button>);
    const btn = screen.getByRole("button", { name: "Сохранить" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("поле связывает подпись и ошибку для скринридеров", () => {
    render(<TextField label="ИНН" error="Укажите ИНН" />);
    const input = screen.getByLabelText("ИНН");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });

  it("бейдж и кольцо прогресса отражают значения", () => {
    render(
      <>
        <Badge tone="danger">Ошибка</Badge>
        <ProgressRing value={7} total={8} caption="документов" />
      </>,
    );
    expect(screen.getByText("Ошибка").closest("[data-tone]")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByRole("img", { name: "7 из 8 документов" })).toHaveTextContent("7/8");
  });

  it("диалог закрывается по Escape и подтверждает действие", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Удалить?" confirmLabel="Да" onClose={onClose} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Да" }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("тост показывается и закрывается", async () => {
    function Demo() {
      const toast = useToast();
      return <button onClick={() => toast.error("Ошибка сети", "Повторите позже")}>show</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText("show"));
    expect(screen.getByRole("alert")).toHaveTextContent("Ошибка сетиПовторите позже");
    await userEvent.click(screen.getByRole("button", { name: "Закрыть уведомление" }));
    await vi.waitFor(() => expect(screen.queryByText("Ошибка сети")).not.toBeInTheDocument());
  });
});
