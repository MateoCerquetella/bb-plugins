import { z } from 'zod';
import { factoryBuildResultSchema, factoryReviewResultSchema } from './contract.js';

export const resultHeaderSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('build'),
    verdict: factoryBuildResultSchema.shape.verdict,
    revision: z.string().min(1).max(500).regex(/^[\w./:@+-]+$/).optional()
  }).strict(),
  z.object({
    kind: z.literal('review'),
    verdict: factoryReviewResultSchema.shape.verdict
  }).strict()
]);
export type ResultHeader = z.infer<typeof resultHeaderSchema>;

export function readResultMessage(output: string) {
  if (!output.includes('::taskboard-result')) return null;
  const match = /^::taskboard-result\{kind="(build|review)" verdict="([a-z_]+)"(?: revision="([\w./:@+-]{1,500})")?\}\r?\n([\s\S]*)$/.exec(output.trim());
  if (!match || match[4].includes('::taskboard-result') ||
    /<taskboard-(?:build|review)>/.test(match[4])) return { valid: false as const };
  const parsed = resultHeaderSchema.safeParse({
    kind: match[1], verdict: match[2], ...(match[3] ? { revision: match[3] } : {})
  });
  return parsed.success
    ? { valid: true as const, header: parsed.data, body: match[4].trim() }
    : { valid: false as const };
}
