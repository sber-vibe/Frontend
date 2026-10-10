"use client";

import Link from "next/link";
import { formatRelativeDay, pluralize } from "@/lib/format";
import { DECISION_VIEW, groupFindings, isProcessing, reportStatusView } from "@/lib/presentation";
import { applicationTitle, requisiteView } from "@/lib/requisites";
import type { ApplicationView } from "@/lib/types";
import { Badge, Icon } from "@/components/ui";
import s from "./checks.module.scss";

export function CheckCard({ app }: { app: ApplicationView }) {
  const status = reportStatusView(app.report, app.documents);
  const groups = app.report ? groupFindings(app.report.findings) : null;
  const docs = app.documents.length;
  const processing = app.documents.filter(isProcessing).length;
  const decision = app.decision ? DECISION_VIEW[app.decision.decision] : null;
  const inn = requisiteView(app, "inn");
  const amount = requisiteView(app, "requested_amount");
  const project = requisiteView(app, "project_name");

  return (
    <Link href={`/checks/${app.id}`} className={s.card} data-tone={status.tone}>
      <span className={s.cardAccent} aria-hidden="true" />
      <div className={s.cardMain}>
        <div className={s.cardTitleRow}>
          <h3 className={s.cardTitle}>{applicationTitle(app)}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
          {decision && <Badge tone={decision.tone}>{decision.label}</Badge>}
        </div>
        {project.kind === "value" && <p className={s.cardProject}>{project.text}</p>}
        {app.programName && (
          <span className={s.cardProgram}>
            <Icon name="folder" size={14} /> {app.programName}
          </span>
        )}
        <div className={s.cardMeta}>
          <span data-missing={inn.kind === "missing" || undefined}>ИНН {inn.kind === "value" ? inn.text : inn.kind === "missing" ? "не распознан" : "—"}</span>
          <span className={s.metaDot} />
          <span data-missing={amount.kind === "missing" || undefined}>
            {amount.kind === "value" ? amount.text : amount.kind === "missing" ? "Сумма не распознана" : "Сумма —"}
          </span>
          <span className={s.metaDot} />
          <span>{formatRelativeDay(app.createdAt)}</span>
        </div>
      </div>
      <div className={s.cardSide}>
        <span className={s.docCount}>
          <Icon name="file" size={16} />
          {docs} {pluralize(docs, ["документ", "документа", "документов"])}
          {processing > 0 && ` · ${processing} в обработке`}
        </span>
        {groups && (groups.errors.length > 0 || groups.warnings.length > 0) && (
          <span className={s.issues}>
            {groups.errors.length > 0 && (
              <span className={s.issueError} title="Критические ошибки">
                <Icon name="error" size={16} /> {groups.errors.length}
              </span>
            )}
            {groups.warnings.length > 0 && (
              <span className={s.issueWarn} title="Предупреждения">
                <Icon name="alert" size={16} /> {groups.warnings.length}
              </span>
            )}
          </span>
        )}
        <Icon name="arrowRight" className={s.cardArrow} />
      </div>
    </Link>
  );
}
