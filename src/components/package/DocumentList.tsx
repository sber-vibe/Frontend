"use client";

import { motion } from "framer-motion";
import { typeShort } from "@/lib/documentTypes";
import { formatPercent } from "@/lib/format";
import { documentTone, effectiveType, needsConfirmation, type Tone } from "@/lib/presentation";
import type { CheckReport, DocumentView } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui";
import s from "./package.module.scss";

const TONE_ICON: Record<Tone, IconName> = {
  success: "success",
  warning: "alert",
  danger: "error",
  info: "info",
  neutral: "file",
};

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
                <span className={s.docTone}>
                  <Icon name={TONE_ICON[tone]} size={18} />
                </span>
                <span className={s.docText}>
                  <span className={s.docType}>{typeShort(effectiveType(doc))}</span>
                  <span className={s.docFile}>{doc.filename}</span>
                </span>
                {typeof doc.confidence === "number" && (
                  <span className={s.docConfidence} data-warn={needsConfirmation(doc)}>
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
