"use client";

import { motion } from "framer-motion";
import { typeShort } from "@/lib/documentTypes";
import { formatPercent } from "@/lib/format";
import {
  documentOutcomeLabel,
  documentTone,
  effectiveType,
  isProcessing,
  needsConfirmation,
  PROCESSING_STEPS,
  processingStage,
  processingStatus,
  type Tone,
} from "@/lib/presentation";
import type { CheckReport, DocumentView } from "@/lib/types";
import { Icon, Spinner, type IconName } from "@/components/ui";
import s from "./package.module.scss";

const TONE_ICON: Record<Tone, IconName> = {
  success: "success",
  warning: "alert",
  danger: "error",
  info: "clock",
  neutral: "file",
};

/** Шкала фоновой обработки файла: принят → определяется → проверен. */
export function ProcessingSteps({ doc }: { doc: DocumentView }) {
  const stage = processingStage(doc);
  const failed = processingStatus(doc) === "FAILED";
  return (
    <ol className={s.steps} aria-label="Этапы обработки">
      {PROCESSING_STEPS.map((label, i) => {
        const state = failed && i === 2 ? "failed" : i < stage || (i === stage && i === 2) ? "done" : i === stage ? "active" : "todo";
        return (
          <li key={label} data-state={state}>
            <span className={s.stepDot} />
            {failed && i === 2 ? "Ошибка" : label}
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  documents: DocumentView[];
  report: CheckReport | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DocumentList({ documents, report, selectedId, onSelect }: Props) {
  return (
    <nav className={s.docList} aria-label="Документы пакета">
      <h2 className={s.columnTitle}>
        Документы <span>{documents.length}</span>
      </h2>
      <ul>
        {documents.map((doc, i) => {
          const tone = documentTone(doc, report);
          const active = doc.id === selectedId;
          const processing = isProcessing(doc);
          return (
            <motion.li
              key={doc.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04 }}
            >
              <button
                type="button"
                className={s.docItem}
                data-active={active}
                data-tone={tone}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(doc.id)}
              >
                {active && <motion.span layoutId="doc-active" className={s.docActiveBg} />}
                <span className={s.docTone}>{processing ? <Spinner /> : <Icon name={TONE_ICON[tone]} size={18} />}</span>
                <span className={s.docText}>
                  <span className={s.docType}>{processing ? "Определяется…" : typeShort(effectiveType(doc))}</span>
                  <span className={s.docFile}>{doc.filename}</span>
                  <span className={s.docStatusLine}>
                    {/* пока файл в работе — текущий этап обработки, после — итог проверки файла */}
                    <span className={s.docOutcome} data-tone={tone}>
                      {documentOutcomeLabel(doc, report)}
                    </span>
                  </span>
                </span>
                {typeof doc.confidence === "number" && !processing && (
                  <span className={s.docConfidence} data-warn={needsConfirmation(doc)} title="Уверенность определения типа">
                    {formatPercent(doc.confidence)}
                  </span>
                )}
              </button>
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}
