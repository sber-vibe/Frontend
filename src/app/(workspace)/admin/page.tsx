"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, ApiError } from "@/lib/api";
import { hasRole, useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/useAsync";
import type { Program, Rule } from "@/lib/types";
import { ProgramsEditor } from "@/components/admin/ProgramsEditor";
import { RulesEditor } from "@/components/admin/RulesEditor";
import { JournalList } from "@/components/journal/JournalList";
import { EmptyState, ErrorState, Icon, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import a from "@/components/admin/admin.module.scss";
import s from "@/components/page.module.scss";

type Tab = "programs" | "rules" | "journal";

const TABS: { id: Tab; label: string }[] = [
  { id: "programs", label: "Программы и документы" },
  { id: "rules", label: "Правила проверки" },
  { id: "journal", label: "Журнал" },
];

/** Загружает раздел; «не реализовано на сервере» — отдельное состояние, а не ошибка. */
async function optional<T>(load: () => Promise<T>): Promise<{ data: T; unsupported: false } | { data: null; unsupported: true }> {
  try {
    return { data: await load(), unsupported: false };
  } catch (e) {
    if (e instanceof ApiError && e.isUnsupported) return { data: null, unsupported: true };
    throw e;
  }
}

function Unsupported({ what }: { what: string }) {
  return (
    <p className={s.notice}>
      <Icon name="info" size={18} /> Сервер пока не поддерживает {what}. Контракт API описан в docs/API_CONTRACT.md.
    </p>
  );
}

function ProgramsTab() {
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useAsync(
    () => Promise.all([optional(api.admin.programs), api.documentTypes().catch(() => [] as string[])]),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton height={200} radius={20} />;
  if (!data) return null;
  const [programs, types] = data;
  if (programs.unsupported) return <Unsupported what="настройку программ субсидий" />;

  const save = async (program: Program, isNew: boolean) => {
    const saved = isNew ? await api.admin.createProgram(program) : await api.admin.saveProgram(program);
    mutate(([p, t]) => {
      const list = p.data ?? [];
      const next = isNew ? [...list, saved] : list.map((x) => (x.code === saved.code ? saved : x));
      return [{ data: next, unsupported: false }, t];
    });
    toast.success(isNew ? "Программа создана" : "Программа сохранена", "Перечень применяется к новым проверкам");
    return saved;
  };

  return <ProgramsEditor programs={programs.data} types={types} onSave={save} />;
}

function RulesTab() {
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useAsync(() => optional(api.admin.rules), []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton height={200} radius={20} />;
  if (!data) return null;
  if (data.unsupported) return <Unsupported what="настройку правил проверки" />;

  const save = async (rule: Rule) => {
    const saved = await api.admin.saveRule(rule);
    mutate((r) => ({ data: (r.data ?? []).map((x) => (x.code === saved.code ? saved : x)), unsupported: false }));
    toast.success("Правило сохранено", "Новые проверки используют обновлённые параметры");
    return saved;
  };

  return <RulesEditor rules={data.data} onSave={save} />;
}

function JournalTab() {
  const { data, error, loading, reload } = useAsync(() => optional(() => api.admin.journal()), []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton height={200} radius={20} />;
  if (!data) return null;
  if (data.unsupported) return <Unsupported what="общий журнал действий" />;
  return <JournalList entries={data.data} showApplication />;
}

function AdminContent() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "programs") as Tab;

  if (!hasRole(session, "admin")) {
    return (
      <EmptyState
        icon="shield"
        title="Нужна роль администратора"
        text="Программы субсидий, перечни документов и правила проверки настраивает администратор."
      />
    );
  }

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h1>Администрирование</h1>
          <p>Программы субсидий, перечни документов и правила проверки задаются здесь, а не в коде.</p>
        </div>
      </div>
      <div className={a.tabs} role="tablist" aria-label="Разделы администрирования">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(`/admin?tab=${t.id}`, { scroll: false })}
          >
            {tab === t.id && <motion.span layoutId="admin-tab" className={a.tabPill} />}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {tab === "programs" && <ProgramsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "journal" && <JournalTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminContent />
    </Suspense>
  );
}
