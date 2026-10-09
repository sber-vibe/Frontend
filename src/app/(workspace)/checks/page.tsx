import type { Metadata } from "next";
import { ChecksDashboard } from "@/components/checks/ChecksDashboard";

export const metadata: Metadata = { title: "Проверки" };

export default function ChecksPage() {
  return <ChecksDashboard />;
}
