"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { typeTitle } from "@/lib/documentTypes";
import { formatDateTime, formatMoney } from "@/lib/format";
import { completenessRows, groupFindings, reportStatusView, type Tone } from "@/lib/presentation";
import { buildProtocol, downloadText } from "@/lib/protocol";
import { errorMessage, useAsync } from "@/lib/useAsync";
import type { ApplicationView, Finding } from "@/lib/types";
import { BackLink } from "@/components/BackLink";
import { Button, ButtonLink, EmptyState, ErrorState, Icon, ProgressRing, Skeleton, type IconName } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import s from "./report.module.scss";

const HERO_ICON: Record<Tone, IconName> = {
  success: "success",
  info: "shield",
  warning: "alert",
  danger: "error",
  neutral: "clock",
};

function FindingGroup({ title, tone, icon, items, app }: {
  title: string;
  tone: Tone;
  icon: IconName;
  items: Finding[];
  app: ApplicationView;
}) {
  if (items.length === 0) return null;
  return (
    <section className={s.group} data-tone={tone}>
      <h2 className={s.groupTitle}>
        <Icon name={icon} size={20} />
        {title}
        <span className={s.groupCount}>{items.length}</span>
      </h2>
      <ul className={s.findings}>
        {items.map((f, i) => {
          // ссылка на оригинал рядом с замечанием: по documentId или по типу документа
          const doc = f.documentId
            ? app.documents.find((d) => d.id === f.documentId)
            : f.documentType
              ? app.documents.find((d) => (d.type ?? d.detectedType) === f.documentType)
              : undefined;
          return (
            <motion.li
              key={`${f.code}-${i}`}
              className={s.finding}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.06 }}
            >
              <span className={s.findingDot} aria-hidden="true" />
              <div className={s.findingBody}>
                <p className={s.findingMessage}>{f.message}</p>
                <p className={s.findingMeta}>
                  {f.documentType && <span>{typeTitle(f.documentType)}</span>}
                  <code>{f.code}</code>
                </p>
              </div>
              {doc && (
                <Link className={s.findingLink} href={`/checks/${app.id}?doc=${doc.id}`}>
                  <Icon name="eye" size={16} />
                  <span>Оригинал</span>
                </Link>
              )}
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

export function ReportView({ id }: { id: string }) {
  const toast = useToast();
  const { session } = useAuth();
  const { data, error, loading, reload, mutate } = useAsync(
    () => Promise.all([api.getApplication(id), api.documentTypes().catch(() => [] as string[])]),
    [id],
  );
  const [rechecking, setRechecking] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className={s.page} aria-busy="true">
        <Skeleton height={180} radius={28} />
        <Skeleton height={240} radius={20} />
      </div>
    );
  }
  if (!data) return null;
  const [app, requiredTypes] = data;

  const recheck = async () => {
    setRechecking(true);
    try {
      const report = await api.runCheck(id);
      mutate(([a, t]) => [{ ...a, report }, t]);
      toast.success("Проверка выполнена заново");
    } catch (e) {
      toast.error("Проверка не выполнена", errorMessage(e));
    } finally {
      setRechecking(false);
    }
  };

  if (!app.report) {
    return (
      <div className={s.page}>
        <BackLink href={`/checks/${id}`}>К пакету документов</BackLink>
        <EmptyState
          icon="shield"
          title="Проверка ещё не запускалась"
          text="Отчёт сбрасывается после загрузки или удаления документов. Запустите проверку, чтобы получить итог."
          action={
            <Button icon="shield" onClick={recheck} loading={rechecking} disabled={app.documents.length === 0}>
              Запустить проверку
            </Button>
          }
        />
      </div>
    );
  }

  const report = app.report;
  const status = reportStatusView(report, app.documents.length);
  const groups = groupFindings(report.findings);
  const completeness = completenessRows(requiredTypes, report);

  return (
    <div className={s.page}>
      <BackLink href={`/checks/${id}`}>К пакету документов</BackLink>

      <motion.section
        className={s.hero}
        data-tone={status.tone}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 22 }}
      >
        <motion.span
          className={s.heroIcon}
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
        >
          <Icon name={HERO_ICON[status.tone]} size={36} />
        </motion.span>
        <div className={s.heroText}>
          <p className={s.heroEyebrow}>Итог проверки</p>
          <h1>{status.label}</h1>
          <p>{status.description}</p>
          <p className={s.heroMeta}>
            {app.applicantName} · ИНН {app.inn} · {formatMoney(app.requestedAmount)} · {formatDateTime(report.checkedAt)}
          </p>
        </div>
        <div className={s.heroCounters}>
          <div>
            <b>{groups.errors.length}</b>
            <span>Критических ошибок</span>
          </div>
          <div>
            <b>{groups.warnings.length}</b>
            <span>Предупреждений</span>
          </div>
        </div>
      </motion.section>

      <div className={`${s.actions} no-print`}>
        <Button variant="outline" icon="refresh" onClick={recheck} loading={rechecking}>
          Перепроверить
        </Button>
        <Button
          variant="outline"
          icon="download"
          onClick={() => {
            const date = report.checkedAt.slice(0, 10);
            downloadText(`protocol_${app.inn}_${date}.txt`, buildProtocol(app, report, requiredTypes, session?.name));
          }}
        >
          Скачать протокол
        </Button>
        <Button variant="ghost" icon="printer" onClick={() => window.print()}>
          Печать
        </Button>
        <ButtonLink href={`/checks/${id}`} icon="upload" variant="secondary" className={s.actionsMain}>
          Дозагрузить документы
        </ButtonLink>
      </div>

      <div className={s.grid}>
        <motion.section
          className={s.completeness}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2>Комплектность</h2>
          <div className={s.completenessHead}>
            <ProgressRing
              value={completeness.present}
              total={completeness.total}
              tone={completeness.missing.length ? "danger" : "success"}
              caption="документов"
              size={110}
            />
            <p>
              {completeness.missing.length
                ? `Отсутствует: ${completeness.missing.map((t) => typeTitle(t)).join(", ")}`
                : "Все обязательные документы на месте"}
            </p>
          </div>
          <ul className={s.checklist}>
            {completeness.rows.map((row, i) => (
              <motion.li
                key={row.type}
                data-present={row.present}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
              >
                <Icon name={row.present ? "success" : "error"} size={18} />
                {typeTitle(row.type)}
              </motion.li>
            ))}
          </ul>
        </motion.section>

        <div className={s.groups}>
          <FindingGroup title="Ошибки" tone="danger" icon="error" items={groups.errors} app={app} />
          <FindingGroup title="Предупреждения" tone="warning" icon="alert" items={groups.warnings} app={app} />
          <FindingGroup title="Успешные проверки" tone="success" icon="success" items={groups.passed} app={app} />
          <FindingGroup title="Информация" tone="info" icon="info" items={groups.info} app={app} />
          {report.findings.length === 0 && (
            <EmptyState icon="success" title="Замечаний нет" text="Сервер не нашёл ошибок и предупреждений." />
          )}
        </div>
      </div>
    </div>
  );
}
