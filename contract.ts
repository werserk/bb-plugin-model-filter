import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  MAX_ID_LENGTH,
  MAX_MODELS,
  MAX_PROVIDERS,
  normalizeRule,
  validId,
} from "./preferences";

export const PREFERENCES_CHANGED = "preferences-changed";
export const idSchema = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH)
  .refine(validId, "Invalid ID");
export const ruleSchema = z
  .object({
    mode: z.enum(["all", "selected"]),
    modelIds: z.array(idSchema).max(MAX_MODELS),
  })
  .strict()
  .refine(
    (rule) => rule.mode === "all" || rule.modelIds.length > 0,
    "Select at least one model",
  )
  .transform(normalizeRule);
export const snapshotSchema = z
  .object({
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    providers: z
      .record(idSchema, ruleSchema)
      .refine(
        (providers) => Object.keys(providers).length <= MAX_PROVIDERS,
        "Too many configured providers",
      ),
  })
  .strict();
export const routingSchema = z
  .object({
    environmentId: idSchema.optional(),
    hostId: idSchema.optional(),
    projectId: idSchema.optional(),
  })
  .strict()
  .refine(
    (routing) =>
      !routing.environmentId || (!routing.hostId && !routing.projectId),
    "Environment routing cannot include host or project routing",
  );
export type Routing = z.infer<typeof routingSchema>;
const revisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const rpcContract = defineRpcContract({
  getPreferences: { input: z.null(), output: snapshotSchema },
  saveProvider: {
    input: z
      .object({
        expectedRevision: revisionSchema,
        providerId: idSchema,
        rule: ruleSchema,
        routing: routingSchema.optional(),
      })
      .strict(),
    output: snapshotSchema,
  },
  resetPreferences: {
    input: z
      .object({
        expectedRevision: revisionSchema,
        providerId: idSchema.optional(),
      })
      .strict(),
    output: snapshotSchema,
  },
});
