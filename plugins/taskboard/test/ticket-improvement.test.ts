import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
    }
    return next(specifier, context);
  }
});
const { createTicketImprovementService } = await import('../ticket-improvement-service.ts');
const { parseTicketImprovement, improvementRpcMethods, ticketImprovementPrompt } =
  await import('../ticket-improvement.ts');
const identity = { projectId: 'proj_test', requestId: 'c726ced9-48c8-44dc-b0fb-801251f3ea9b' };
const input = { ...identity, title: '', description: 'fix the broken save button' };

test('ticket images reject spoofed formats, active content and oversized bytes', async () => {
  const { decodeTicketImage } = await import('../ticket-images-server.ts');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  assert.equal(decodeTicketImage({ name: 'paste.png', dataUrl: png }).mimeType, 'image/png');
  assert.throws(() => decodeTicketImage({ name: 'fake.jpg', dataUrl: png.replace('image/png', 'image/jpeg') }), /contents/);
  assert.throws(() => decodeTicketImage({ name: 'x.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }), /encoding/);
  assert.throws(() => decodeTicketImage({ name: 'large.png', dataUrl: 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }), /2 MB/);
});

test('Linear uploads use signed storage headers and return the asset URL', async () => {
  const { createLinearAdapter } = await import('../sources/linear.ts');
  const original = globalThis.fetch;
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).includes('api.linear.app')
      ? Response.json({ data: { fileUpload: { success: true, uploadFile: {
        uploadUrl: 'https://storage.example.test/signed', assetUrl: 'https://uploads.linear.app/image.png',
        headers: [{ key: 'x-upload-token', value: 'signed-test' }]
      } } } })
      : new Response(null, { status: 200 });
  };
  try {
    const adapter = createLinearAdapter({ enabled: true, apiKey: 'test-api-key', teamKey: 'TEST', finishedDays: 0 });
    const url = await adapter.uploadImage!({ name: 'paste.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
    assert.equal(url, 'https://uploads.linear.app/image.png');
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.options!.method, 'PUT');
    assert.equal(new Headers(calls[1]!.options!.headers).get('authorization'), null);
    assert.equal(new Headers(calls[1]!.options!.headers).get('x-upload-token'), 'signed-test');
    globalThis.fetch = async () => Response.json({ data: { fileUpload: { success: false, uploadFile: null } } });
    await assert.rejects(adapter.uploadImage!({ name: 'x', mimeType: 'image/png', bytes: new Uint8Array([1]) }), /prepare/);
  } finally { globalThis.fetch = original; }
});

test('improvement asks for concrete concise scope without invented implementation', () => {
  const prompt = ticketImprovementPrompt(input);
  assert.match(prompt, /imperative verb/);
  assert.match(prompt, /Do not invent root causes/);
  assert.match(prompt, /ceiling, not a target/);
});

function fixture() {
  const records = new Map<string, unknown>();
  const spawns: any[] = [];
  const stops: string[] = [];
  const archives: string[] = [];
  const threads = {
    spawn: async (args: any) => { spawns.push(args); return { id: 'helper' }; },
    get: async () => ({ projectId: identity.projectId, status: 'idle' }),
    output: async () => ({ output: '{"title":"Fix save","description":"Repair the save button."}' }),
    stop: async ({ threadId }: any) => { stops.push(threadId); },
    archive: async ({ threadId }: any) => { archives.push(threadId); }
  };
  const bb: any = {
    sdk: { threads, projects: { defaultExecutionOptions: async () => ({
      providerId: 'codex', model: 'selected-model', reasoningLevel: 'high'
    }) } },
    storage: { kv: {
      get: async (key: string) => structuredClone(records.get(key) ?? null),
      set: async (key: string, value: unknown) => { records.set(key, structuredClone(value)); },
      list: async (prefix: string) => [...records.keys()].filter(key => key.startsWith(prefix)),
      delete: async (key: string) => { records.delete(key); }
    } },
    log: { warn() {} }
  };
  return { bb, threads, spawns, stops, archives, records,
    service: createTicketImprovementService(bb) };
}

test('draft parser accepts JSON or a single fence and rejects missing, extra or oversized fields', () => {
  const draft = { title: 'Fixed title', description: 'Clear description' };
  assert.deepEqual(parseTicketImprovement(JSON.stringify(draft)), draft);
  assert.deepEqual(parseTicketImprovement('```json\n' + JSON.stringify(draft) + '\n```'), draft);
  for (const output of ['not JSON', '{}', '{"title":"Title","description":""}',
    JSON.stringify({ ...draft, title: 'x'.repeat(501) }),
    JSON.stringify({ ...draft, labels: ['invented'] })]) {
    assert.throws(() => parseTicketImprovement(output), /draft is unchanged/);
  }
  assert.equal(improvementRpcMethods.improveTicket.input.safeParse(input).success, true);
  assert.equal(improvementRpcMethods.improveTicket.input.safeParse({
    ...input, description: ' '
  }).success, false);
  assert.match(ticketImprovementPrompt(input), /untrusted draft data/u);
});

test('concurrent starts spawn once with project defaults and only validated text is returned', async () => {
  const f = fixture();
  await Promise.all([f.service.start(input), f.service.start(input)]);
  assert.equal(f.spawns.length, 1);
  assert.equal(f.spawns[0].model, 'selected-model');
  assert.equal(f.spawns[0].providerId, 'codex');
  assert.equal(f.spawns[0].visibility, 'hidden');
  const result = await f.service.get(identity);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.draft, { title: 'Fix save', description: 'Repair the save button.' });
  assert.deepEqual(f.archives, ['helper']);
});

test('cancellation before start prevents dispatch, including after service reload', async () => {
  const f = fixture();
  await f.service.cancel(identity);
  const reloaded = createTicketImprovementService(f.bb);
  assert.equal((await reloaded.start(input)).status, 'canceled');
  assert.equal(f.spawns.length, 0);
});

test('uncertain spawn cannot become a confirmed cancellation or be dispatched twice', async () => {
  const f = fixture();
  f.threads.spawn = async (args: any) => { f.spawns.push(args); throw new Error('response lost'); };
  assert.equal((await f.service.start(input)).status, 'uncertain');
  assert.equal((await f.service.cancel(identity)).status, 'uncertain');
  await f.service.start(input);
  assert.equal(f.spawns.length, 1);
});

test('stop failures stay uncertain and cleanup is retried by the sweep', async () => {
  const f = fixture();
  await f.service.start(input);
  f.threads.stop = async () => { throw new Error('offline'); };
  assert.equal((await f.service.cancel(identity)).status, 'uncertain');
  f.threads.stop = async ({ threadId }: any) => { f.stops.push(threadId); };
  await f.service.sweep();
  assert.deepEqual(f.stops, ['helper']);
  assert.deepEqual(f.archives, ['helper']);
});

test('invalid model output never returns a replacement draft', async () => {
  const f = fixture();
  await f.service.start(input);
  f.threads.output = async () => ({ output: 'I created a ticket' });
  const result = await f.service.get(identity);
  assert.equal(result.status, 'failed');
  assert.equal(result.draft, null);
});
