import type { PluginMessageDirectiveProps } from '@get-bb/plugin-sdk/app';
import { Icon } from '../components/ui/icon.js';
import { resultHeaderSchema, type ResultHeader } from './result.js';

const verdicts = {
  implemented: { label: 'Implemented', tone: 'success', detail: 'Agent-reported implementation. Review and acceptance remain separate.' },
  passed: { label: 'Passed', tone: 'success', detail: 'Review passed. Human acceptance is still pending.' },
  blocked: { label: 'Blocked', tone: 'attention', detail: 'Blockers are listed below.' },
  needs_input: { label: 'Needs input', tone: 'attention', detail: 'A required decision is listed below.' },
  unknown: { label: 'Needs attention', tone: 'neutral', detail: 'The agent could not establish a result.' }
};

export function ResultCard({ result }: { result: ResultHeader }) {
  const state = verdicts[result.verdict];
  return <div className="tb-result-card" data-tone={state.tone} role="status">
    <Icon name={state.tone === 'success' ? 'CircleCheck' : 'AlertCircle'} className="size-4 shrink-0" />
    <div><strong>{result.kind === 'build' ? 'Build' : 'Review'} · {state.label}</strong>
      <p>{state.detail}</p>
      {result.kind === 'build' && result.revision && <code title={result.revision}>{result.revision}</code>}
    </div>
  </div>;
}

export function TaskboardResultDirective({ attributes }: PluginMessageDirectiveProps) {
  const parsed = resultHeaderSchema.safeParse(attributes);
  if (!parsed.success || (parsed.data.kind === 'build' && parsed.data.verdict === 'implemented' && !parsed.data.revision)) {
    return <div className="tb-result-card" role="status">Result status unavailable. See the report below.</div>;
  }
  return <ResultCard result={parsed.data} />;
}
