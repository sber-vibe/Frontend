"use client";

import Link from "next/link";
import { pluralize } from "@/lib/format";
import { expiringDocuments, frequentFindings } from "@/lib/presentation";
import type { ApplicationView } from "@/lib/types";
import { Icon } from "@/components/ui";
import s from "./checks.module.scss";

/**
 * Сводки по потоку заявок: частые замечания и истекающие документы.
 * Считаются по отчётам сервера — фронтенд их только группирует для показа.
 */
export function Insights({ apps }: { apps: ApplicationView[] }) {
  const frequent = frequentFindings(apps);
  const expiring = expiringDocuments(apps).slice(0, 6);
  const checked = apps.filter((a) => a.report).length;
  if (frequent.length === 0 && expiring.length === 0) return null;
  const max = Math.max(1, ...frequent.map((f) => f.applications));

  return (
    <section className={s.insights} aria-label="Сводка по заявкам">
      {frequent.length > 0 && (
        <div className={s.insight}>
          <h2>
            <Icon name="chart" size={18} /> Частые замечания
          </h2>
          <ul>
            {frequent.map((f) => (
              <li key={f.code} title={f.example}>
                <span className={s.insightBar}>
                  <i data-severity={f.severity} style={{ width: `${(f.applications / max) * 100}%` }} />
                  <span>{f.example}</span>
                </span>
                <span className={s.insightCount}>
                  {f.applications} из {checked}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {expiring.length > 0 && (
        <div className={`${s.insight} ${s.expiring}`}>
          <h2>
            <Icon name="clock" size={18} /> Сроки документов
          </h2>
          <ul>
            {expiring.map(({ app, finding }, i) => (
              <li key={`${app.id}-${i}`} data-expired={finding.code === "DOCUMENT_EXPIRED"}>
                <Icon name={finding.code === "DOCUMENT_EXPIRED" ? "error" : "alert"} size={18} />
                <Link href={`/checks/${app.id}${finding.documentId ? `?doc=${finding.documentId}` : ""}`}>
                  <b>{app.applicantName}</b>
                  <small>{finding.message}</small>
                </Link>
              </li>
            ))}
          </ul>
          {expiringDocuments(apps).length > expiring.length && (
            <p className={s.heroSub}>
              и ещё {expiringDocuments(apps).length - expiring.length}{" "}
              {pluralize(expiringDocuments(apps).length - expiring.length, ["документ", "документа", "документов"])}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
