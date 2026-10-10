"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { DECISION_VIEW } from "@/lib/presentation";
import { errorMessage } from "@/lib/useAsync";
import type { ApplicationView, DecisionCode, DecisionRequest } from "@/lib/types";
import { Badge, Button, Icon } from "@/components/ui";
import s from "./report.module.scss";

interface Props {
  app: ApplicationView;
  onDecide: (body: DecisionRequest) => Promise<ApplicationView>;
  onDecided: (app: ApplicationView) => void;
  /** Пока документы обрабатываются, решение принимать рано. */
  disabled?: boolean;
}

const ORDER: DecisionCode[] = ["ACCEPTED", "RETURNED", "REJECTED"];

/**
 * Окончательное решение по заявке принимает специалист — система только предлагает результат проверки.
 * Для возврата и отказа нужен комментарий: его увидит заявитель и журнал.
 */
export function DecisionPanel({ app, onDecide, onDecided, disabled }: Props) {
  const [choice, setChoice] = useState<DecisionCode | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const needsComment = choice === "RETURNED" || choice === "REJECTED";
  const current = app.decision;

  const submit = async () => {
    if (!choice) return;
    if (needsComment && !comment.trim()) {
      setError("Укажите причину — её увидит заявитель");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onDecided(await onDecide({ decision: choice, comment: comment.trim() }));
      setChoice(null);
      setComment("");
      setChanging(false);
    } catch (e) {
      setError(e instanceof ApiError && e.isUnsupported ? "Сервер пока не принимает решения по заявкам" : errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (current && !changing) {
    const view = DECISION_VIEW[current.decision];
    return (
      <section className={s.decision} data-tone={view.tone} aria-label="Решение по заявке">
        <div className={s.decisionHead}>
          <h2>Решение специалиста</h2>
          <Badge tone={view.tone}>{view.label}</Badge>
        </div>
        <p className={s.decisionMeta}>
          {current.decidedBy ?? "Специалист"} · {formatDateTime(current.decidedAt)}
        </p>
        {current.comment && <p className={s.decisionComment}>«{current.comment}»</p>}
        <Button size="sm" variant="ghost" icon="edit" onClick={() => setChanging(true)} className="no-print">
          Изменить решение
        </Button>
      </section>
    );
  }

  return (
    <section className={`${s.decision} no-print`} aria-label="Решение по заявке">
      <div className={s.decisionHead}>
        <h2>Решение по заявке</h2>
      </div>
      <p className={s.decisionMeta}>
        Система проверила документы, но не принимает решение. Выберите итог — он сохранится в журнале от вашего имени.
      </p>
      <div className={s.decisionButtons} role="radiogroup" aria-label="Решение">
        {ORDER.map((code) => {
          const view = DECISION_VIEW[code];
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={choice === code}
              className={s.decisionChoice}
              data-tone={view.tone}
              disabled={disabled || saving}
              onClick={() => {
                setChoice(code);
                setError(null);
              }}
            >
              <Icon name={view.icon} size={18} />
              {view.action}
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {choice && (
          <motion.div
            className={s.decisionForm}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <label className={s.decisionLabel} htmlFor="decision-comment">
              {needsComment ? "Причина (обязательно)" : "Комментарий (необязательно)"}
            </label>
            <textarea
              id="decision-comment"
              className={s.decisionTextarea}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                choice === "RETURNED"
                  ? "Например: дослать согласие на обработку ПД и исправить сумму в обосновании затрат"
                  : choice === "REJECTED"
                    ? "Например: доля собственных средств меньше 50% расходов"
                    : "Например: пакет полный, замечаний нет"
              }
              maxLength={2000}
            />
            <div className={s.decisionActions}>
              <Button variant="ghost" onClick={() => (current ? setChanging(false) : setChoice(null))} disabled={saving}>
                Отмена
              </Button>
              <Button onClick={submit} loading={saving} icon="check">
                Сохранить решение
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {disabled && <p className={s.decisionMeta}>Решение можно принять после окончания обработки документов.</p>}
      {error && (
        <p className={s.decisionError} role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
    </section>
  );
}
