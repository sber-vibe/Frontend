import { vi } from "vitest";
import { jsonResponse } from "./fixtures";

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

/**
 * Мок fetch с маршрутами вида "GET /applications/app-1".
 * Неописанный маршрут возвращает 404 и попадает в unmatched — тест это увидит.
 */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const unmatched: string[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input).replace("/api/v1", "");
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const route = routes[key];
    if (route === undefined) {
      unmatched.push(key);
      return new Response(JSON.stringify({ status: 404, detail: "Not mocked" }), { status: 404 });
    }
    return typeof route === "function" ? (route as Handler)(init, url) : jsonResponse(route);
  });
  const calls = (key: string) =>
    spy.mock.calls.filter(([input, init]) => `${(init?.method ?? "GET").toUpperCase()} ${String(input).replace("/api/v1", "")}` === key);
  return { spy, unmatched, calls };
}
