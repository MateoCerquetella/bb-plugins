import { Icon } from '../components/ui/icon.js';

export function ErrorNotice({ title, nextStep, detail }: { title: string; nextStep: string; detail: string }) {
  return <div className="tb-error-notice" role="alert">
    <Icon name="AlertCircle" className="size-4 shrink-0" />
    <div><strong>{title}</strong><p>{nextStep}</p>
      <details><summary>Technical details</summary><pre>{detail}</pre></details>
    </div>
  </div>;
}
