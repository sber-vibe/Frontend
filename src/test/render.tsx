import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/Toast";

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** Мок next/navigation — подключается в тестах через vi.mock("next/navigation", () => navigationMock). */
export const navigationMock = {
  useRouter: () => router,
  usePathname: () => "/checks",
  useParams: () => ({ id: "app-1" }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
};

export function renderWithProviders(ui: ReactElement, { user = "Анна Петрова" }: { user?: string | null } = {}) {
  if (user) sessionStorage.setItem("subsidy.session", JSON.stringify({ name: user, mode: "demo" }));
  return render(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}
