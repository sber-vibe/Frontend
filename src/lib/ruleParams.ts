import type { Rule, RuleParamSchema, RuleParamValue } from "./types";

/**
 * Встроенные описания известных параметров — если сервер не прислал paramSchema.
 * Границы заданы в единицах интерфейса: для доли — в процентах.
 */
const KNOWN_PARAMS: Record<string, RuleParamSchema> = {
  minOwnFundsShare: { kind: "percent", label: "Минимальная доля собственных средств", unit: "%", min: 0, max: 100 },
  min_share: { kind: "percent", label: "Минимальная доля", unit: "%", min: 0, max: 100 },
  threshold: { kind: "number", label: "Порог" },
  tolerance: {
    kind: "money",
    label: "Допустимое расхождение сумм",
    unit: "₽",
    min: 0,
    hint: "0 — суммы должны совпадать точно",
  },
  daysBeforeExpiry: { kind: "integer", label: "Предупреждать об окончании срока за", unit: "дн.", min: 0, max: 3650 },
  warnDays: { kind: "integer", label: "Предупреждать за", unit: "дн.", min: 0, max: 3650 },
  field: { kind: "text", label: "Поле документа" },
  pattern: { kind: "text", label: "Формат (регулярное выражение)" },
  lengths: { kind: "list", label: "Допустимая длина", unit: "цифр", min: 1, hint: "Через запятую, например 10, 12" },
};

export interface ParamField {
  key: string;
  schema: RuleParamSchema & { label: string };
}

function inferSchema(value: RuleParamValue): RuleParamSchema {
  if (typeof value === "boolean") return { kind: "boolean" };
  if (typeof value === "number") return { kind: "number" };
  if (Array.isArray(value)) return { kind: "list" };
  return { kind: "text" };
}

/** Поля формы правила: схема сервера → встроенное описание → вид по значению. */
export function paramFields(rule: Rule): ParamField[] {
  return Object.entries(rule.params ?? {}).map(([key, value]) => {
    const schema = rule.paramSchema?.[key] ?? KNOWN_PARAMS[key] ?? inferSchema(value);
    return { key, schema: { ...schema, label: schema.label ?? KNOWN_PARAMS[key]?.label ?? key } };
  });
}

/** Значение API → текст поля ввода. Доля 0.5 показывается как 50. */
export function toInput(value: RuleParamValue, schema: RuleParamSchema): string {
  if (value === null || value === undefined) return "";
  if (schema.kind === "percent" && typeof value === "number") return String(Number((value * 100).toFixed(6)));
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function toNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}

function range(schema: RuleParamSchema): string {
  const unit = schema.unit ? ` ${schema.unit}` : "";
  if (schema.min != null && schema.max != null) return `от ${schema.min} до ${schema.max}${unit}`;
  if (schema.min != null) return `не меньше ${schema.min}${unit}`;
  return `не больше ${schema.max}${unit}`;
}

export type ParseResult = { ok: true; value: RuleParamValue } | { ok: false; error: string };

/**
 * Текст поля → значение API с проверкой. Пустое значение не превращается в 0:
 * обязательный параметр без значения не сохраняется.
 */
export function parseParam(raw: string, schema: RuleParamSchema): ParseResult {
  const required = schema.required !== false;
  if (schema.kind === "boolean") return { ok: true, value: raw === "true" };
  if (raw.trim() === "") return required ? { ok: false, error: "Укажите значение" } : { ok: true, value: null };

  if (schema.kind === "text") return { ok: true, value: raw.trim() };

  if (schema.kind === "list") {
    const parts = raw.split(/[,;\s]+/).filter(Boolean);
    const numbers = parts.map((p) => toNumber(p));
    if (numbers.some((n) => n === null || !Number.isInteger(n))) return { ok: false, error: "Только целые числа через запятую" };
    const values = numbers as number[];
    if (values.some((n) => (schema.min != null && n < schema.min) || (schema.max != null && n > schema.max))) {
      return { ok: false, error: `Каждое значение ${range(schema)}` };
    }
    return { ok: true, value: Array.from(new Set(values)) };
  }

  const n = toNumber(raw);
  if (n === null || Number.isNaN(n)) return { ok: false, error: "Введите число" };
  if (schema.kind === "integer" && !Number.isInteger(n)) return { ok: false, error: "Введите целое число" };
  const min = schema.min ?? (schema.kind === "percent" ? 0 : schema.kind === "money" ? 0 : null);
  const max = schema.max ?? (schema.kind === "percent" ? 100 : null);
  if ((min != null && n < min) || (max != null && n > max)) {
    return { ok: false, error: `Допустимо ${range({ ...schema, min, max })}` };
  }
  return { ok: true, value: schema.kind === "percent" ? Number((n / 100).toFixed(8)) : n };
}

/** Пояснение к сохраняемому значению: проценты хранятся долей. */
export function storedHint(raw: string, schema: RuleParamSchema): string | null {
  if (schema.kind !== "percent") return schema.hint ?? null;
  const parsed = parseParam(raw, schema);
  return parsed.ok && typeof parsed.value === "number" ? `Сервер хранит долю ${parsed.value}` : (schema.hint ?? null);
}
