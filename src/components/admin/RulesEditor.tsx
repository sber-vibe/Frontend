"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { typeShort } from "@/lib/documentTypes";
import { formatDateTime } from "@/lib/format";
import { paramFields, parseParam, storedHint, toInput, type ParamField } from "@/lib/ruleParams";
import { errorMessage } from "@/lib/useAsync";
import type { Rule, RuleParamValue, Severity } from "@/lib/types";
import { Badge, Button, Icon, SelectField, TextField } from "@/components/ui";
import s from "./admin.module.scss";

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "ERROR", label: "Ошибка" },
  { value: "WARNING", label: "Требует внимания" },
  { value: "INFO", label: "Информация" },
];

/** Ошибка сохранения настройки понятными словами. */
export function saveErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) {
    return "Настройку уже изменил другой администратор. Обновите страницу и внесите изменения заново.";
  }
  if (e instanceof ApiError && e.status === 403) return "Недостаточно прав: изменять настройки может только администратор.";
  return errorMessage(e);
}

type Inputs = Record<string, string>;

function initialInputs(rule: Rule, fields: ParamField[]): Inputs {
  return Object.fromEntries(fields.map((f) => [f.key, toInput(rule.params?.[f.key] ?? null, f.schema)]));
}

function ParamInput({ field, value, error, onChange }: {
  field: ParamField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const { schema } = field;
  if (schema.kind === "boolean") {
    return (
      <label className={s.toggle}>
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(String(e.target.checked))} />
        {schema.label}
      </label>
    );
  }
  const numeric = schema.kind !== "text" && schema.kind !== "list";
  return (
    <TextField
      label={schema.label}
      value={value}
      inputMode={numeric ? "decimal" : undefined}
      suffix={schema.unit ?? undefined}
      hint={storedHint(value, schema) ?? undefined}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function RuleCard({ rule, onSave }: { rule: Rule; onSave: (r: Rule) => Promise<Rule> }) {
  const fields = useMemo(() => paramFields(rule), [rule]);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [severity, setSeverity] = useState(rule.severity);
  const [inputs, setInputs] = useState<Inputs>(() => initialInputs(rule, fields));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    setEnabled(rule.enabled);
    setSeverity(rule.severity);
    setInputs(initialInputs(rule, fields));
    setTouched(false);
    setError(null);
  };
  // правило пришло с сервера заново (после сохранения) — форма показывает сохранённые значения
  useEffect(reset, [rule, fields]);

  const parsed = fields.map((f) => ({ field: f, result: parseParam(inputs[f.key] ?? "", f.schema) }));
  const fieldErrors: Record<string, string> = {};
  const params: Record<string, RuleParamValue> = { ...rule.params };
  for (const { field, result } of parsed) {
    if (result.ok) params[field.key] = result.value;
    else fieldErrors[field.key] = result.error;
  }
  const invalid = Object.keys(fieldErrors).length > 0;
  const dirty = touched || enabled !== rule.enabled || severity !== rule.severity;

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...rule, enabled, severity, params });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(saveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={s.card} data-disabled={!enabled}>
      <div className={s.cardHead}>
        <div>
          <h3>{rule.name}</h3>
          {rule.description && <p className={s.muted}>{rule.description}</p>}
          {rule.documentTypes && rule.documentTypes.length > 0 && (
            <div className={s.docChips}>
              {rule.documentTypes.map((t) => (
                <span key={t} className={s.chip}>
                  {typeShort(t)}
                </span>
              ))}
            </div>
          )}
          {(rule.version != null || rule.updatedBy) && (
            <p className={s.version}>
              {rule.version != null && `Версия ${rule.version}`}
              {rule.updatedBy && ` · изменил ${rule.updatedBy}`}
              {rule.updatedAt && `, ${formatDateTime(rule.updatedAt)}`}
            </p>
          )}
        </div>
        <label className={s.switch}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label={`Правило «${rule.name}» включено`}
          />
          <span>{enabled ? "Включено" : "Выключено"}</span>
        </label>
      </div>

      <div className={s.ruleBody}>
        <SelectField
          label="Уровень замечания"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity)}
          options={SEVERITY_OPTIONS}
        />
        {fields.map((f) => (
          <ParamInput
            key={f.key}
            field={f}
            value={inputs[f.key] ?? ""}
            error={fieldErrors[f.key]}
            onChange={(v) => {
              setInputs((prev) => ({ ...prev, [f.key]: v }));
              setTouched(true);
            }}
          />
        ))}
      </div>

      {!enabled && (
        <p className={s.fieldNote}>
          <Icon name="alert" size={14} /> Выключенное правило не применяется в новых проверках.
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <div className={s.actions}>
        {saved && <Badge tone="success">Сохранено</Badge>}
        {dirty && (
          <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
            Отменить
          </Button>
        )}
        <Button size="sm" icon="check" onClick={save} loading={saving} disabled={!dirty || invalid}>
          Сохранить
        </Button>
      </div>
    </li>
  );
}

/** Правила проверки: включение, уровень замечания и параметры (порог, срок) — без правки кода. */
export function RulesEditor({ rules, onSave }: { rules: Rule[]; onSave: (r: Rule) => Promise<Rule> }) {
  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <p>
          Правила выполняет сервер, здесь меняются их параметры. Сохранение создаёт новую версию настроек: её используют
          следующие проверки, в том числе повторная проверка заявки. Завершённые отчёты не пересчитываются.
        </p>
      </div>
      <ul className={s.cards}>
        {rules.map((rule) => (
          <RuleCard key={rule.code} rule={rule} onSave={onSave} />
        ))}
      </ul>
    </div>
  );
}
