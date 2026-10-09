"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";

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

  return (
    <>
      <AppHeader
        userName={session.name}
        onLogout={() => {
          logout();
          router.replace("/login");
        }}
      />
      <main className="container" style={{ paddingTop: 28, paddingBottom: 64 }}>
        {children}
      </main>
    </>
  );
}
