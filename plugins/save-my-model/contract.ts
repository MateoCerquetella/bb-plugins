import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const reasoningLevelSchema = z.enum([
  "none", "low", "medium", "high", "xhigh", "ultracode", "max", "ultra",
]);

export const executionSelectionSchema = z.object({
  providerId: z.string().trim().min(1).max(128),
  model: z.string().max(256),
  reasoningLevel: reasoningLevelSchema,
}).strict();

const hostSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  status: z.enum(["connected", "disconnected"]),
}).strict();

const resolutionErrorSchema = z.object({
  code: z.enum(["host-unavailable", "no-providers", "no-models", "failed"]),
  message: z.string().min(1).max(320),
}).strict();

export const saveMyModelRpcContract = defineRpcContract({
  listHosts: {
    input: z.null(),
    output: z.object({
      hosts: z.array(hostSchema).max(500),
      error: z.string().min(1).max(320).nullable(),
    }).strict(),
  },
  resolveSelection: {
    input: z.object({
      hostId: z.string().trim().min(1).max(128),
      preferred: executionSelectionSchema.nullable(),
    }).strict(),
    output: z.object({
      selection: executionSelectionSchema.nullable(),
      error: resolutionErrorSchema.nullable(),
    }).strict(),
  },
});

export type ExecutionSelection = z.infer<typeof executionSelectionSchema>;
export type SelectionResolutionError = z.infer<typeof resolutionErrorSchema>;
