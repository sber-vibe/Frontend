import { vi } from "vitest";

/** Мок next/navigation: vi.mock("next/navigation", () => import("@/test/navigation")). */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const useRouter = () => router;
export const usePathname = () => "/checks";
export const useParams = () => ({ id: "app-1" });
export const useSearchParams = () => new URLSearchParams();
export const redirect = vi.fn();
