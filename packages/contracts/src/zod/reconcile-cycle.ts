import { z } from "zod";

export const ReconcileCycleSchema = z.object({
  lpId: z.string().uuid(),
  storeLocationId: z.string().uuid(),
  month: z.number().min(1).max(12),
  year: z.number().min(2026), // VENDORSTREAM launch year constraint
});

export type ReconcileCyclePayload = z.infer<typeof ReconcileCycleSchema>;
