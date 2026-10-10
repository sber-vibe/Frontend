"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button, ButtonLink, EmptyState, Spinner } from "@/components/ui";
import { hasRole, hasWorkRole, useAuth } from "@/lib/auth";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { session, ready, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !session) router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
  }, [ready, session, router, pathname]);

  if (!ready || !session) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "var(--green)" }}>
        <Spinner label="Загрузка" />
      </div>
    );
  }

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  // Вошёл, но рабочей роли нет (например, только что зарегистрировался): никаких рабочих экранов.
  if (!hasWorkRole(session)) {
    return (
      <main className="container" style={{ paddingTop: 80, maxWidth: 620 }}>
        <EmptyState
          icon="shield"
          title="Нет доступа к рабочему месту"
          text={`Учётная запись «${session.name}» есть, но роль специалиста или администратора ей не назначена. Обратитесь к администратору; после назначения роли войдите снова.`}
          action={
            <Button variant="outline" icon="logout" onClick={signOut}>
              Выйти
            </Button>
          }
        />
      </main>
    );
  }

  const isAdmin = hasRole(session, "admin");
  const isSpecialist = hasRole(session, "specialist");
  // Заявки, документы и решения — только для специалиста; настройки проверяет страница /admin.
  const specialistOnly = !pathname.startsWith("/admin") && !isSpecialist;

  return (
    <>
      <AppHeader userName={session.name} isAdmin={isAdmin} isSpecialist={isSpecialist} onLogout={signOut} />
      <main className="container" style={{ paddingTop: 28, paddingBottom: 64 }}>
        {specialistOnly ? (
          <EmptyState
            icon="shield"
            title="Нужна роль специалиста"
            text="Заявки, документы и решения по субсидиям доступны специалисту. У вас роль администратора: настройка программ и правил."
            action={<ButtonLink href="/admin">Перейти к настройкам</ButtonLink>}
          />
        ) : (
          children
        )}
      </main>
    </>
  );
}
