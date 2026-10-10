import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollingNotice } from "@/components/PollingNotice";
import { ApiError } from "./api";
import { config } from "./config";
import { MAX_POLL_FAILURES, usePolling } from "./usePolling";

function Harness({ load, onData }: { load: () => Promise<number>; onData: (n: number) => void }) {
  const polling = usePolling(true, load, onData);
  return <PollingNotice polling={polling} />;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("FE-06: опрос сервера при ошибках", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("показывает сбой связи, повторяет и после серии ошибок останавливается с кнопкой «Обновить»", async () => {
    const load = vi.fn().mockRejectedValue(new ApiError(0, "Нет связи с сервером"));
    const onData = vi.fn();
    render(<Harness load={load} onData={onData} />);

    await advance(config.pollInterval);
    expect(screen.getByRole("status")).toHaveTextContent("Не удаётся обновить данные: Нет связи с сервером");
    expect(screen.getByRole("status")).toHaveTextContent(`попытка 1 из ${MAX_POLL_FAILURES}`);

    await advance(config.pollInterval * 4 * MAX_POLL_FAILURES);
    expect(load).toHaveBeenCalledTimes(MAX_POLL_FAILURES);
    expect(screen.getByRole("alert")).toHaveTextContent("Обновление остановлено");

    load.mockResolvedValue(7);
    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Обновить" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("при отказе в доступе сразу прекращает опрос", async () => {
    const load = vi.fn().mockRejectedValue(new ApiError(401, "Требуется вход в систему"));
    render(<Harness load={load} onData={vi.fn()} />);
    await advance(config.pollInterval * 10);
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Требуется вход в систему");
  });

  it("после восстановления связи убирает предупреждение и отдаёт данные", async () => {
    const load = vi.fn().mockRejectedValueOnce(new ApiError(503, "Сервер проверки недоступен")).mockResolvedValue(42);
    const onData = vi.fn();
    render(<Harness load={load} onData={onData} />);
    await advance(config.pollInterval);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await advance(config.pollInterval * 2);
    expect(onData).toHaveBeenCalledWith(42);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
