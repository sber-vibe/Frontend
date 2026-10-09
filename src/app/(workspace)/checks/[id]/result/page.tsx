"use client";

import { useParams } from "next/navigation";
import { ReportView } from "@/components/report/ReportView";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  return <ReportView key={id} id={id} />;
}
