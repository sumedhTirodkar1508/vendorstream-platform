"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ImportBatchStatus } from "@vendorstream/database";

const POLLING_STATUSES: ImportBatchStatus[] = ["RECEIVED", "VALIDATING", "STAGED"];
const POLLING_INTERVAL_MS = 10_000;

export function BatchStatusPoller({ status }: { status: ImportBatchStatus }) {
  const router = useRouter();

  useEffect(() => {
    if (!POLLING_STATUSES.includes(status)) {
      return;
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [router, status]);

  return null;
}
