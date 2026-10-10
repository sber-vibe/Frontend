"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage } from "@/lib/useAsync";
import { typeTitle } from "@/lib/documentTypes";
import type { ApplicationView, CreateApplication, Program } from "@/lib/types";
import { Button, Icon, SelectField } from "@/components/ui";
import s from "./form.module.scss";

interface Props {
  onSubmit: (body: CreateApplication) => Promise<ApplicationView>;
  onCreated: (app: ApplicationView) => void;
  onCancel?: () => void;
  /** Программы субсидий с сервера; null — перечень недоступен, undefined — загружаются. */
  programs?: Program[] | null;
  /** Повторно запросить перечень программ. */
  onRetryPrograms?: () => void;
}

/** Перечень документов выбранной программы — как его прислал сервер. */
function ProgramDocuments({ program }: { program: Program }) {
  const required = program.documents.filter((d) => d.requirement === "REQUIRED");
  const conditional = program.documents.filter((d) => d.requirement === "CONDITIONAL");
  return (
    <motion.div
      className={s.programDocs}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
    >
      <p className={s.programDocsTitle}>Документы программы</p>
      <ul>
        {required.map((d) => (
          <li key={d.type}>
            <Icon name="file" size={16} /> {typeTitle(d.type)}
          </li>
        ))}
        {conditional.map((d) => (
          <li key={d.type} data-conditional="true">
            <Icon name="info" size={16} /> {typeTitle(d.type)}
            <small>условно{d.condition ? `: ${d.condition}` : ""}</small>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * Создание заявки: специалист выбирает только программу (или оставляет автоопределение).
 * Организацию, ИНН, проект и сумму сервер извлечёт из загруженного пакета.
 */
export function CreateCheckForm({ onSubmit, onCreated, onCancel, programs, onRetryPrograms }: Props) {
  const [programCode, setProgramCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);
    try {
      const created = await onSubmit({ programCode: programCode || null });
      onCreated(created);
    } catch (err) {
      setServerError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const activePrograms = (programs ?? []).filter((p) => p.active !== false);
  const selectedProgram = activePrograms.find((p) => p.code === programCode);
  // Без перечня программ с сервера заявку не создаём: не обещаем анализ, которого сервер может не поддерживать.
  const unavailable = programs === null || (Array.isArray(programs) && activePrograms.length === 0);

  return (
    <form className={s.form} onSubmit={submit} noValidate aria-label="Новая заявка">
      <AnimatePresence>
        {serverError && (
          <motion.div
            className={s.serverError}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Icon name="alert" size={18} />
            <span>{serverError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {unavailable ? (
        <div className={s.serverError} role="alert">
          <Icon name="alert" size={18} />
          <span>
            {programs === null
              ? "Не удалось получить перечень программ субсидий. Создать заявку сейчас нельзя: без программы сервер не проверит комплектность."
              : "Нет активных программ субсидий. Обратитесь к администратору."}
          </span>
          {programs === null && onRetryPrograms && (
            <Button size="sm" variant="outline" icon="refresh" onClick={onRetryPrograms}>
              Повторить
            </Button>
          )}
        </div>
      ) : (
        <SelectField
          label="Программа субсидии"
          value={programCode}
          onChange={(e) => setProgramCode(e.target.value)}
          disabled={programs === undefined}
          hint={
            programs === undefined
              ? "Загружаем программы…"
              : programCode
                ? "Перечень обязательных документов зависит от программы"
                : "Сервер определит программу по содержимому заявления"
          }
          options={[
            { value: "", label: "Определить автоматически" },
            ...activePrograms.map((p) => ({ value: p.code, label: p.name })),
          ]}
        />
      )}
      <AnimatePresence>{selectedProgram && <ProgramDocuments key={selectedProgram.code} program={selectedProgram} />}</AnimatePresence>

      <p className={s.note}>
        <Icon name="sparkle" size={16} /> Организацию, ИНН, проект и сумму вводить не нужно: система распознает их в документах
        пакета и заполнит карточку заявки. Что не удастся прочитать, будет отмечено для проверки.
      </p>

      <div className={s.actions}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Отмена
          </Button>
        )}
        <Button type="submit" size="lg" loading={submitting} disabled={unavailable || programs === undefined} iconRight="arrowRight">
          Создать и загрузить пакет
        </Button>
      </div>
    </form>
  );
}
