"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { exchangeCode, getOidcConfig } from "@/lib/oidc";

function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const { completeOidc } = useAuth();
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
        completeOidc(tokens);
        router.replace(returnTo);
      })
      .catch((e: Error) => setError(e.message));
  }, [params, router, completeOidc]);

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
