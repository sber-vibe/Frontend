"use client";

import { motion } from "framer-motion";
import { NOT_RECOGNIZED, requisiteViews } from "@/lib/requisites";
import type { ApplicationView } from "@/lib/types";
import { Badge, Icon } from "@/components/ui";
import { FieldHistory } from "./DocumentDetails";
import s from "./package.module.scss";

interface Props {
  app: ApplicationView;
  /** Открыть документ-источник рядом с оригиналом, чтобы сверить или исправить значение. */
  onShowSource: (documentId: string) => void;
}

/** Карточка заявки, заполненная по документам пакета. Специалист сверяет её с оригиналами. */
export function RequisitesPanel({ app, onShowSource }: Props) {
  const views = requisiteViews(app);
  const missing = views.filter((v) => v.kind === "missing").length;

  return (
    <motion.section
      className={s.requisites}
      aria-label="Реквизиты заявки"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={s.requisitesHead}>
        <h2>Реквизиты заявки</h2>
        <span className={s.muted}>
          <Icon name="sparkle" size={14} /> Извлечены из документов пакета
        </span>
      </div>

      {missing > 0 && (
        <div className={s.confirmBanner} role="status">
          <Icon name="alert" size={18} />
          <span>
            {missing === 1 ? "1 реквизит не распознан" : `${missing} реквизита не распознаны`} — проверьте по оригиналу и исправьте
            в документе-источнике
          </span>
        </div>
      )}

      <dl className={s.requisitesList}>
        {views.map((v) => {
          const docId = v.field?.documentId ?? null;
          const docName = docId ? app.documents.find((d) => d.id === docId)?.filename : null;
          return (
            <div key={v.name} className={s.requisite} data-kind={v.kind}>
              <dt>{v.label}</dt>
              <dd>
                {v.kind === "value" ? (
                  <span className={s.fieldValue}>
                    {v.text}
                    {v.field.manuallyCorrected && (
                      <Badge tone="info" dot={false} className={s.fieldBadge}>
                        исправлено
                      </Badge>
                    )}
                  </span>
                ) : v.kind === "missing" ? (
                  <Badge tone="warning">{NOT_RECOGNIZED}</Badge>
                ) : (
                  <span className={s.muted}>{v.text}</span>
                )}
                {v.field?.source && <span className={s.fieldSource}>«{v.field.source}»</span>}
                {v.field?.manuallyCorrected && <FieldHistory field={v.field} />}
                {docId && (
                  <button type="button" className={s.sourceLink} onClick={() => onShowSource(docId)}>
                    <Icon name="file" size={14} /> {docName ? `Открыть «${docName}»` : "Открыть документ-источник"}
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </motion.section>
  );
}
