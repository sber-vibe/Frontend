"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Icon, TextField } from "@/components/ui";

interface LoginFormProps {
  oidcEnabled: boolean;
  onDemoLogin: (name: string) => void;
  onOidcLogin: () => Promise<void> | void;
}

export function LoginForm({ oidcEnabled, onDemoLogin, onOidcLogin }: LoginFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [redirecting, setRedirecting] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (value.length < 2) {
      setError("Введите имя специалиста (не короче 2 символов)");
      return;
    }
    setError(undefined);
    onDemoLogin(value);
  };

  if (oidcEnabled) {
    return (
      <div>
        <Button
          size="lg"
          block
          icon="shield"
          loading={redirecting}
          onClick={async () => {
            setRedirecting(true);
            try {
              await onOidcLogin();
            } catch {
              setRedirecting(false);
            }
          }}
        >
          Войти через Keycloak
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <TextField
        label="Имя специалиста"
        placeholder="Например, Анна Петрова"
        autoComplete="name"
        value={name}
        error={error}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError(undefined);
        }}
        autoFocus
      />
      <div style={{ marginTop: 20 }}>
        <Button type="submit" size="lg" block iconRight="arrowRight">
          Войти
        </Button>
      </div>
      <p style={{ marginTop: 16, display: "flex", gap: 8, fontSize: 13, color: "var(--text-3)" }}>
        <Icon name="info" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        Демо-режим: Keycloak не настроен (NEXT_PUBLIC_OIDC_ISSUER), backend работает без авторизации.
      </p>
    </form>
  );
}
