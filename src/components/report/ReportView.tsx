"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { typeTitle } from "@/lib/documentTypes";
import { formatDateTime, formatMoney, pluralize } from "@/lib/format";
import {
  completenessRows,
  groupFindings,
  isProcessing,
  needsPolling,
  reportStatusView,
  type CompletenessRow,
  type Tone,
} from "@/lib/presentation";
import { buildProtocol, downloadText } from "@/lib/protocol";
import { errorMessage, useAsync } from "@/lib/useAsync";
import type { ApplicationView, Finding } from "@/lib/types";
import { BackLink } from "@/components/BackLink";
import { Button, ButtonLink, EmptyState, ErrorState, Icon, ProgressRing, Skeleton, Spinner, type IconName } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { DecisionPanel } from "./DecisionPanel";
import s from "./report.module.scss";

const HERO_ICON: Record<Tone, IconName> = {
  success: "success",
  info: "clock",
  warning: "alert",
  danger: "error",
  neutral: "clock",
};

/** Документ, к которому относится замечание: по documentId или по типу документа. */
function findingDocument(f: Finding, app: ApplicationView) {
  if (f.documentId) return app.documents.find((d) => d.id === f.documentId);
  if (f.documentType) return app.documents.find((d) => (d.type ?? d.detectedType) === f.documentType);
  return undefined;
}

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
          const doc = findingDocument(f, app);
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
                {(f.documentType || doc) && (
                  <p className={s.findingMeta}>
                    {f.documentType && <span>{typeTitle(f.documentType)}</span>}
                    {doc && <span>{doc.filename}</span>}
                  </p>
                )}
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

const ROW_VIEW: Record<CompletenessRow["status"], { icon: IconName; label: string }> = {
  FOUND: { icon: "success", label: "найден" },
  MISSING: { icon: "error", label: "не хватает" },
  CONDITIONAL_MISSING: { icon: "alert", label: "условно требуется" },
  EXTRA: { icon: "info", label: "лишний для программы" },
};

function CompletenessList({ rows, appId }: { rows: CompletenessRow[]; appId: string }) {
  return (
    <ul className={s.checklist}>
      {rows.map((row, i) => {
        const view = ROW_VIEW[row.status];
        return (
          <motion.li
            key={`${row.type}-${row.status}`}
            data-status={row.status}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.05 }}
          >
            <Icon name={view.icon} size={18} />
            <span className={s.checkText}>
              {typeTitle(row.type)}
              <small>
                {view.label}
                {row.requirement === "CONDITIONAL" && row.status === "FOUND" ? " (условный)" : ""}
                {row.condition ? ` — ${row.condition}` : ""}
                {row.documentIds.length > 1 ? ` · ${row.documentIds.length} файла` : ""}
              </small>
            </span>
            {(row.status === "MISSING" || row.status === "CONDITIONAL_MISSING") && row.canUpload && (
              <Link className={`${s.uploadLink} no-print`} href={`/checks/${appId}#upload`}>
                <Icon name="upload" size={14} /> Дослать
              </Link>
            )}
          </motion.li>
        );
      })}
    </ul>
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

  const app = data?.[0];
  const polling = app ? needsPolling(app) : false;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      api.getApplication(id).then(
        (fresh) => mutate(([, t]) => [fresh, t]),
        () => undefined,
      );
    }, config.pollInterval);
    return () => clearInterval(timer);
  }, [polling, id, mutate]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className={s.page} aria-busy="true">
        <Skeleton height={180} radius={28} />
        <Skeleton height={240} radius={20} />
      </div>
    );
  }
  if (!data || !app) return null;
  const requiredTypes = data[1];
  const processingCount = app.documents.filter(isProcessing).length;

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
        {processingCount > 0 ? (
          <EmptyState
            icon="clock"
            title="Документы обрабатываются"
            text={`Осталось ${processingCount} ${pluralize(processingCount, ["файл", "файла", "файлов"])}. Итог появится автоматически.`}
            action={<Spinner label="Ждём результат" />}
          />
        ) : (
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
        )}
      </div>
    );
  }

  const report = app.report;
  const status = reportStatusView(report, app.documents.length);
  const groups = groupFindings(report.findings);
  const completeness = completenessRows(requiredTypes, report);
  const missingTitles = completeness.missing.map((t) => typeTitle(t));

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
          <p className={s.heroEyebrow}>Итог проверки пакета</p>
          <h1>{status.label}</h1>
          <p>{status.description}</p>
          <p className={s.heroMeta}>
            {app.applicantName} · ИНН {app.inn} · {formatMoney(app.requestedAmount)}
            {app.programName ? ` · ${app.programName}` : ""} · {formatDateTime(report.checkedAt)}
          </p>
        </div>
        <div className={s.heroCounters}>
          <div>
            <b>{groups.errors.length}</b>
            <span>{pluralize(groups.errors.length, ["Ошибка", "Ошибки", "Ошибок"])}</span>
          </div>
          <div>
            <b>{groups.warnings.length}</b>
            <span>Требуют внимания</span>
          </div>
        </div>
      </motion.section>

      {processingCount > 0 && (
        <div className={`${s.processing} no-print`} role="status" aria-live="polite">
          <Spinner />
          Ещё обрабатывается {processingCount} {pluralize(processingCount, ["файл", "файла", "файлов"])} — итог обновится автоматически.
        </div>
      )}

      <div className={`${s.actions} no-print`}>
        <Button variant="outline" icon="refresh" onClick={recheck} loading={rechecking} disabled={processingCount > 0}>
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
        <ButtonLink href={`/checks/${id}/journal`} variant="ghost" icon="clock">
          Журнал
        </ButtonLink>
        <ButtonLink href={`/checks/${id}#upload`} icon="upload" variant="secondary" className={s.actionsMain}>
          Дозагрузить документы
        </ButtonLink>
      </div>

      <div className={s.grid}>
        <div className={s.side}>
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
                tone={completeness.missing.length ? "danger" : completeness.conditionalMissing.length ? "warning" : "success"}
                caption="обязательных"
                size={110}
              />
              <p>
                {missingTitles.length
                  ? `Не хватает: ${missingTitles.join(", ")}. Документы можно дослать в эту же заявку.`
                  : completeness.conditionalMissing.length
                    ? "Обязательные документы на месте, но нет условных — проверьте, нужны ли они для этого проекта."
                    : "Все обязательные документы на месте"}
              </p>
            </div>
            <CompletenessList rows={completeness.rows} appId={id} />
          </motion.section>

          <DecisionPanel
            app={app}
            disabled={processingCount > 0}
            onDecide={(body) => api.decide(id, body)}
            onDecided={(updated) => {
              mutate(([, t]) => [updated, t]);
              toast.success("Решение сохранено", "Запись добавлена в журнал проверки");
            }}
          />
        </div>

        <div className={s.groups}>
          <FindingGroup title="Ошибки" tone="danger" icon="error" items={groups.errors} app={app} />
          <FindingGroup title="Требуют внимания" tone="warning" icon="alert" items={groups.warnings} app={app} />
          <FindingGroup title="Пройденные проверки" tone="success" icon="success" items={groups.passed} app={app} />
          <FindingGroup title="Информация" tone="info" icon="info" items={groups.info} app={app} />
          {report.findings.length === 0 && (
            <EmptyState icon="success" title="Замечаний нет" text="Сервер не нашёл ошибок и предупреждений." />
          )}
        </div>
      </div>
    </div>
  );
}
