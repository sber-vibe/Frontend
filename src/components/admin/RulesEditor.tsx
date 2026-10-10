"use client";

import { useEffect, useState } from "react";
import { typeShort } from "@/lib/documentTypes";
import { errorMessage } from "@/lib/useAsync";
import type { Rule, RuleParamValue, Severity } from "@/lib/types";
import { Badge, Button, Icon, SelectField } from "@/components/ui";
import s from "./admin.module.scss";

/** Подписи известных параметров правил; неизвестный параметр показывается по ключу. */
const PARAM_LABELS: Record<string, string> = {
  minOwnFundsShare: "Минимальная доля собственных средств",
  min_share: "Минимальная доля",
  threshold: "Порог",
  tolerance: "Допустимое расхождение",
  daysBeforeExpiry: "Предупреждать за, дней",
  warnDays: "Предупреждать за, дней",
  field: "Поле документа",
  pattern: "Формат (регулярное выражение)",
  lengths: "Допустимая длина",
};

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "ERROR", label: "Ошибка" },
  { value: "WARNING", label: "Требует внимания" },
  { value: "INFO", label: "Информация" },
];

function paramLabel(key: string) {
  return PARAM_LABELS[key] ?? key;
}

function ParamInput({ name, value, onChange }: { name: string; value: RuleParamValue; onChange: (v: RuleParamValue) => void }) {
  if (typeof value === "boolean") {
    return (
      <label className={s.toggle}>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {paramLabel(name)}
      </label>
    );
  }
  return (
    <label className={s.param}>
      <span>{paramLabel(name)}</span>
      <input
        className={s.paramInput}
        type={typeof value === "number" ? "number" : "text"}
        step="any"
        value={String(value)}
        onChange={(e) => onChange(typeof value === "number" ? Number(e.target.value) : e.target.value)}
      />
    </label>
  );
}

function RuleCard({ rule, onSave }: { rule: Rule; onSave: (r: Rule) => Promise<Rule> }) {
  const [draft, setDraft] = useState(rule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(rule), [rule]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setDraft(await onSave(draft));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={s.card} data-disabled={!draft.enabled}>
      <div className={s.cardHead}>
        <div>
          <h3>{draft.name}</h3>
          {draft.description && <p className={s.muted}>{draft.description}</p>}
          {draft.documentTypes && draft.documentTypes.length > 0 && (
            <div className={s.docChips}>
              {draft.documentTypes.map((t) => (
                <span key={t} className={s.chip}>
                  {typeShort(t)}
                </span>
              ))}
            </div>
          )}
        </div>
        <label className={s.switch}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            aria-label={`Правило «${draft.name}» включено`}
          />
          <span>{draft.enabled ? "Включено" : "Выключено"}</span>
        </label>
      </div>

      <div className={s.ruleBody}>
        <SelectField
          label="Уровень замечания"
          value={draft.severity}
          onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
          options={SEVERITY_OPTIONS}
        />
        {Object.entries(draft.params ?? {}).map(([key, value]) => (
          <ParamInput
            key={key}
            name={key}
            value={value}
            onChange={(v) => setDraft({ ...draft, params: { ...draft.params, [key]: v } })}
          />
        ))}
      </div>

      {error && (
        <p className={s.error} role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      <div className={s.actions}>
        {saved && <Badge tone="success">Сохранено</Badge>}
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(rule)} disabled={saving}>
            Отменить
          </Button>
        )}
        <Button size="sm" icon="check" onClick={save} loading={saving} disabled={!dirty}>
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
        <p>Правила выполняет сервер. Здесь задаются их параметры — например, порог доли собственных средств или срок предупреждения.</p>
      </div>
      <ul className={s.cards}>
        {rules.map((rule) => (
          <RuleCard key={rule.code} rule={rule} onSave={onSave} />
        ))}
      </ul>
    </div>
  );
}
