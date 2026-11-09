import { z } from "zod";

/** One software factory the panel can read: its MCP checkout and its HTTP URL. */
export const FactorySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    name: z.string().trim().min(1).max(60),
    url: z
      .string()
      .trim()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), "The Factory URL must be http or https."),
    /** "" uses the bundled factory.mcp.json entry point. */
    checkoutPath: z.string().trim(),
  })
  .strict();

export type Factory = z.infer<typeof FactorySchema>;

export const FactoryListSchema = z.array(FactorySchema);

export const FACTORIES_KEY = "factories:v1";

/** A stored list that no longer parses is treated as absent, never half-read. */
export function parseFactories(value: unknown): Factory[] | null {
  const parsed = FactoryListSchema.safeParse(value);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

export function seedFactories(url: string): Factory[] {
  return [{ id: "local", name: "Local", url, checkoutPath: "" }];
}

/** A readable slug from the name, suffixed until no existing factory uses it. */
export function uniqueFactoryId(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "factory";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}
