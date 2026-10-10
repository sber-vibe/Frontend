"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { typeTitle } from "@/lib/documentTypes";
import { formatDateTime } from "@/lib/format";
import type { ApplicationAttribute, Program, ProgramDocument } from "@/lib/types";
import { Badge, Button, Icon, SelectField, TextField } from "@/components/ui";
import { saveErrorMessage } from "./RulesEditor";
import s from "./admin.module.scss";

type Requirement = ProgramDocument["requirement"] | "NONE";

interface Props {
  programs: Program[];
  /** Справочник типов, которые сервер умеет распознавать. Других типов в перечне быть не может. */
  types: string[];
  /** Признаки проекта для условных документов; null — сервер их пока не поддерживает. */
  attributes: ApplicationAttribute[] | null;
  onSave: (program: Program, isNew: boolean) => Promise<Program>;
}

const NEW_PROGRAM: Program = { code: "", name: "", description: "", active: true, documents: [] };

type Errors = Partial<Record<"code" | "name" | "documents" | `cond:${string}` | `attr:${string}`, string>>;

/** Проверки формы; сервер повторяет их и может вернуть свои. */
export function validateProgram(
  draft: Program,
  { isNew, takenCodes, attributes }: { isNew: boolean; takenCodes: string[]; attributes: ApplicationAttribute[] | null },
): Errors {
  const errors: Errors = {};
  const code = draft.code.trim();
  if (isNew) {
    if (!code) errors.code = "Укажите код";
    else if (!/^[A-Z][A-Z0-9_]*$/.test(code)) errors.code = "Латинские заглавные буквы, цифры и _";
    else if (takenCodes.includes(code)) errors.code = "Программа с таким кодом уже есть";
  }
  if (!draft.name.trim()) errors.name = "Укажите название";
  if (!draft.documents.some((d) => d.requirement === "REQUIRED")) errors.documents = "Добавьте хотя бы один обязательный документ";
  for (const d of draft.documents) {
    if (d.requirement !== "CONDITIONAL") continue;
    if (!d.condition?.trim()) errors[`cond:${d.type}`] = "Опишите, когда документ нужен";
    if (attributes && !d.conditionAttribute) errors[`attr:${d.type}`] = "Выберите признак проекта";
  }
  return errors;
}

