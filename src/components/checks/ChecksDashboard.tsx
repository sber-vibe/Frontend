"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DASHBOARD_FILTERS, matchesFilter, matchesSearch, type DashboardFilter } from "@/lib/presentation";
import { useAsync } from "@/lib/useAsync";
import { ButtonLink, EmptyState, ErrorState, Icon, Skeleton } from "@/components/ui";
import { CheckCard } from "./CheckCard";
import s from "./checks.module.scss";

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export function ChecksDashboard() {
  const { session } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.listApplications(), []);
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [query, setQuery] = useState("");

  const apps = useMemo(() => data ?? [], [data]);
  const counts = useMemo(
    () => Object.fromEntries(DASHBOARD_FILTERS.map((f) => [f.id, apps.filter((a) => matchesFilter(a, f.id)).length])),
    [apps],
  ) as Record<DashboardFilter, number>;
  const visible = apps.filter((a) => matchesFilter(a, filter) && matchesSearch(a, query));

  return (
    <div className={s.dashboard}>
      <motion.section
        className={s.hero}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={s.heroText}>
          <p className={s.heroHello}>
            {greeting()}
            {session ? `, ${session.name.split(" ")[0]}` : ""}
          </p>
          <h1>Проверки пакетов документов</h1>
          <p className={s.heroSub}>Загрузите документы организации — сервер определит их тип, извлечёт данные и проверит правила.</p>
        </div>
        <ButtonLink href="/checks/new" icon="plus" size="lg" variant="secondary" className={s.heroButton}>
          Новая проверка
        </ButtonLink>
      </motion.section>

      <section className={s.stats} aria-label="Сводка">
        {DASHBOARD_FILTERS.map((f, i) => (
          <motion.button
            key={f.id}
            type="button"
            className={s.stat}
            data-active={filter === f.id}
            data-kind={f.id}
            onClick={() => setFilter(f.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.4 }}
            whileHover={{ y: -3 }}
            aria-pressed={filter === f.id}
          >
            <span className={s.statValue}>{loading && !data ? "–" : counts[f.id]}</span>
            <span className={s.statLabel}>{f.label}</span>
          </motion.button>
        ))}
      </section>

      <div className={s.toolbar}>
        <div className={s.search}>
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Организация, ИНН или проект"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск проверок"
          />
        </div>
        <div className={s.chips} role="tablist" aria-label="Фильтр по статусу">
          {DASHBOARD_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={s.chip}
              onClick={() => setFilter(f.id)}
            >
              {filter === f.id && <motion.span layoutId="filter-pill" className={s.chipPill} />}
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className={s.list} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={s.skeletonCard}>
              <Skeleton width="45%" height={20} />
              <Skeleton width="70%" />
              <Skeleton width="35%" height={14} />
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon="folder"
          title="Проверок пока нет"
          text="Создайте первую проверку, чтобы загрузить пакет документов организации."
          action={
            <ButtonLink href="/checks/new" icon="plus">
              Создать проверку
            </ButtonLink>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="Ничего не найдено" text="Измените фильтр или поисковый запрос." />
      ) : (
        <motion.ul className={s.list} layout>
          <AnimatePresence initial={true}>
            {visible.map((app, i) => (
              <motion.li
                key={app.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.05 } }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
              >
                <CheckCard app={app} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
