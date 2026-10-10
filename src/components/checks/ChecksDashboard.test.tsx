import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChecksDashboard } from "./ChecksDashboard";
import { jsonResponse, makeApplication, makeDocument, makeReport } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

vi.mock("next/navigation", () => import("@/test/navigation"));

const apps = [
  makeApplication({ id: "a1", applicantName: "ООО Ромашка", documents: [makeDocument()], report: makeReport() }),
  makeApplication({ id: "a2", applicantName: "ООО Альфа", inn: "7700000000", report: makeReport({ status: "REVIEW_REQUIRED", findings: [] }) }),
  makeApplication({ id: "a3", applicantName: "ИП Смирнов", inn: "123456789012" }),
];

describe("ChecksDashboard", () => {
  it("показывает проверки с сервера, статусы и количество замечаний", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(apps));
    renderWithProviders(<ChecksDashboard />);
    const romashka = (await screen.findByText("ООО Ромашка")).closest("a")!;
    expect(romashka).toHaveAttribute("href", "/checks/a1");
    expect(within(romashka).getByText("Есть ошибки", { selector: "span" })).toBeInTheDocument();
    expect(within(romashka).getByText(/1 документ/)).toBeInTheDocument();
    expect(within(romashka).getByTitle("Критические ошибки")).toHaveTextContent("1");
    expect(screen.getByText("Требует внимания", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Ожидает документы")).toBeInTheDocument();
    expect(screen.getByText(/Анна/)).toBeInTheDocument();
  });

  it("фильтрует по статусу и ищет по ИНН", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(apps));
    renderWithProviders(<ChecksDashboard />);
    await screen.findByText("ООО Ромашка");

    await userEvent.click(screen.getByRole("tab", { name: "Есть ошибки" }));
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("ООО Альфа")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "Все" }));
    await userEvent.type(screen.getByLabelText("Поиск проверок"), "7700");
    expect(await screen.findByText("ООО Альфа")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("ИП Смирнов")).not.toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText("Поиск проверок"));
    await userEvent.type(screen.getByLabelText("Поиск проверок"), "несуществующая");
    expect(await screen.findByText("Ничего не найдено")).toBeInTheDocument();
  });

  it("показывает пустое состояние", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    renderWithProviders(<ChecksDashboard />);
    expect(await screen.findByText("Проверок пока нет")).toBeInTheDocument();
  });

  it("показывает ошибку и повторяет запрос", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(apps));
    renderWithProviders(<ChecksDashboard />);
    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("ООО Ромашка")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
