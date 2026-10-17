"use client";

import ManualPaymentPageComponent from "@/features/marketplace/components/ManualPaymentPageComponent";
import LoadingScreen from "@/layouts/LoadingScreen";
import { Suspense } from "react";

export default function ManualPaymentPage() {
  return (
    <Suspense fallback={<LoadingScreen className="w-full min-h-screen" />}>
      <ManualPaymentPageComponent />
    </Suspense>
  );
}
