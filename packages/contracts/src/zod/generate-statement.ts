import { z } from "zod";

export const GenerateStatementSchema = z.object({
  statementTaskId: z
    .string()
    .uuid("statementTaskId must be a valid UUID"),
  cycleId: z.string().uuid("cycleId must be a valid UUID"),
});

export type GenerateStatementPayload = z.infer<typeof GenerateStatementSchema>;
