"use client";

import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatDateTime, pluralize } from "@/lib/format";
import { requisiteText } from "@/lib/requisites";
import { DECISION_VIEW, groupFindings, reportStatusView } from "@/lib/presentation";
import { useAsync } from "@/lib/useAsync";
import { BackLink } from "@/components/BackLink";
import { Badge, ButtonLink, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import s from "@/components/page.module.scss";
import c from "@/components/checks/checks.module.scss";

/** История проверок организации: что проверялось и какие были замечания. */
export default function OrganizationPage() {
  const { inn } = useParams<{ inn: string }>();
  const { data, error, loading, reload } = useAsync(() => api.listApplications(), []);

  const apps = (data ?? [])
    .filter((a) => a.inn === inn)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const name = apps.find((a) => a.applicantName)?.applicantName;

  return (
    <div className={s.page}>
      <BackLink href="/checks">Все проверки</BackLink>
      <div className={s.head}>
        <div>
          <h1>{name ?? "Организация"}</h1>
          <p>
            ИНН {inn}
            {apps.length > 0 && ` · ${apps.length} ${pluralize(apps.length, ["проверка", "проверки", "проверок"])}`}
          </p>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton height={160} radius={20} />
      ) : apps.length === 0 ? (
        <EmptyState icon="folder" title="Проверок нет" text="По этому ИНН ещё не создавалось заявок." />
      ) : (
        <ol style={{ display: "grid", gap: 14, margin: 0, padding: 0, listStyle: "none" }}>
          {apps.map((app, i) => {
            const status = reportStatusView(app.report, app.documents);
            const groups = app.report ? groupFindings(app.report.findings) : null;
            const decision = app.decision ? DECISION_VIEW[app.decision.decision] : null;
            const issues = groups ? [...groups.errors, ...groups.warnings] : [];
            return (
              <motion.li
                key={app.id}
                className={s.card}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.05 }}
              >
                <div className={c.cardTitleRow}>
                  <h2 style={{ margin: 0 }}>{requisiteText(app, "project_name")}</h2>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {decision && <Badge tone={decision.tone}>{decision.label}</Badge>}
                </div>
                <p className={c.cardMeta}>
                  {formatDateTime(app.createdAt)} · {requisiteText(app, "requested_amount")}
                  {app.programName ? ` · ${app.programName}` : ""}
                </p>
                {issues.length > 0 && (
                  <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "var(--text-2)", fontSize: 14 }}>
                    {issues.slice(0, 5).map((f, k) => (
                      <li key={`${f.code}-${k}`}>{f.message}</li>
                    ))}
                    {issues.length > 5 && <li>и ещё {issues.length - 5}</li>}
                  </ul>
                )}
                {app.decision?.comment && (
                  <p style={{ margin: "10px 0 0", fontStyle: "italic", color: "var(--text-2)" }}>«{app.decision.comment}»</p>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <ButtonLink href={`/checks/${app.id}`} size="sm" variant="outline" icon="file">
                    Пакет
                  </ButtonLink>
                  {app.report && (
                    <ButtonLink href={`/checks/${app.id}/result`} size="sm" variant="ghost" icon="list">
                      Итог
                    </ButtonLink>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
