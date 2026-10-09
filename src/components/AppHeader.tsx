"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "./Logo";
import { Button, ButtonLink } from "./ui";
import s from "./AppHeader.module.scss";

const NAV = [
  { href: "/checks", label: "Проверки", exact: true },
  { href: "/checks/new", label: "Новая проверка", exact: true },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppHeader({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const pathname = usePathname();

  return (
    <header className={`${s.header} no-print`}>
      <div className={`container ${s.inner}`}>
        <Link href="/checks" aria-label="На главную">
          <Logo />
        </Link>

        <nav className={s.nav} aria-label="Основная навигация">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={s.navLink} aria-current={active ? "page" : undefined}>
                {active && <motion.span layoutId="nav-pill" className={s.pill} transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className={s.navText}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={s.right}>
          <ButtonLink href="/checks/new" size="sm" icon="plus" className={s.mobileNew} iconOnly aria-label="Новая проверка" />
          <div className={s.user} title={userName}>
            <span className={s.avatar}>{initials(userName) || "С"}</span>
            <span className={s.userName}>{userName}</span>
          </div>
          <Button variant="ghost" size="sm" icon="logout" iconOnly onClick={onLogout} aria-label="Выйти" title="Выйти" />
        </div>
      </div>
    </header>
  );
}
