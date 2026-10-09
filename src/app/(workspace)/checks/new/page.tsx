"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { CreateCheckForm } from "@/components/checks/CreateCheckForm";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import s from "./new.module.scss";

const STEPS = [
  { title: "Данные организации", text: "Название, ИНН и сумма субсидии" },
  { title: "Загрузка пакета", text: "PDF, сканы и фото документов" },
  { title: "Автоматическая проверка", text: "Комплектность, суммы, сверка ИНН" },
];

export default function NewCheckPage() {
  const router = useRouter();
  const toast = useToast();

  return (
    <div className={s.page}>
      <BackLink href="/checks">Все проверки</BackLink>
      <div className={s.grid}>
        <motion.section
          className={s.card}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1>Новая проверка</h1>
          <p className={s.lead}>Укажите данные организации, которая претендует на субсидию.</p>
          <CreateCheckForm
            onSubmit={api.createApplication}
            onCreated={(app) => {
              toast.success("Проверка создана", "Теперь загрузите пакет документов");
              router.push(`/checks/${app.id}`);
            }}
            onCancel={() => router.push("/checks")}
          />
        </motion.section>

        <aside className={s.steps} aria-label="Как проходит проверка">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              className={s.step}
              data-active={i === 0}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.1 }}
            >
              <span className={s.stepNum}>{i === 0 ? i + 1 : <Icon name={i === 1 ? "upload" : "shield"} size={18} />}</span>
              <span>
                <b>{step.title}</b>
                <small>{step.text}</small>
              </span>
            </motion.div>
          ))}
        </aside>
      </div>
    </div>
  );
}
