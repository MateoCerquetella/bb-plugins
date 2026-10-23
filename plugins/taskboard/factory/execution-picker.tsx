import { useCallback, useEffect, useRef, useState } from 'react';
import {
  experimental_PermissionModePicker as PermissionModePicker,
  experimental_ProviderModelPicker as ProviderModelPicker,
  useRpc
} from '@get-bb/plugin-sdk/app';
import type {
  ExperimentalProviderModelPickerValue
} from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract } from '../contract.js';
import type { FactoryExecution, FactoryExecutionOptions } from './contract.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';

export function ExecutionPicker({
  projectId, value, onChange, threadId = null, disabled = false,
  showSummary = false, summaryTitle = 'AI for coordinator and stage sessions',
  defaultsLabel, resetLabel = 'Use project defaults', fallback = null,
  onDefaults, preferFactoryAI = false
}: {
  projectId: string;
  value: FactoryExecution | null;
  onChange: (value: FactoryExecution | null) => void;
  threadId?: string | null;
  disabled?: boolean;
  showSummary?: boolean;
  summaryTitle?: string;
  compact?: boolean;
  defaultsLabel?: string;
  resetLabel?: string;
  fallback?: FactoryExecution | null;
  onDefaults?: (value: FactoryExecution | null) => void;
  /** Prefer the factory settings AI over BB's thread defaults. */
  preferFactoryAI?: boolean;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [options, setOptions] = useState<FactoryExecutionOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const mounted = useRef(true);
  const reportedDefaults = useRef(false);
  const onDefaultsRef = useRef(onDefaults);
  useEffect(() => { onDefaultsRef.current = onDefaults; });
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const result = await rpc.call('factoryExecutionOptions', {
        projectId, providerId: null, threadId: threadId ?? null
      });
      if (!mounted.current || request !== generation.current) return;
      setOptions(result);
      setError(null);
      if (!reportedDefaults.current) {
        reportedDefaults.current = true;
        onDefaultsRef.current?.(result.defaults ?? null);
      }
    } catch (reason) {
      if (mounted.current && request === generation.current) setError(String(reason));
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [projectId, rpc, threadId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    reportedDefaults.current = false;
    void load();
  }, [load]);
  const preferred = preferFactoryAI ? options?.selected : null;
  // A factory task inherits the factory settings AI before BB's thread
  // defaults, so Jev routing cannot silently override the saved model.
  const effective = value ?? fallback ?? preferred ?? options?.defaults ?? null;
  const displayDefault = fallback ?? preferred ?? options?.defaults ?? null;
  const defaultLabel = defaultsLabel ?? (preferFactoryAI && options?.selected
    ? 'Factory AI' : threadId ? 'Thread default' : 'Project default');
  const usingDefaults = !value || (displayDefault
    ? JSON.stringify(value) === JSON.stringify(displayDefault) : false);
  const pickerValue: ExperimentalProviderModelPickerValue = effective
    ? {
        providerId: effective.providerId, model: effective.model,
        reasoningLevel: effective.reasoningLevel, serviceTier: effective.serviceTier
      }
    : { providerId: '', model: '', reasoningLevel: 'medium' };
  function update(next: ExperimentalProviderModelPickerValue) {
    const providerChanged = next.providerId !== effective?.providerId;
    onChange({
      providerId: next.providerId,
      model: next.model,
      reasoningLevel: next.reasoningLevel,
      serviceTier: next.serviceTier ?? 'default',
      permissionMode: providerChanged ? 'auto' : effective?.permissionMode ?? 'auto'
    });
  }
  return <div className="min-w-0 space-y-2">
    {showSummary ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-medium">{summaryTitle}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
          {usingDefaults ? defaultLabel : 'Custom'}
        </Badge>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !value}
          onClick={() => onChange(null)}>
          {resetLabel}
        </Button>
      </div>
    </div> : null}
    <div className="flex flex-wrap items-center gap-2">
      <ProviderModelPicker
        value={pickerValue}
        onChange={update}
        routing={options?.routing ?? undefined}
        disabled={disabled}
        className="min-w-0"
      />
      <PermissionModePicker
        providerId={effective?.providerId ?? ''}
        value={effective?.permissionMode ?? 'auto'}
        onChange={permissionMode => {
          if (effective) onChange({ ...effective, permissionMode });
        }}
        routing={options?.routing ?? undefined}
        disabled={disabled || !effective}
      />
    </div>
    {loading ? <p role="status" className="text-[11px] text-muted-foreground">Reading the current AI selection…</p> : null}
    {error ? <p role="alert" className="break-words text-xs text-destructive">{error}</p> : null}
  </div>;
}
