"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { fieldLabel, typeTitle } from "@/lib/documentTypes";
import { formatDateTime, formatFileSize, formatPercent } from "@/lib/format";
import { confidenceTone, effectiveType, findingSeverity, needsConfirmation, SEVERITY_TONE } from "@/lib/presentation";
import type { DocumentTypeCode, DocumentView, ExtractedField, Finding } from "@/lib/types";
import { Badge, Button, Icon, SelectField } from "@/components/ui";
import s from "./package.module.scss";

interface Props {
  document: DocumentView;
  types: DocumentTypeCode[];
  findings: Finding[];
  onChangeType: (type: DocumentTypeCode) => Promise<void>;
  onChangeField: (name: string, value: string) => Promise<void>;
  onDelete: () => void;
}

function ConfidenceMeter({ value }: { value: number }) {
  const tone = confidenceTone(value);
  return (
    <div className={s.meter} data-tone={tone}>
      <div className={s.meterHead}>
        <span>Уверенность модели</span>
        <b>{formatPercent(value)}</b>
      </div>
      <div className={s.meterTrack} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Уверенность модели">
        <motion.span
          className={s.meterFill}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(value * 100)}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function FieldRow({ field, onSave }: { field: ExtractedField; onSave: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(field.value ?? ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(String(field.value ?? "")), [field.value]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const label = fieldLabel(field.name);
  return (
    <li className={s.fieldRow}>
      <span className={s.fieldName}>
        {label}
        {field.manuallyCorrected && (
          <Badge tone="info" dot={false} className={s.fieldBadge}>
            исправлено
          </Badge>
        )}
      </span>
      {editing ? (
        <form
          className={s.fieldEdit}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            className={s.fieldInput}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`Значение поля «${label}»`}
            autoFocus
          />
          <Button type="submit" size="sm" iconOnly icon="check" loading={saving} aria-label="Сохранить поле" />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon="close"
            aria-label="Отменить правку"
            onClick={() => {
              setValue(String(field.value ?? ""));
              setEditing(false);
            }}
          />
        </form>
      ) : (
        <span className={s.fieldValueRow}>
          <span className={s.fieldValue}>{field.value === null || field.value === "" ? "—" : String(field.value)}</span>
          {typeof field.confidence === "number" && (
            <span className={s.fieldConf} data-tone={confidenceTone(field.confidence)}>
              {formatPercent(field.confidence)}
            </span>
          )}
          <button type="button" className={s.fieldEditBtn} onClick={() => setEditing(true)} aria-label={`Исправить поле «${label}»`}>
            <Icon name="edit" size={16} />
          </button>
        </span>
      )}
    </li>
  );
}

export function DocumentDetails({ document: doc, types, findings, onChangeType, onChangeField, onDelete }: Props) {
  const [editingType, setEditingType] = useState(false);
  const current = effectiveType(doc);
  const [newType, setNewType] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const uncertain = needsConfirmation(doc);
  const processing = doc.processingStatus === "PENDING" || doc.processingStatus === "PROCESSING";

  useEffect(() => {
    setEditingType(false);
    setNewType(effectiveType(doc) ?? "");
  }, [doc]);

  const saveType = async () => {
    if (!newType) return;
    setSaving(true);
    try {
      await onChangeType(newType);
      setEditingType(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={s.details} aria-label="Результат разбора">
      <div className={s.detailsBlock}>
        <span className={s.detailsLabel}>Тип документа</span>
        <AnimatePresence mode="wait" initial={false}>
          {editingType ? (
            <motion.div key="edit" className={s.typeEdit} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <SelectField
                label="Новый тип документа"
                hideLabel
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                options={[{ value: "", label: "Выберите тип" }, ...types.map((t) => ({ value: t, label: typeTitle(t) }))]}
              />
              <div className={s.typeEditActions}>
                <Button size="sm" variant="ghost" onClick={() => setEditingType(false)} disabled={saving}>
                  Отмена
                </Button>
                <Button size="sm" onClick={saveType} loading={saving} disabled={!newType || newType === current}>
                  Сохранить тип
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="view" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <h2 className={s.detailsType}>
                {processing ? "Определяется моделью…" : uncertain && current ? `Предположительно: ${typeTitle(current)}` : typeTitle(current)}
              </h2>
            </motion.div>
          )}
        </AnimatePresence>

        {typeof doc.confidence === "number" && !processing && <ConfidenceMeter value={doc.confidence} />}

        {uncertain && (
          <motion.div className={s.confirmBanner} role="status" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <Icon name="alert" size={18} />
            <span>Тип документа требует подтверждения специалиста</span>
          </motion.div>
        )}

        {!editingType && (
          <div className={s.detailsActions}>
            {uncertain && current && (
              <Button size="sm" icon="check" onClick={() => onChangeType(current)}>
                Подтвердить
              </Button>
            )}
            <Button size="sm" variant="outline" icon="edit" onClick={() => setEditingType(true)}>
              Исправить тип
            </Button>
          </div>
        )}
      </div>

      {findings.length > 0 && (
        <div className={s.detailsBlock}>
          <span className={s.detailsLabel}>Замечания по документу</span>
          <ul className={s.docFindings}>
            {findings.map((f, i) => (
              <li key={`${f.code}-${i}`} data-tone={SEVERITY_TONE[findingSeverity(f)]}>
                <Icon name={findingSeverity(f) === "ERROR" ? "error" : "alert"} size={16} />
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={s.detailsBlock}>
        <span className={s.detailsLabel}>Извлечённые поля</span>
        {doc.fields && doc.fields.length > 0 ? (
          <ul className={s.fields}>
            {doc.fields.map((f) => (
              <FieldRow key={f.name} field={f} onSave={(value) => onChangeField(f.name, value)} />
            ))}
          </ul>
        ) : (
          <p className={s.muted}>
            {processing ? "Поля появятся после разбора документа." : "Сервер не вернул извлечённые поля для этого документа."}
          </p>
        )}
      </div>

      <div className={s.detailsBlock}>
        <span className={s.detailsLabel}>Файл</span>
        <dl className={s.fileMeta}>
          <dt>Имя</dt>
          <dd title={doc.filename}>{doc.filename}</dd>
          <dt>Размер</dt>
          <dd>{formatFileSize(doc.size)}</dd>
          <dt>Загружен</dt>
          <dd>{formatDateTime(doc.uploadedAt)}</dd>
        </dl>
        <Button size="sm" variant="danger" icon="trash" onClick={onDelete} className={s.deleteBtn}>
          Удалить документ
        </Button>
      </div>
    </section>
  );
}
