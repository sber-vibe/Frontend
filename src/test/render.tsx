import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/Toast";

export function renderWithProviders(
  ui: ReactElement,
  { user = "Анна Петрова", roles = ["specialist"] }: { user?: string | null; roles?: string[] } = {},
) {
  if (user) sessionStorage.setItem("subsidy.session", JSON.stringify({ name: user, mode: "demo", roles }));
  return render(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}
