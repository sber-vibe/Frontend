"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { KNOWN_TYPES, typeTitle } from "@/lib/documentTypes";
import { errorMessage } from "@/lib/useAsync";
import type { Program, ProgramDocument } from "@/lib/types";
import { Badge, Button, Icon, SelectField, TextField } from "@/components/ui";
import s from "./admin.module.scss";

type Requirement = ProgramDocument["requirement"] | "NONE";

interface Props {
  programs: Program[];
  /** Типы документов с сервера — к ним добавляются известные типы кейса. */
  types: string[];
  onSave: (program: Program, isNew: boolean) => Promise<Program>;
}

const NEW_PROGRAM: Program = { code: "", name: "", description: "", active: true, documents: [] };

function ProgramForm({ initial, isNew, types, onSave, onCancel }: {
  initial: Program;
  isNew: boolean;
  types: string[];
  onSave: (p: Program) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Program>(initial);
  const [newType, setNewType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  const allTypes = Array.from(new Set([...types, ...KNOWN_TYPES, ...draft.documents.map((d) => d.type)]));
  const requirementOf = (type: string): Requirement => draft.documents.find((d) => d.type === type)?.requirement ?? "NONE";

  const setRequirement = (type: string, requirement: Requirement) =>
    setDraft((p) => {
      const rest = p.documents.filter((d) => d.type !== type);
      if (requirement === "NONE") return { ...p, documents: rest };
      const prev = p.documents.find((d) => d.type === type);
      const index = p.documents.findIndex((d) => d.type === type);
      const next: ProgramDocument = { type, requirement, condition: requirement === "CONDITIONAL" ? (prev?.condition ?? "") : null };
      // сохраняем порядок документов в перечне
      return { ...p, documents: index >= 0 ? p.documents.map((d) => (d.type === type ? next : d)) : [...rest, next] };
    });

  const setCondition = (type: string, condition: string) =>
    setDraft((p) => ({ ...p, documents: p.documents.map((d) => (d.type === type ? { ...d, condition } : d)) }));

  const submit = async () => {
    if (!draft.code.trim() || !draft.name.trim()) {
      setError("Укажите код и название программы");
      return;
    }
    if (!draft.documents.some((d) => d.requirement === "REQUIRED")) {
      setError("Добавьте хотя бы один обязательный документ");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, code: draft.code.trim(), name: draft.name.trim() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className={s.editor} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className={s.formRow}>
        <TextField
          label="Код программы"
          value={draft.code}
          disabled={!isNew}
          hint={isNew ? "Латиница, например INNOVATION" : "Код не меняется"}
          onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
        />
        <TextField label="Название" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
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
      <ul className={s.docTable}>
        {allTypes.map((type) => {
          const requirement = requirementOf(type);
          const doc = draft.documents.find((d) => d.type === type);
          return (
            <li key={type} data-requirement={requirement}>
              <span className={s.docName}>
                {typeTitle(type)}
                <small>{type}</small>
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
                <input
                  className={s.conditionInput}
                  value={doc?.condition ?? ""}
                  onChange={(e) => setCondition(type, e.target.value)}
                  placeholder="Когда нужен: например, «если продукция подлежит сертификации»"
                  aria-label={`Условие для «${typeTitle(type)}»`}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className={s.addType}>
        <TextField
          label="Новый вид документа"
          hint="Код типа, который сервер умеет определять, например LICENSE"
          value={newType}
          onChange={(e) => setNewType(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
        />
        <Button
          variant="outline"
          icon="plus"
          disabled={!newType || allTypes.includes(newType)}
          onClick={() => {
            setRequirement(newType, "REQUIRED");
            setNewType("");
          }}
        >
          Добавить в перечень
        </Button>
      </div>

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
export function ProgramsEditor({ programs, types, onSave }: Props) {
  const [editing, setEditing] = useState<{ program: Program; isNew: boolean } | null>(null);

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <p>Для каждой программы — обязательные и условные документы. Изменения применяются к новым проверкам сразу после сохранения.</p>
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
                      {typeTitle(d.type)} · условно
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
