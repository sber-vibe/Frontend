"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError, JOURNAL_PAGE } from "@/lib/api";
import { hasRole, useAuth } from "@/lib/auth";
import { errorMessage, useAsync } from "@/lib/useAsync";
import type { JournalEntry, Program, Rule } from "@/lib/types";
import { ProgramsEditor } from "@/components/admin/ProgramsEditor";
import { RulesEditor } from "@/components/admin/RulesEditor";
import { actionLabel, JournalList } from "@/components/journal/JournalList";
import { Button, EmptyState, ErrorState, Icon, SelectField, Skeleton } from "@/components/ui";
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

/** Раздел ещё не готов на сервере: ничего не показываем как настроенное и не даём «сохранить». */
function Unsupported({ what }: { what: string }) {
  return (
    <p className={s.notice} role="status">
      <Icon name="info" size={18} /> {what} пока недоступна: сервер не поддерживает этот раздел. Изменения здесь не сохраняются —
      обратитесь к разработчикам backend.
    </p>
  );
}

function ProgramsTab() {
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useAsync(
    () =>
      Promise.all([
        optional(api.admin.programs),
        optional(api.documentTypes),
        optional(api.applicationAttributes),
      ]),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton height={200} radius={20} />;
  if (!data) return null;
  const [programs, types, attributes] = data;
  if (programs.unsupported) return <Unsupported what="Настройка программ субсидий" />;
  if (types.unsupported) return <Unsupported what="Настройка перечней: справочник видов документов" />;

  const save = async (program: Program, isNew: boolean) => {
    const saved = isNew ? await api.admin.createProgram(program) : await api.admin.saveProgram(program);
    mutate(([p, t, a]) => {
      const list = p.data ?? [];
      const next = isNew ? [...list, saved] : list.map((x) => (x.code === saved.code ? saved : x));
      return [{ data: next, unsupported: false }, t, a];
    });
    toast.success(isNew ? "Программа создана" : "Программа сохранена", "Перечень применяется к следующим проверкам");
    return saved;
  };

  return <ProgramsEditor programs={programs.data} types={types.data} attributes={attributes.data} onSave={save} />;
}

function RulesTab() {
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useAsync(() => optional(api.admin.rules), []);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton height={200} radius={20} />;
  if (!data) return null;
  if (data.unsupported) return <Unsupported what="Настройка правил проверки" />;

  const save = async (rule: Rule) => {
    const saved = await api.admin.saveRule(rule);
    mutate((r) => ({ data: (r.data ?? []).map((x) => (x.code === saved.code ? saved : x)), unsupported: false }));
    toast.success("Правило сохранено", "Следующие проверки используют новую версию параметров");
    return saved;
  };

  return <RulesEditor rules={data.data} onSave={save} />;
}

/** Действия, по которым можно отфильтровать общий журнал. */
const JOURNAL_ACTIONS = [
  "PROGRAM_CHANGED",
  "RULE_CHANGED",
  "CHECK_COMPLETED",
  "DECISION_MADE",
  "DOCUMENT_TYPE_CHANGED",
  "FIELD_CHANGED",
  "PROCESSING_FAILED",
  "ACCESS_DENIED",
];

function JournalTab() {
  const [action, setAction] = useState("");
  const [older, setOlder] = useState<JournalEntry[]>([]);
  const [more, setMore] = useState<{ loading: boolean; error: string | null; done: boolean }>({
    loading: false,
    error: null,
    done: false,
  });
  const { data, error, loading, reload } = useAsync(() => optional(() => api.admin.journal({ action: action || undefined })), [action]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton height={200} radius={20} />;
  if (!data) return null;
  if (data.unsupported) return <Unsupported what="Общий журнал действий" />;

  const entries = [...data.data, ...older];
  // сервер отдаёт страницу; полная страница — значит, могут быть записи раньше
  const hasMore = !more.done && data.data.length >= JOURNAL_PAGE;

  const loadMore = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setMore({ loading: true, error: null, done: false });
    try {
      const page = await api.admin.journal({ action: action || undefined, before: last.at });
      setOlder((prev) => [...prev, ...page]);
      setMore({ loading: false, error: null, done: page.length < JOURNAL_PAGE });
    } catch (e) {
      setMore({ loading: false, error: errorMessage(e), done: false });
    }
  };

  return (
    <div>
      <div className={a.filters}>
        <SelectField
          label="Действие"
          value={action}
          onChange={(e) => {
            setOlder([]);
            setMore({ loading: false, error: null, done: false });
            setAction(e.target.value);
          }}
          options={[{ value: "", label: "Все действия" }, ...JOURNAL_ACTIONS.map((x) => ({ value: x, label: actionLabel(x) }))]}
        />
      </div>
      <JournalList entries={entries} showApplication />
      {more.error && (
        <p className={a.error} role="alert">
          <Icon name="alert" size={16} /> Не удалось загрузить более ранние записи: {more.error}
        </p>
      )}
      {(hasMore || older.length > 0) && !more.done && (
        <div className={a.more}>
          <Button variant="outline" onClick={loadMore} loading={more.loading}>
            Показать более ранние
          </Button>
        </div>
      )}
      {more.done && <p className={a.fieldNote}>Показаны все записи.</p>}
    </div>
  );
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
