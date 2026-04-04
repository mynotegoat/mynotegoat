"use client";

import { createContext, useContext } from "react";
import type { PlanTier } from "@/lib/plan-access";

const PlanTierContext = createContext<PlanTier>("complete");

export function PlanTierProvider({
  children,
  planTier,
}: {
  children: React.ReactNode;
  planTier: PlanTier;
}) {
  return (
    <PlanTierContext.Provider value={planTier}>
      {children}
    </PlanTierContext.Provider>
  );
}

export function usePlanTier(): PlanTier {
  return useContext(PlanTierContext);
}
