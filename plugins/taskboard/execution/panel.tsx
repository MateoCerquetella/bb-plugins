import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useBbNavigate, useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from '../contract.js';
import { formatWorkItemHandoffPrompt } from '../contract.js';
import { Button } from '../components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import {
  executionScopeSchema,
  type ExecutionConfig,
  type ExecutionRequest,
  type ExecutionRun
} from './contract.js';
import { parseVerificationCommands } from './commands.js';
import { formatExecutionError } from './errors.js';

const labels: Record<ExecutionRun['state'], string> = {
  queued: 'Queued',
  running: 'Implementation running',
  retrying: 'Retry scheduled',
  blocked: 'Execution blocked',
  canceling: 'Canceling execution',
  canceled: 'Execution canceled',
  failed: 'Execution failed',
  implementation_complete: 'Implementation complete',
  verifying: 'Verification running',
  verified: 'Verification passed'
};

export function TaskExecution({ item }: { item: WorkItem }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const formId = useId();
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [run, setRun] = useState<ExecutionRun | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{
    request: ExecutionRequest;
    digest: string;
  } | null>(null);
  const [fields, setFields] = useState({
    route: 'delegated',
    engine: 'symphony',
    repository: '',
    branch: `bb/${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    baseBranch: 'main',
    baseRevision: '',
    plan: '',
    context: '',
    criteria: '',
    checks: 'npm test\nnpm run typecheck'
  });
  const dispatchKey = useRef(crypto.randomUUID());
  const pending = useRef(false);
  const revision = useRef(0);
  const { bbProjectId: projectId, source, locator } = item;
  const load = useCallback(async () => {
    const token = ++revision.current;
    try {
      const [cfg, status] = await Promise.all([
        rpc.call('executionConfig', null),
        rpc.call('executionStatus', { projectId, source, locator })
      ]);
      if (revision.current !== token) return;
      setConfig(cfg);
      setRun(status.runs[0] ?? null);
    } catch (failure) {
      if (revision.current === token)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load execution'
        );
    }
  }, [rpc, projectId, source, locator]);
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  useRealtime('taskboard:execution-changed', () => {
    void load();
  });
  useEffect(() => {
    if (!run || ['verified', 'canceled', 'failed'].includes(run.state)) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [run?.state, load]);
  async function perform(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(formatExecutionError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function field(key: keyof typeof fields, value: string) {
    setFields(previous => ({ ...previous, [key]: value }));
    setPrepared(null);
  }
  async function prepare() {
    await perform(async () => {
      if (fields.engine === 'local' || fields.route === 'direct') {
        setOpen(false);
        navigate.toCompose({
          initialPrompt: formatWorkItemHandoffPrompt(item),
          focusPrompt: true
        });
        return;
      }
      const scope = executionScopeSchema.parse({
        repository: fields.repository,
        branch: fields.branch,
        baseBranch: fields.baseBranch,
        baseRevision: fields.baseRevision,
        route: fields.route,
        plan: fields.plan,
        context: fields.context,
        acceptanceCriteria: fields.criteria
          .split('\n')
          .map(v => v.trim())
          .filter(Boolean),
        verificationRequirements: parseVerificationCommands(fields.checks)
      });
      const result = await rpc.call('prepareExecution', {
        task: { projectId, source, locator },
        scope,
        engine: fields.engine as 'local' | 'symphony'
      });
      if (result.engine === 'local') {
        setOpen(false);
        navigate.toCompose({ initialPrompt: result.prompt, focusPrompt: true });
        return;
      }
      setPrepared({ request: result.request, digest: result.digest });
      dispatchKey.current = crypto.randomUUID();
    });
  }
  async function approve() {
    await perform(async () => {
      if (!prepared) return;
      const next = await rpc.call('startExecution', {
        request: prepared.request,
        digest: prepared.digest,
        dispatchKey: dispatchKey.current
      });
      setRun(next);
      setOpen(false);
      setPrepared(null);
    });
  }
  async function action(
    action: 'stop' | 'resume' | 'verify' | 'accept' | 'fix'
  ) {
    await perform(async () => {
      if (!run) return;
      setRun(
        await rpc.call('executionAction', {
          id: run.id,
          action,
          expectedVersion: run.version
        })
      );
    });
  }
  const verifiedChecks =
    run?.verifiedHead === run?.head &&
    Boolean(run?.head) &&
    run?.checks.every(check => check.passed);
  const active = run && !['verified', 'failed', 'canceled'].includes(run.state);
  const verification =
    run?.state === 'verified'
      ? 'Passed · acceptance reviewed'
      : run?.state === 'verifying'
        ? 'Running required checks'
        : verifiedChecks
          ? 'Checks passed · acceptance review required'
          : run?.checks.some(check => !check.passed)
            ? 'Failed · changes required'
            : 'Pending';
  return (
    <>
      {config?.enabled ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {config?.enabled ? (
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(active) || busy}
              onClick={() => {
                setFields(previous => ({
                  ...previous,
                  engine: config.defaultEngine
                }));
                setOpen(true);
                void perform(async () => {
                  const defaults = await rpc.call('executionDefaults', {
                    projectId,
                    source,
                    locator
                  });
                  setFields(previous => ({ ...previous, ...defaults }));
                });
              }}
            >
              Execute
            </Button>
          ) : null}
        </div>
      ) : null}
      {error && !open && (config?.enabled || run) ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {run ? (
        <section
          className="execution my-7 border-y py-5"
          aria-label="Task execution"
        >
          <div className="row mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Execution</h2>
            <span className="rounded border px-2 py-0.5 text-xs">
              {run.request.scope.route}
            </span>
          </div>
          <p role="status" className="text-sm font-medium">
            {labels[run.state]}
          </p>
          {run.lastError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {run.lastError}
            </p>
          ) : null}
          <div className="verification my-4 flex flex-wrap justify-between gap-2 text-sm">
            <span>Verification</span>
            <span className="text-muted-foreground">{verification}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['queued', 'running', 'retrying', 'blocked'].includes(
              run.state
            ) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void action('stop')}
              >
                Cancel execution
              </Button>
            ) : null}
            {['blocked', 'failed', 'canceled'].includes(run.state) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void action('resume')}
              >
                Resume execution
              </Button>
            ) : null}
            {run.state === 'implementation_complete' ? (
              <>
                <Button
                  size="sm"
                  disabled={busy || !run.runtimeReleased}
                  onClick={() => void action('verify')}
                >
                  {run.runtimeReleased
                    ? 'Verify implementation'
                    : 'Waiting for workspace release'}
                </Button>
                {run.checks.some(check => !check.passed) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void action('fix')}
                  >
                    Execute fixes for failed checks
                  </Button>
                ) : null}
                {verifiedChecks ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void action('accept')}
                  >
                    Confirm acceptance criteria are satisfied
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          {run.state === 'verified' ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Use the task’s status menu to advance its tracker workflow.
            </p>
          ) : null}
          <details className="mt-5 border-t pt-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Execution details
            </summary>
            <dl className="mt-4 grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-2">
              {Object.entries({
                Engine: 'Symphony',
                Agent: run.agent,
                Execution: run.id,
                'Runtime run': run.runId ?? 'Pending',
                Workspace: run.workspace,
                Branch: run.request.scope.branch,
                Started: run.startedAt ?? 'Pending',
                Ended: run.endedAt ?? '—',
                Retries: String(run.retryCount),
                'Pull request': run.pr ?? '—',
                Tracker: `${item.source} · ${item.status}`
              }).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="min-w-0 break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <details className="mt-4 border-t pt-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Approved work and verification
            </summary>
            <p className="mt-3 whitespace-pre-wrap">{run.request.scope.plan}</p>
            <ul className="my-3 list-disc pl-5">
              {run.request.scope.acceptanceCriteria.map((criterion, index) => (
                <li key={index}>{criterion}</li>
              ))}
            </ul>
            {run.checks.map(check => (
              <div key={check.id} className="mt-2">
                <strong>
                  {check.id}: {check.passed ? 'passed' : 'failed'}
                  {check.reused ? ' (reused)' : ''}
                </strong>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap">
                  {check.output}
                </pre>
              </div>
            ))}
          </details>
        </section>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Review execution</DialogTitle>
            <DialogDescription>
              {item.key} · {item.title}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {prepared ? (
            <div className="max-h-[60vh] space-y-3 overflow-auto text-sm">
              <p>
                Approve this scope and its required checks to start
                implementation.
              </p>
              <h3 className="font-medium">Plan</h3>
              <p className="whitespace-pre-wrap">
                {prepared.request.scope.plan}
              </p>
              <h3 className="font-medium">Acceptance criteria</h3>
              <ul className="list-disc pl-5">
                {prepared.request.scope.acceptanceCriteria.map(
                  (criterion, index) => (
                    <li key={index}>{criterion}</li>
                  )
                )}
              </ul>
              <h3 className="font-medium">Required checks</h3>
              {prepared.request.scope.verificationRequirements.map(check => (
                <p key={check.id} className="font-mono text-xs">
                  {check.argv.join(' ')}
                </p>
              ))}
              <details>
                <summary>Repository and route</summary>
                <p className="break-all">
                  {prepared.request.scope.repository} ·{' '}
                  {prepared.request.scope.branch}
                </p>
                <p>
                  {prepared.request.scope.route} ·{' '}
                  {prepared.request.scope.baseRevision}
                </p>
              </details>
              <p className="text-muted-foreground">
                Taskboard will independently verify the implementation. The
                agent cannot mark the task complete.
              </p>
            </div>
          ) : (
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto px-1">
              <label className="grid gap-1 text-xs" htmlFor={`${formId}-route`}>
                Route
                <select
                  id={`${formId}-route`}
                  className="rounded border bg-background p-2 text-sm"
                  value={fields.route}
                  onChange={e => field('route', e.target.value)}
                >
                  <option value="direct">Direct / local</option>
                  <option value="delegated">Delegated implementation</option>
                  <option value="structured">
                    Structured — approved specification
                  </option>
                </select>
              </label>
              <label className="grid gap-1 text-xs" htmlFor={`${formId}-plan`}>
                Approved plan
                <Textarea
                  id={`${formId}-plan`}
                  rows={4}
                  value={fields.plan}
                  onChange={e => field('plan', e.target.value)}
                />
              </label>
              <label
                className="grid gap-1 text-xs"
                htmlFor={`${formId}-criteria`}
              >
                Acceptance criteria (one per line)
                <Textarea
                  id={`${formId}-criteria`}
                  rows={3}
                  value={fields.criteria}
                  onChange={e => field('criteria', e.target.value)}
                />
              </label>
              <label
                className="grid gap-1 text-xs"
                htmlFor={`${formId}-checks`}
              >
                Required checks (one command per line)
                <Textarea
                  id={`${formId}-checks`}
                  rows={3}
                  value={fields.checks}
                  onChange={e => field('checks', e.target.value)}
                />
              </label>
              <details className="text-xs">
                <summary className="cursor-pointer">
                  Repository and execution options
                </summary>
                <div className="mt-3 grid gap-3">
                  {(
                    [
                      'repository',
                      'branch',
                      'baseBranch',
                      'baseRevision'
                    ] as const
                  ).map(key => (
                    <label
                      key={key}
                      className="grid gap-1"
                      htmlFor={`${formId}-${key}`}
                    >
                      {
                        {
                          repository: 'Repository URL or shared local path',
                          branch: 'Implementation branch',
                          baseBranch: 'Base branch',
                          baseRevision: 'Approved base commit SHA'
                        }[key]
                      }
                      <Input
                        id={`${formId}-${key}`}
                        value={fields[key]}
                        onChange={e => field(key, e.target.value)}
                      />
                    </label>
                  ))}
                  <label className="grid gap-1" htmlFor={`${formId}-engine`}>
                    Execution engine
                    <select
                      id={`${formId}-engine`}
                      className="rounded border bg-background p-2 text-sm"
                      value={fields.engine}
                      onChange={e => field('engine', e.target.value)}
                    >
                      <option value="local">Local</option>
                      <option value="symphony">Symphony</option>
                    </select>
                  </label>
                  <label className="grid gap-1" htmlFor={`${formId}-context`}>
                    Project context
                    <Textarea
                      id={`${formId}-context`}
                      value={fields.context}
                      onChange={e => field('context', e.target.value)}
                    />
                  </label>
                </div>
              </details>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => (prepared ? setPrepared(null) : setOpen(false))}
            >
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() => void (prepared ? approve() : prepare())}
            >
              {busy
                ? 'Working…'
                : prepared
                  ? 'Approve and execute'
                  : 'Review request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
