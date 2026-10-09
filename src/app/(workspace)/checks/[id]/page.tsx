"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { PackageWorkspace } from "@/components/package/PackageWorkspace";

export default function PackagePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <PackageWorkspace key={id} id={id} />
    </Suspense>
  );
}
