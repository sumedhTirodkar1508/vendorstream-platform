import { z } from "zod";

export const ProcessImportBatchSchema = z.object({
  uploadId: z.string().uuid("uploadId must be a valid UUID"),
  uploaderId: z.string().uuid(),
  uploadType: z.enum([
    "LP_MONTHLY_SALES",
    "STORE_MONTHLY_SALES",
    "LP_PORTFOLIO",
  ]),
});

export type ProcessImportBatchPayload = z.infer<
  typeof ProcessImportBatchSchema
>;
