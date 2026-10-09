"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/useAsync";
import {
  parseAmount,
  toCreateApplication,
  validateCreateCheck,
  type CreateCheckErrors,
  type CreateCheckValues,
} from "@/lib/validation";
import type { ApplicationView, CreateApplication } from "@/lib/types";
import { Button, Icon, TextField } from "@/components/ui";
import s from "./form.module.scss";

interface Props {
  onSubmit: (body: CreateApplication) => Promise<ApplicationView>;
  onCreated: (app: ApplicationView) => void;
  onCancel?: () => void;
}

const EMPTY: CreateCheckValues = { applicantName: "", inn: "", projectName: "", requestedAmount: "" };

export function CreateCheckForm({ onSubmit, onCreated, onCancel }: Props) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<CreateCheckErrors>({});
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (key: keyof CreateCheckValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...values, [key]: key === "inn" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value };
    setValues(next);
    // после первой попытки отправки подсвечиваем ошибки «на лету»
    if (touched) setErrors(validateCreateCheck(next));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const found = validateCreateCheck(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const created = await onSubmit(toCreateApplication(values));
      onCreated(created);
    } catch (err) {
      setServerError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const amount = parseAmount(values.requestedAmount);

  return (
    <form className={s.form} onSubmit={submit} noValidate aria-label="Новая проверка">
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

      <TextField
        label="Организация"
        placeholder="ООО «Ромашка»"
        value={values.applicantName}
        onChange={set("applicantName")}
        error={errors.applicantName}
        maxLength={200}
        autoComplete="organization"
      />
      <div className={s.row}>
        <TextField
          label="ИНН"
          placeholder="10 или 12 цифр"
          inputMode="numeric"
          value={values.inn}
          onChange={set("inn")}
          error={errors.inn}
          hint={values.inn ? `${values.inn.length} из ${values.inn.length > 10 ? 12 : 10} цифр` : "Юрлицо — 10 цифр, ИП — 12"}
        />
        <TextField
          label="Запрашиваемая сумма"
          placeholder="850 000"
          inputMode="decimal"
          suffix="₽"
          value={values.requestedAmount}
          onChange={set("requestedAmount")}
          onBlur={() => {
            if (Number.isFinite(amount) && amount > 0) {
              setValues((v) => ({ ...v, requestedAmount: formatMoney(amount).replace(" ₽", "") }));
            }
          }}
          error={errors.requestedAmount}
        />
      </div>
      <TextField
        label="Проект / название субсидии"
        placeholder="Например, «Внедрение цифровой платформы»"
        value={values.projectName}
        onChange={set("projectName")}
        error={errors.projectName}
        maxLength={300}
      />

      <div className={s.actions}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Отмена
          </Button>
        )}
        <Button type="submit" size="lg" loading={submitting} iconRight="arrowRight">
          Создать и загрузить документы
        </Button>
      </div>
    </form>
  );
}
