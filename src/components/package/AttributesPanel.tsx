"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { typeTitle } from "@/lib/documentTypes";
import { errorMessage, useAsync } from "@/lib/useAsync";
import type { ApplicationAttribute, ApplicationView, Program } from "@/lib/types";
import { Badge, Button, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import s from "./package.module.scss";

interface Relevant {
  attribute: ApplicationAttribute;
  /** Условные документы программы, которые зависят от признака. */
  documents: string[];
}

/** Признаки, от которых зависят условные документы программы заявки. */
export function relevantAttributes(program: Program | undefined, attributes: ApplicationAttribute[]): Relevant[] {
  if (!program) return [];
  const byCode = new Map(attributes.map((a) => [a.code, a]));
  const result = new Map<string, Relevant>();
  for (const d of program.documents) {
    if (d.requirement !== "CONDITIONAL" || !d.conditionAttribute) continue;
    const attribute = byCode.get(d.conditionAttribute) ?? { code: d.conditionAttribute, name: d.conditionAttribute };
    const entry = result.get(attribute.code) ?? { attribute, documents: [] };
    entry.documents.push(d.type);
    result.set(attribute.code, entry);
  }
  return Array.from(result.values());
}

const CHOICES: { value: boolean | null; label: string }[] = [
  { value: true, label: "Да" },
  { value: false, label: "Нет" },
  { value: null, label: "Не указано" },
];

async function load(): Promise<{ programs: Program[]; attributes: ApplicationAttribute[] } | null> {
  try {
    const [programs, attributes] = await Promise.all([api.programs(), api.applicationAttributes()]);
    return { programs, attributes };
  } catch (e) {
    // сервер ещё не умеет признаки — панели нет, комплектность считает сервер как раньше
    if (e instanceof ApiError && e.isUnsupported) return null;
    throw e;
  }
}

/**
 * Признаки проекта, от которых зависят условные документы (сертификат, ГИМС).
 * Неизвестное значение не считается «не требуется»: сервер помечает такие документы как неопределённые.
 */
export function AttributesPanel({ app, onUpdated }: { app: ApplicationView; onUpdated: (app: ApplicationView) => void }) {
  const toast = useToast();
  const { data, error, reload } = useAsync(load, []);
  const [saving, setSaving] = useState<string | null>(null);

  if (error) {
    return (
      <p className={s.muted} role="status">
        <Icon name="alert" size={14} /> Не удалось загрузить признаки проекта: {error}{" "}
        <Button variant="ghost" size="sm" onClick={reload}>
          Повторить
        </Button>
      </p>
    );
  }
  if (!data) return null;
  const program = data.programs.find((p) => p.code === app.programCode);
  const relevant = relevantAttributes(program, data.attributes);
  if (relevant.length === 0) return null;

  const set = async (code: string, value: boolean | null) => {
    setSaving(code);
    try {
      const updated = await api.updateApplication(app.id, { attributes: { ...app.attributes, [code]: value } });
      onUpdated(updated);
      toast.success("Признак проекта сохранён", app.report ? "Запустите проверку повторно" : undefined);
    } catch (e) {
      toast.error("Не удалось сохранить признак", errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section id="attributes" className={s.requisites} aria-label="Признаки проекта">
      <div className={s.requisitesHead}>
        <h2>Признаки проекта</h2>
        <span className={s.muted}>От них зависит, нужны ли условные документы</span>
      </div>
      <ul className={s.attributes}>
        {relevant.map(({ attribute, documents }) => {
          const value = app.attributes?.[attribute.code] ?? null;
          return (
            <li key={attribute.code}>
              <div>
                <b>{attribute.name}</b>
                <small className={s.muted}>
                  {" "}
                  Нужен: {documents.map((t) => typeTitle(t)).join(", ")}
                </small>
                {value === null && (
                  <div>
                    <Badge tone="warning">Не указан — применимость не определена</Badge>
                  </div>
                )}
              </div>
              <div className={s.choices} role="radiogroup" aria-label={attribute.name}>
                {CHOICES.map((c) => (
                  <label key={String(c.value)}>
                    <input
                      type="radio"
                      name={`attr-${attribute.code}`}
                      checked={value === c.value}
                      disabled={saving !== null}
                      onChange={() => set(attribute.code, c.value)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
