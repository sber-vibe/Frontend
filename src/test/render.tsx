import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/Toast";

export function renderWithProviders(ui: ReactElement, { user = "Анна Петрова" }: { user?: string | null } = {}) {
  if (user) sessionStorage.setItem("subsidy.session", JSON.stringify({ name: user, mode: "demo" }));
  return render(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}
