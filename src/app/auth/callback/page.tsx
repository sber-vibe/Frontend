"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { exchangeCode, getOidcConfig, LoginExpiredError } from "@/lib/oidc";

/** Флаг вкладки: автоматический повтор входа делаем один раз, чтобы не зациклиться. */
const RETRY_KEY = "subsidy.oidc.retried";

function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const { completeOidc, loginOidc } = useAuth();
  const [error, setError] = useState<string>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const cfg = getOidcConfig();
    const code = params.get("code");
    const state = params.get("state");
    if (!cfg || !code || !state) {
      setError(params.get("error_description") ?? "Некорректный ответ сервера авторизации");
      return;
    }
    exchangeCode(cfg, code, state)
      .then(({ tokens, returnTo }) => {
        sessionStorage.removeItem(RETRY_KEY);
        completeOidc(tokens);
        router.replace(returnTo);
      })
      .catch((e: Error) => {
        // Например, ссылку из письма открыли в другом браузере. Начинаем вход заново:
        // если сессия Keycloak уже есть (почта только что подтверждена), он вернёт сюда без пароля.
        if (e instanceof LoginExpiredError && !sessionStorage.getItem(RETRY_KEY)) {
          sessionStorage.setItem(RETRY_KEY, "1");
          void loginOidc().catch(() => setError(e.message));
          return;
        }
        sessionStorage.removeItem(RETRY_KEY);
        setError(e.message);
      });
  }, [params, router, completeOidc, loginOidc]);

  return (
    <main className="container" style={{ paddingTop: 80, maxWidth: 560 }}>
      {error ? (
        <EmptyState
          icon="alert"
          title="Вход не выполнен"
          text={error}
          action={<Button onClick={() => router.replace("/login")}>Вернуться ко входу</Button>}
        />
      ) : (
        <EmptyState icon="shield" title="Выполняем вход…" action={<Spinner label="Выполняем вход" />} />
      )}
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
