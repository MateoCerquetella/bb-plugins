import { factoryBuildResultSchema, factoryReviewResultSchema } from './contract.js';

export const MAX_REVIEW_REPAIRS = 2;

export function readBuildResult(output: string) {
  const blocks = [...output.matchAll(/<taskboard-build>\s*([\s\S]*?)\s*<\/taskboard-build>/g)];
  if (blocks.length) {
    try {
      const parsed = factoryBuildResultSchema.safeParse(JSON.parse(blocks.at(-1)![1]));
      if (parsed.success && (parsed.data.verdict !== 'implemented' || parsed.data.revision?.trim())) return parsed.data;
    } catch { /* Missing or invalid implementation evidence cannot trigger another review. */ }
    return { verdict: 'unknown' as const, summary: output, revision: null };
  }
  const needsInput = /\b(?:implementation is awaiting|awaiting (?:human|user|product) (?:input|decisions?|approval)|waiting for (?:required |product )?decisions?)\b/i.test(output);
  return { verdict: needsInput ? 'needs_input' as const : 'unknown' as const, summary: output, revision: null };
}

export function readReviewResult(output: string) {
  // Only the final reviewer output is interpreted, never tracker text or live updates.
  const blocks = [...output.matchAll(/<taskboard-review>\s*([\s\S]*?)\s*<\/taskboard-review>/g)];
  if (blocks.length) {
    try {
      const parsed = factoryReviewResultSchema.safeParse(JSON.parse(blocks.at(-1)![1]));
      if (parsed.success && (parsed.data.verdict !== 'blocked' || parsed.data.findings.trim())) return parsed.data;
    } catch { /* An invalid result needs attention rather than automatic acceptance. */ }
    return { verdict: 'unknown' as const, findings: output };
  }
  // Older reviews predate the result contract. Recognize explicit negative verdicts;
  // never infer a pass from prose or from a successful native turn.
  const blocked = /^(?:\s*(?:#{1,6}\s*)?(?:\*\*)?(?:verdict:\s*)?(?:changes requested|review found blockers|request changes)\b)/im.test(output) ||
    /\b(?:requested implementation (?:is missing|is absent|does not exist)|none of the requested implementation|(?:ticket|issue|[A-Z][A-Z0-9]*-\d+) is not implemented)\b/i.test(output);
  return { verdict: blocked ? 'blocked' as const : 'unknown' as const, findings: output };
}
