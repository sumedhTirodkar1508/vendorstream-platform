import { z } from "zod";

export const ProcessImportBatchSchema = z.object({
  importBatchId: z.string().uuid("importBatchId must be a valid UUID"),
  cycleId: z.string().uuid("cycleId must be a valid UUID"),
  uploadedFileId: z.string().uuid("uploadedFileId must be a valid UUID"),
  uploadedByUserId: z.string().uuid("uploadedByUserId must be a valid UUID"),
  sourceType: z.enum(["LP", "STORE"]),
  lpId: z.string().uuid("lpId must be a valid UUID"),
  storeLocationId: z.string().uuid("storeLocationId must be a valid UUID"),
  periodMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "periodMonth must be in YYYY-MM format"),
});

export type ProcessImportBatchPayload = z.infer<
  typeof ProcessImportBatchSchema
>;
