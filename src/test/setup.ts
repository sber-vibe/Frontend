import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// В тестах компонентов вход выполняется демо-сессией с заданными ролями.
process.env.NEXT_PUBLIC_DEMO_LOGIN = "true";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sessionStorage.clear();
});

// jsdom не реализует эти API, а компоненты используют их для предпросмотра файлов и анимаций.
if (!URL.createObjectURL) {
  Object.assign(URL, { createObjectURL: () => "blob:mock", revokeObjectURL: () => undefined });
}

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.assign(globalThis, { IntersectionObserver: IO, ResizeObserver: IO });

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
