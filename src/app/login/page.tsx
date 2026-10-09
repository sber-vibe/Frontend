"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import s from "./login.module.scss";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "sparkle", title: "Тип по содержимому", text: "Модель распознаёт документ, а не имя файла" },
  { icon: "shield", title: "Правила на сервере", text: "Комплектность, арифметика и сверка ИНН" },
  { icon: "eye", title: "Оригинал рядом", text: "Сравнивайте файл и результат разбора" },
];

function safeReturnTo(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/checks";
}

function LoginContent() {
  const { session, ready, oidcEnabled, loginDemo, loginOidc } = useAuth();
  const router = useRouter();
  const returnTo = safeReturnTo(useSearchParams().get("returnTo"));

  useEffect(() => {
    if (ready && session) router.replace(returnTo);
  }, [ready, session, router, returnTo]);

  return (
    <main className={s.page}>
      <section className={s.hero}>
        <div className={s.blob1} />
        <div className={s.blob2} />
        <div className={s.heroInner}>
          <Logo inverted />
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            Проверка пакета документов на субсидию — за минуты
          </motion.h1>
          <ul className={s.features}>
            {FEATURES.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.5 }}
              >
                <span className={s.featureIcon}>
                  <Icon name={f.icon} size={20} />
                </span>
                <span>
                  <b>{f.title}</b>
                  {f.text}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      <section className={s.formSide}>
        <motion.div
          className={s.card}
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.1 }}
        >
          <h2>Вход для специалиста</h2>
          <p className={s.subtitle}>Рабочее место проверки заявок на субсидию</p>
          <LoginForm
            oidcEnabled={oidcEnabled}
            onDemoLogin={(name) => {
              loginDemo(name);
              router.replace(returnTo);
            }}
            onOidcLogin={() => loginOidc(returnTo)}
          />
        </motion.div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
