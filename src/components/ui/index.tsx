"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { Tone } from "@/lib/presentation";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.scss";

export { Icon } from "./Icon";
export type { IconName } from "./Icon";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/* ---------- Button ---------- */

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  iconOnly?: boolean;
}

function buttonClass({ variant = "primary", size = "md", block, iconOnly }: ButtonOwnProps, extra?: string) {
  return cx(s.button, s[variant], size !== "md" && s[size], block && s.block, iconOnly && s.iconOnly, extra);
}

export const Button = forwardRef<HTMLButtonElement, ButtonOwnProps & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button(
    { variant, size, block, loading, icon, iconRight, iconOnly, className, children, disabled, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonClass({ variant, size, block, iconOnly }, className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? <Spinner /> : icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
        {children}
        {iconRight && !loading && <Icon name={iconRight} size={size === "sm" ? 16 : 18} />}
      </button>
    );
  },
);

interface ButtonLinkProps extends ButtonOwnProps {
  href: string;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function ButtonLink({ href, children, icon, iconRight, className, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(rest, className)} aria-label={rest["aria-label"]}>
      {icon && <Icon name={icon} size={rest.size === "sm" ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={18} />}
    </Link>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className={s.spinner} role={label ? "status" : undefined} aria-label={label} />;
}

/* ---------- Badge ---------- */

const TONE_CLASS: Record<Tone, string> = {
  success: s.success,
  warning: s.warning,
  danger: s.dangerTone,
  info: s.info,
  neutral: s.neutral,
};

export function Badge({ tone = "neutral", children, dot = true, className }: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cx(s.badge, TONE_CLASS[tone], className)} data-tone={tone}>
      {dot && <span className={s.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ---------- Fields ---------- */

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  children: ReactNode;
}

function FieldShell({ label, hint, error, id, children }: FieldShellProps) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span className={s.error} id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span className={s.hint} id={`${id}-hint`}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  suffix?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, suffix, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={inputId}>
      <div className={s.control}>
        <input
          ref={ref}
          id={inputId}
          className={cx(s.input, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {suffix && <span className={s.suffix}>{suffix}</span>}
      </div>
    </FieldShell>
  );
});

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  hideLabel?: boolean;
}

export function SelectField({ label, hint, error, options, id, className, hideLabel, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const select = (
    <select
      id={selectId}
      className={cx(s.input, className)}
      aria-invalid={error ? true : undefined}
      aria-label={hideLabel ? label : undefined}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (hideLabel) return select;
  return (
    <FieldShell label={label} hint={hint} error={error} id={selectId}>
      {select}
    </FieldShell>
  );
}

/* ---------- Feedback ---------- */

export function Skeleton({ width = "100%", height = 16, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className={s.skeleton} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function EmptyState({ icon = "folder", title, text, action }: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <div className={s.emptyIcon}>
        <Icon name={icon} size={32} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={s.empty} role="alert">
      <div className={cx(s.emptyIcon, s.errorIcon)}>
        <Icon name="alert" size={32} />
      </div>
      <h3>Не удалось загрузить данные</h3>
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" icon="refresh" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/* ---------- ProgressRing ---------- */

const RING_COLOR: Record<Tone, string> = {
  success: "var(--green)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  neutral: "var(--neutral)",
};

export function ProgressRing({ value, total, size = 96, stroke = 9, tone = "success", caption }: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  caption?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  // стартуем с пустого кольца, чтобы при монтировании оно плавно «заполнялось»
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(ratio));
    return () => cancelAnimationFrame(frame);
  }, [ratio]);

  return (
    <div
      className={s.ring}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value} из ${total}${caption ? ` ${caption}` : ""}`}
    >
      <svg width={size} height={size}>
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className={s.ringValue}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_COLOR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
        />
      </svg>
      <span className={s.ringLabel} style={{ fontSize: size * 0.22 }}>
        {value}/{total}
        {caption && <small>{caption}</small>}
      </span>
    </div>
  );
}
