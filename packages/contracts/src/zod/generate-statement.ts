import { z } from "zod";

export const GenerateStatementSchema = z.object({
  reconciliationRunId: z.string().uuid(),
});

export type GenerateStatementPayload = z.infer<typeof GenerateStatementSchema>;
