import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./ui/Icon";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="no-print"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontWeight: 600, width: "fit-content" }}
    >
      <Icon name="arrowLeft" size={18} />
      {children}
    </Link>
  );
}
