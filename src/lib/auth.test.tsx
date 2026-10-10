import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { AuthProvider, useAuth } from "./auth";

const HOUR = 60 * 60 * 1000;

function jwt(claims: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;
}

function storeSession(patch: Record<string, unknown>) {
  sessionStorage.setItem(
    "subsidy.session",
    JSON.stringify({ name: "Анна", mode: "oidc", roles: ["specialist"], accessToken: "old", ...patch }),
  );
}

/** Страница, которая сразу после входа запрашивает данные — как рабочие страницы после перезагрузки. */
function Page() {
  const { session, ready } = useAuth();
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    if (ready && session) void api.programs().then(() => setLoaded("ok"), () => setLoaded("fail"));
  }, [ready, session]);
  if (!ready) return <p>загрузка</p>;
  return <p>{session ? `вошёл ${session.accessToken} ${loaded}` : "нет сессии"}</p>;
}

describe("сессия после обновления страницы", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_OIDC_ISSUER", "http://kc/realms/subsidy");
    vi.stubEnv("NEXT_PUBLIC_OIDC_CLIENT_ID", "subsidy-frontend");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("первые запросы уходят с токеном и не сбрасывают сессию", async () => {
    storeSession({ accessToken: "live", expiresAt: Date.now() + HOUR });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const auth = new Headers(init?.headers).get("Authorization");
      return auth === "Bearer live" ? new Response("[]") : new Response("", { status: 401 });
    });
    render(<AuthProvider><Page /></AuthProvider>);
    expect(await screen.findByText("вошёл live ok")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("истёкший access token продлевает по refresh token, без повторного входа", async () => {
    const fresh = jwt({ realm_access: { roles: ["specialist", "admin"] } });
    storeSession({ expiresAt: Date.now() - 1000, refreshToken: "r1", refreshExpiresAt: Date.now() + HOUR });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/protocol/openid-connect/token")) {
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return new Response(JSON.stringify({ access_token: fresh, expires_in: 900, refresh_token: "r2", refresh_expires_in: 1800 }));
      }
      return new Response("[]");
    });
    render(<AuthProvider><Page /></AuthProvider>);
    expect(await screen.findByText(`вошёл ${fresh} ok`)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sessionStorage.getItem("subsidy.session")!)).toMatchObject({ refreshToken: "r2", roles: ["specialist", "admin"] });
  });

  it("если продлить нельзя — отправляет на вход с пояснением", async () => {
    storeSession({ expiresAt: Date.now() - 1000, refreshToken: "r1", refreshExpiresAt: Date.now() + HOUR });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 400 }));
    render(<AuthProvider><Page /></AuthProvider>);
    expect(await screen.findByText("нет сессии")).toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.getItem("subsidy.session.expired")).toBe("1"));
  });
});
