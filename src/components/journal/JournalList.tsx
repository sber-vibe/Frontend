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
              <p className={s.meta}>
                {actor.label}: {e.actor}
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
