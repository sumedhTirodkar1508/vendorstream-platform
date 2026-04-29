import { z } from "zod";

export const ReconcileCycleSchema = z.object({
  cycleId: z.string().uuid("cycleId must be a valid UUID"),
  lpId: z.string().uuid(),
  storeLocationId: z.string().uuid(),
  periodMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "periodMonth must be in YYYY-MM format"),
});

export type ReconcileCyclePayload = z.infer<typeof ReconcileCycleSchema>;
