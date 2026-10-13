import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { workSourceSchema } from '../contract.js';

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().max(24_000);
export const sourceSchema = z.object({
  path: z.string(),
  start: z.number(),
  end: z.number(),
  sha256: z.string(),
  excerpt: z.string().max(6000)
});
export const contextSchema = z.object({
  root: z.string(),
  commit: z.string(),
  inventory: z.array(z.string()).max(400),
  totalPaths: z.number(),
  sources: z.array(sourceSchema).max(24),
  notes: z.array(z.string()),
  digest: z.string()
});
export const briefSchema = z.object({
  revision: z.number().int(),
  title: z.string().min(1).max(200),
  description: text,
  author: z.string(),
  at: z.string()
});
export const executionSchema = z.object({
  providerId: z.string(),
  model: z.string(),
  permissionMode: z.enum(['full', 'auto', 'accept-edits']),
  reasoningLevel: z.enum([
    'none',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
    'ultracode'
  ]),
  serviceTier: z.enum(['default', 'fast'])
});
export const taskRefSchema = z.object({
  projectId: id,
  source: workSourceSchema,
  locator: z.string().max(1000),
  title: z.string().max(500),
  key: z.string().max(200),
  url: z
    .string()
    .max(2000)
    .url()
    .refine(
      (value) => /^https?:\/\//i.test(value),
      'Expected an HTTP(S) task URL'
    )
});
export const jobSchema = z.object({
  id,
  kind: z.enum(['brief', 'prototype']),
  status: z.enum(['queued', 'starting', 'running', 'succeeded', 'failed']),
  threadId: id.nullable(),
  brief: briefSchema,
  direction: z.string().max(6000),
  alternativeId: id.nullable(),
  parentVersionId: id.nullable(),
  error: z.string().nullable(),
  at: z.string(),
  finishedAt: z.string().nullable(),
  emptyOutputAt: z.string().datetime().nullable().optional()
});
export const versionSchema = z.object({
  id,
  alternativeId: id,
  jobId: id,
  briefRevision: z.number(),
  name: z.string().max(200),
  explanation: z.string().max(3000),
  at: z.string()
});
export const preparationSchema = z.object({
  id,
  projectId: id,
  request: text,
  createdAt: z.string(),
  updatedAt: z.string(),
  threadId: id.nullable(),
  environmentId: id.nullable(),
  hostId: id.nullable(),
  execution: executionSchema.nullable(),
  context: contextSchema.nullable(),
  artifactRoot: z.string().nullable(),
  brief: briefSchema,
  history: z.array(briefSchema).max(100),
  proposals: z.array(briefSchema).max(40),
  messages: z
    .array(z.object({ role: z.enum(['user', 'agent']), text, at: z.string() }))
    .max(100),
  jobs: z.array(jobSchema).max(60),
  versions: z.array(versionSchema).max(60),
  selection: id.nullable(),
  ready: z.boolean(),
  linkedTask: taskRefSchema.nullable(),
  error: z.string().nullable()
});
export type Preparation = z.infer<typeof preparationSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Brief = z.infer<typeof briefSchema>;
export type TaskRef = z.infer<typeof taskRefSchema>;
export const scope = z.object({ id, projectId: id });
export const preparationRpc = defineRpcContract({
  prepareCreate: {
    input: z.object({ projectId: id, request: text.min(1) }),
    output: preparationSchema
  },
  prepareList: {
    input: z.object({ projectId: id }),
    output: z.array(
      z.object({
        id,
        title: z.string(),
        threadId: id.nullable(),
        ready: z.boolean(),
        updatedAt: z.string()
      })
    )
  },
  prepareGet: { input: scope, output: preparationSchema },
  prepareForThread: {
    input: z.object({ threadId: id }),
    output: preparationSchema.nullable()
  },
  prepareEdit: {
    input: scope.extend({
      expectedRevision: z.number(),
      title: z.string().trim().min(1).max(200),
      description: text.min(1)
    }),
    output: preparationSchema
  },
  prepareApply: {
    input: scope.extend({ revision: z.number(), expectedRevision: z.number() }),
    output: preparationSchema
  },
  prepareRefine: {
    input: scope.extend({
      message: z.string().trim().min(1).max(6000),
      versionId: id.optional()
    }),
    output: preparationSchema
  },
  prepareGenerate: {
    input: scope.extend({
      count: z.number().int().min(1).max(4),
      direction: z.string().max(6000)
    }),
    output: preparationSchema
  },
  prepareRetry: {
    input: scope.extend({ jobId: id }),
    output: preparationSchema
  },
  prepareSelect: {
    input: scope.extend({ versionId: id }),
    output: preparationSchema
  },
  prepareReady: {
    input: scope.extend({ expectedRevision: z.number() }),
    output: preparationSchema
  },
  prepareLink: {
    input: scope.extend({
      task: z
        .object({
          source: workSourceSchema,
          locator: z.string().max(1000)
        })
        .nullable()
    }),
    output: preparationSchema
  },
  prepareHtml: {
    input: scope.extend({ versionId: id }),
    output: z.object({ html: z.string() })
  },
  prepareExport: {
    input: scope,
    output: z.object({
      markdown: z.string(),
      prototypeHtml: z.string().nullable(),
      json: z.string()
    })
  }
});
export const hostContract = defineRpcContract({
  collect: {
    input: z.object({ root: z.string().min(1), request: text }),
    output: contextSchema
  },
  workspace: { input: z.object({ id }), output: z.object({ path: z.string() }) }
});

export function parseAgentResult(output: string, kind: 'brief' | 'prototype') {
  if (output.length > 200_000)
    throw new Error(
      'Agent output exceeded 200 KB. Retry with a simpler alternative.'
    );
  const cleaned = output
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '');
  const begin = cleaned.indexOf('{'),
    end = cleaned.lastIndexOf('}');
  if (begin < 0 || end < begin)
    throw new Error(
      'Agent did not return the requested JSON artifact. Retry this job.'
    );
  const data = JSON.parse(cleaned.slice(begin, end + 1));
  if (kind === 'brief')
    return z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().min(50).max(24000)
      })
      .parse(data);
  return z
    .object({
      name: z.string().min(1).max(200),
      explanation: z.string().max(3000),
      html: z
        .string()
        .min(100)
        .max(160000)
        .refine(
          (s) => /<(?:html|body|div|main)\b/i.test(s),
          'Expected an HTML document'
        )
    })
    .parse(data);
}
// The trusted outer document owns the child-frame navigation policy. A policy
// inside generated HTML alone cannot block that document navigating itself.
export function sandboxHtml(html: string): string {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; ";
  const child =
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="' +
    policy +
    "frame-src 'none'" +
    '"><meta name="referrer" content="no-referrer">' +
    html;
  const escaped = child
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return (
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="' +
    policy +
    'frame-src about:' +
    '"><meta name="referrer" content="no-referrer"><style>html,body{height:100%;margin:0;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%}</style><iframe title="Prototype document" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="' +
    escaped +
    '"></iframe>'
  );
}
