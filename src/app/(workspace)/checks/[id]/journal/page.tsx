"use client";

import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { BackLink } from "@/components/BackLink";
import { JournalList } from "@/components/journal/JournalList";
import { ErrorState, Icon, Skeleton } from "@/components/ui";
import s from "@/components/page.module.scss";

/** Журнал проверки: кто, когда и что сделал с заявкой — сервер, модель и специалист. */
export default function JournalPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAsync(
    async () => {
      const app = await api.getApplication(id);
      try {
        return { app, entries: await api.applicationJournal(id), unsupported: false };
      } catch (e) {
        if (e instanceof ApiError && e.isUnsupported) return { app, entries: [], unsupported: true };
        throw e;
      }
    },
    [id],
  );

  return (
    <div className={s.page}>
      <BackLink href={`/checks/${id}`}>К пакету документов</BackLink>
      <div className={s.head}>
        <div>
          <h1>Журнал проверки</h1>
          {data && (
            <p>
              {data.app.applicantName} · ИНН {data.app.inn}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className={s.card} aria-busy="true">
          <Skeleton height={60} />
        </div>
      ) : data?.unsupported ? (
        <p className={s.notice}>
          <Icon name="info" size={18} /> Сервер пока не отдаёт журнал действий по заявке.
        </p>
      ) : (
        data && <JournalList entries={data.entries} />
      )}
    </div>
  );
}