function ProgramForm({ initial, isNew, types, attributes, takenCodes, onSave, onCancel }: {
  initial: Program;
  isNew: boolean;
  types: string[];
  attributes: ApplicationAttribute[] | null;
  takenCodes: string[];
  onSave: (p: Program) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Program>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  const supported = new Set(types);
  // типы из справочника сервера + уже стоящие в перечне (их можно только убрать)
  const allTypes = Array.from(new Set([...types, ...draft.documents.map((d) => d.type)]));
  const requirementOf = (type: string): Requirement => draft.documents.find((d) => d.type === type)?.requirement ?? "NONE";
  const errors = validateProgram(draft, { isNew, takenCodes, attributes });
  const shown = submitted ? errors : {};

  const setRequirement = (type: string, requirement: Requirement) =>
    setDraft((p) => {
      const rest = p.documents.filter((d) => d.type !== type);
      if (requirement === "NONE") return { ...p, documents: rest };
      const prev = p.documents.find((d) => d.type === type);
      const index = p.documents.findIndex((d) => d.type === type);
      const conditional = requirement === "CONDITIONAL";
      const next: ProgramDocument = {
        type,
        requirement,
        condition: conditional ? (prev?.condition ?? "") : null,
        conditionAttribute: conditional ? (prev?.conditionAttribute ?? null) : null,
      };
      // сохраняем порядок документов в перечне
      return { ...p, documents: index >= 0 ? p.documents.map((d) => (d.type === type ? next : d)) : [...rest, next] };
    });

  const patchDoc = (type: string, patch: Partial<ProgramDocument>) =>
    setDraft((p) => ({ ...p, documents: p.documents.map((d) => (d.type === type ? { ...d, ...patch } : d)) }));

  const submit = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      setError("Исправьте отмеченные поля");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, code: draft.code.trim(), name: draft.name.trim() });
    } catch (e) {
      setError(saveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className={s.editor} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className={s.formRow}>
        <TextField
          label="Название"
          value={draft.name}
          error={shown.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <TextField
          label="Код программы"
          value={draft.code}
          disabled={!isNew}
          error={shown.code}
          hint={isNew ? "Технический код, например INNOVATION" : "Код не меняется"}
          onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
        />
      </div>
      <TextField
        label="Описание"
        value={draft.description ?? ""}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <label className={s.toggle}>
        <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        Программа доступна при создании заявки
      </label>

      <h3 className={s.subTitle}>Перечень документов</h3>
      <p className={s.fieldNote}>
        Виды документов — из справочника сервера: только их модель умеет распознавать. Условный документ нужен, когда у проекта
        есть выбранный признак; специалист указывает признак в заявке.
      </p>
      {attributes === null && (
        <p className={s.fieldNote} role="note">
          <Icon name="info" size={14} /> Сервер пока не поддерживает признаки проекта: условие сохранится только текстом и не будет
          проверяться автоматически.
        </p>
      )}
      {shown.documents && (
        <p className={s.error} role="alert">
          <Icon name="alert" size={16} /> {shown.documents}
        </p>
      )}
      <ul className={s.docTable}>
        {allTypes.map((type) => {
          const requirement = requirementOf(type);
          const doc = draft.documents.find((d) => d.type === type);
          return (
            <li key={type} data-requirement={requirement}>
              <span className={s.docName}>
                {typeTitle(type)}
                <small>{supported.has(type) ? type : `${type} · нет в справочнике сервера`}</small>
              </span>
              <SelectField
                label={`Требование для «${typeTitle(type)}»`}
                hideLabel
                value={requirement}
                onChange={(e) => setRequirement(type, e.target.value as Requirement)}
                options={[
                  { value: "NONE", label: "Не требуется" },
                  { value: "REQUIRED", label: "Обязательный" },
                  { value: "CONDITIONAL", label: "Условный" },
                ]}
              />
              {requirement === "CONDITIONAL" && (
                <div className={s.condition}>
                  {attributes && (
                    <SelectField
                      label={`Признак проекта для «${typeTitle(type)}»`}
                      value={doc?.conditionAttribute ?? ""}
                      error={shown[`attr:${type}`]}
                      onChange={(e) => patchDoc(type, { conditionAttribute: e.target.value || null })}
                      options={[
                        { value: "", label: "— выберите признак —" },
                        ...attributes.map((a) => ({ value: a.code, label: a.name })),
                      ]}
                    />
                  )}
                  <TextField
                    label={`Когда нужен «${typeTitle(type)}»`}
                    value={doc?.condition ?? ""}
                    error={shown[`cond:${type}`]}
                    placeholder="Например, «если продукция подлежит сертификации»"
                    onChange={(e) => patchDoc(type, { condition: e.target.value })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className={s.error} role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <div className={s.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        <Button icon="check" onClick={submit} loading={saving}>
          {isNew ? "Создать программу" : "Сохранить изменения"}
        </Button>
      </div>
    </motion.div>
  );
}

/** Программы субсидий и перечни документов — меняются администратором без правки кода. */
export function ProgramsEditor({ programs, types, attributes, onSave }: Props) {
  const [editing, setEditing] = useState<{ program: Program; isNew: boolean } | null>(null);
  const takenCodes = programs.map((p) => p.code);
  const attributeName = (code?: string | null) => attributes?.find((a) => a.code === code)?.name ?? code;

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <p>
          Для каждой программы — обязательные и условные документы. Новый перечень применяется к следующим проверкам; завершённые
          отчёты не пересчитываются.
        </p>
        <Button icon="plus" onClick={() => setEditing({ program: NEW_PROGRAM, isNew: true })} disabled={editing?.isNew}>
          Новая программа
        </Button>
      </div>

      <AnimatePresence>
        {editing?.isNew && (
          <ProgramForm
            initial={editing.program}
            isNew
            types={types}
            attributes={attributes}
            takenCodes={takenCodes}
            onCancel={() => setEditing(null)}
            onSave={async (p) => {
              await onSave(p, true);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <ul className={s.cards}>
        {programs.map((program) => {
          const required = program.documents.filter((d) => d.requirement === "REQUIRED");
          const conditional = program.documents.filter((d) => d.requirement === "CONDITIONAL");
          const open = editing && !editing.isNew && editing.program.code === program.code;
          return (
            <li key={program.code} className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <h3>{program.name}</h3>
                  {program.description && <p className={s.muted}>{program.description}</p>}
                  {(program.version != null || program.updatedBy) && (
                    <p className={s.version}>
                      {program.version != null && `Версия ${program.version}`}
                      {program.updatedBy && ` · изменил ${program.updatedBy}`}
                      {program.updatedAt && `, ${formatDateTime(program.updatedAt)}`}
                    </p>
                  )}
                </div>
                {program.active === false && <Badge tone="neutral">Отключена</Badge>}
                {!open && (
                  <Button size="sm" variant="outline" icon="edit" onClick={() => setEditing({ program, isNew: false })}>
                    Изменить
                  </Button>
                )}
              </div>
              {open ? (
                <ProgramForm
                  initial={program}
                  isNew={false}
                  types={types}
                  attributes={attributes}
                  takenCodes={takenCodes}
                  onCancel={() => setEditing(null)}
                  onSave={async (p) => {
                    await onSave(p, false);
                    setEditing(null);
                  }}
                />
              ) : (
                <div className={s.docChips}>
                  {required.map((d) => (
                    <span key={d.type} className={s.chip}>
                      {typeTitle(d.type)}
                    </span>
                  ))}
                  {conditional.map((d) => (
                    <span key={d.type} className={s.chip} data-conditional="true" title={d.condition ?? undefined}>
                      {typeTitle(d.type)} · условно{d.conditionAttribute ? `: ${attributeName(d.conditionAttribute)}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
