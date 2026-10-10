"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";
import { Badge, EmptyState, Icon, type IconName } from "@/components/ui";
import s from "./journal.module.scss";

const ACTOR: Record<string, { label: string; icon: IconName }> = {
  SYSTEM: { label: "Система", icon: "sparkle" },
  SPECIALIST: { label: "Специалист", icon: "user" },
  ADMIN: { label: "Администратор", icon: "shield" },
};

/** Подписи действий журнала; неизвестное действие показывается текстом сообщения сервера. */
const ACTION_LABEL: Record<string, string> = {
  APPLICATION_CREATED: "Создана заявка",
  DOCUMENT_UPLOADED: "Принят файл",
  DOCUMENT_DELETED: "Удалён файл",
  DOCUMENT_CLASSIFIED: "Определён тип",
  FIELDS_EXTRACTED: "Извлечены поля",
  DOCUMENT_TYPE_CHANGED: "Тип изменён вручную",
  FIELD_CHANGED: "Поле исправлено",
  PROCESSING_FAILED: "Ошибка обработки",
  MODEL_CALL: "Вызов модели",
  CHECK_COMPLETED: "Проверка выполнена",
  DECISION_MADE: "Принято решение",
  PROGRAM_CHANGED: "Изменена программа",
  RULE_CHANGED: "Изменено правило",
  ACCESS_DENIED: "Отказ в доступе",
};

const OBJECT_LABEL: Record<string, string> = {
  PROGRAM: "Программа",
  RULE: "Правило",
  APPLICATION: "Заявка",
  USER: "Пользователь",
};

/** Значение настройки до/после изменения — коротко и читаемо. */
export function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) return value.map(formatChangeValue).join(", ");
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${formatChangeValue(v)}`)
    .join("; ");
}

/** Поля, которые различаются между прежним и новым значением; для простых значений — одна строка. */
export function changedFields(before: unknown, after: unknown): { field: string | null; before: string; after: string }[] {
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (isObject(before) && isObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return keys
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => ({ field: k, before: formatChangeValue(before[k]), after: formatChangeValue(after[k]) }));
  }
  return [{ field: null, before: formatChangeValue(before), after: formatChangeValue(after) }];
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

interface Props {
  entries: JournalEntry[];
  /** Показывать ссылку на заявку (общий журнал администратора). */
  showApplication?: boolean;
}

export function JournalList({ entries, showApplication }: Props) {
  if (entries.length === 0) {
    return <EmptyState icon="clock" title="Записей пока нет" text="Действия с заявкой и результаты проверок появятся здесь." />;
  }
  return (
    <ol className={s.list}>
      {entries.map((e, i) => {
        const actor = ACTOR[e.actorType ?? ""] ?? { label: "Пользователь", icon: "user" as IconName };
        const failed = e.outcome === "FAILED";
        return (
          <motion.li
            key={e.id}
            className={s.entry}
            data-failed={failed}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.03 }}
          >
            <span className={s.icon} data-actor={e.actorType ?? "USER"}>
              <Icon name={failed ? "error" : actor.icon} size={16} />
            </span>
            <div className={s.body}>
              <div className={s.head}>
                <b>{actionLabel(e.action)}</b>
                {failed && <Badge tone="danger">Отказ</Badge>}
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </div>
              <p className={s.message}>{e.message}</p>
              {e.reason && <p className={s.reason}>Причина: {e.reason}</p>}
              {(e.before !== undefined || e.after !== undefined) && (
                <ul className={s.changes} aria-label="Изменения">
                  {changedFields(e.before, e.after).map((c) => (
                    <li key={c.field ?? "value"}>
                      {c.field && <span className={s.changeField}>{c.field}: </span>}
                      <span className={s.before}>{c.before}</span> → <b>{c.after}</b>
                    </li>
                  ))}
                </ul>
              )}
              <p className={s.meta}>
                {actor.label}: {e.actor}
                {e.objectType && ` · ${OBJECT_LABEL[e.objectType] ?? e.objectType}${e.objectId ? ` ${e.objectId}` : ""}`}
                {e.version != null && ` · версия ${e.version}`}
                {showApplication && e.applicationId && (
                  <>
                    {" · "}
                    <Link href={`/checks/${e.applicationId}${e.documentId ? `?doc=${e.documentId}` : ""}`}>открыть заявку</Link>
                  </>
                )}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
