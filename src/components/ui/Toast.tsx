"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import s from "./Toast.module.scss";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  text?: string;
}

interface ToastApi {
  show: (kind: ToastKind, title: string, text?: string) => void;
  success: (title: string, text?: string) => void;
  error: (title: string, text?: string) => void;
  info: (title: string, text?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, IconName> = { success: "success", error: "error", info: "info" };

export function ToastProvider({ children, duration = 4500 }: { children: ReactNode; duration?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (kind: ToastKind, title: string, text?: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, kind, title, text }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss, duration],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, text) => show("success", title, text),
      error: (title, text) => show("error", title, text),
      info: (title, text) => show("info", title, text),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={s.viewport} aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`${s.toast} ${s[t.kind]}`}
              role={t.kind === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <span className={s.icon}>
                <Icon name={ICONS[t.kind]} size={22} />
              </span>
              <div className={s.body}>
                <strong>{t.title}</strong>
                {t.text && <p>{t.text}</p>}
              </div>
              <button className={s.close} onClick={() => dismiss(t.id)} aria-label="Закрыть уведомление">
                <Icon name="close" size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast должен вызываться внутри ToastProvider");
  return ctx;
}
