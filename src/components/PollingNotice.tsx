"use client";

import { MAX_POLL_FAILURES, type PollingState } from "@/lib/usePolling";
import { Button, Icon } from "@/components/ui";
import s from "./PollingNotice.module.scss";

/** Состояние фонового обновления: показываем, если связь с сервером пропала, и даём повторить. */
export function PollingNotice({ polling }: { polling: PollingState }) {
  if (polling.failures === 0) return null;
  if (!polling.stopped) {
    return (
      <div className={s.notice} data-tone="warning" role="status" aria-live="polite">
        <Icon name="alert" size={18} />
        <span>
          Не удаётся обновить данные: {polling.lastError}. Повторяем автоматически (попытка {polling.failures} из {MAX_POLL_FAILURES}).
          Показаны последние полученные результаты.
        </span>
      </div>
    );
  }
  return (
    <div className={s.notice} data-tone="danger" role="alert">
      <Icon name="error" size={18} />
      <span>Обновление остановлено: {polling.lastError}. Результаты на экране могут быть устаревшими.</span>
      <Button size="sm" variant="outline" icon="refresh" onClick={polling.retry}>
        Обновить
      </Button>
    </div>
  );
}
