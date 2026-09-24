import { definePluginApp, useRpc, useComposer } from '@get-bb/plugin-sdk/app';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { rpcContract } from './server';
import type { JevSummary } from './jev';
import { formatTokens, summarize, tokenShare } from './usage';
import './app.css';
type Snapshot = ReturnType<typeof summarize> & {model:string;provider:string;jev:JevSummary};
function ConversationSpace() {
  const { scope } = useComposer();
  const threadId = scope.kind === 'thread' ? scope.threadId : null;
  const anchor = useRef<HTMLSpanElement>(null);
  const [footer, setFooter] = useState<Element | null>(null);
  useEffect(() => {
    let fallback: HTMLDivElement | null = null;
    const locate = () => {
      const composer = anchor.current?.closest('[data-follow-up-composer]');
      const nativeFooter = composer?.querySelector('[data-follow-up-composer-footer]');
      let target: Element | null = null;
      if (composer && window.innerWidth > 640 && nativeFooter) {
        target = nativeFooter.lastElementChild;
        fallback?.remove(); fallback = null;
      } else if (composer) {
        if (!fallback || fallback.parentElement !== composer) {
          fallback?.remove();
          fallback = document.createElement('div');
          fallback.className = 'cs-footer';
          composer.append(fallback);
        }
        target = fallback;
      }
      setFooter(previous => previous === target ? previous : target);
    };
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['data-follow-up-composer-expanded']});
    locate();
    window.addEventListener('resize', locate);
    return () => { observer.disconnect(); window.removeEventListener('resize', locate); fallback?.remove(); };
  }, [threadId]);
  const rpc = useRpc<typeof rpcContract>();
  const [data,setData] = useState<Snapshot|null>(null);
  const [error,setError] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const positionPanel = () => {
    const popup = panel.current, button = triggerRef.current;
    if (!popup || !button || !popup.matches(':popover-open')) return;
    const rect = button.getBoundingClientRect();
    const width = popup.offsetWidth, height = popup.offsetHeight;
    popup.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
    popup.style.top = `${Math.max(12, rect.top - height - 8)}px`;
  };
  const openPanel = () => { cancelClose(); panel.current?.showPopover(); positionPanel(); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => panel.current?.hidePopover(), 150); };
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel.current?.matches(':popover-open')) {
        event.preventDefault(); event.stopPropagation(); cancelClose(); panel.current.hidePopover(); triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', dismiss, true);
    const resize = new ResizeObserver(positionPanel);
    if (panel.current) resize.observe(panel.current);
    window.addEventListener('resize', positionPanel);
    document.addEventListener('scroll', positionPanel, true);
    return () => { document.removeEventListener('keydown', dismiss, true); resize.disconnect(); window.removeEventListener('resize', positionPanel); document.removeEventListener('scroll', positionPanel, true); cancelClose(); };
  }, []);
  useEffect(() => {
    let disposed=false;
    setData(null); setError(false); panel.current?.hidePopover();
    const refresh = async () => { try { const value=await rpc.call('usage',{threadId:threadId!}); if(!disposed){setData(value);setError(false);} } catch {if(!disposed){setError(true);setData(null);}} };
    if (!threadId) return;
    void refresh(); const timer=setInterval(()=>void refresh(),5000);
    return ()=>{disposed=true;clearInterval(timer);};
  },[rpc,threadId]);
  const percent=data?.percent;
  const totalInput = data?.input != null && data.cached != null ? data.input+data.cached : null;
  const cacheRate = totalInput != null && totalInput > 0 && data?.cached != null ? Math.round(data.cached/totalInput*100) : null;
  const jev = data?.jev;
  const actualModel = jev?.state === 'recorded' ? jev.lastModel : data?.model;
  const trigger = <button ref={triggerRef} type="button" className="cs-trigger" title="Conversation space" aria-label="Conversation space" onMouseEnter={openPanel} onMouseLeave={scheduleClose} aria-haspopup="dialog" onClick={openPanel}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="var(--border)" strokeWidth="3"/><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="43.98" strokeDashoffset={43.98*(1-(percent??0)/100)} transform="rotate(-90 10 10)"/></svg>
  </button>;
  return <>
    <span ref={anchor} className="cs-anchor">{footer ? null : trigger}</span>
    {footer ? createPortal(trigger, footer) : null}
    <div ref={panel} popover="auto" role="dialog" className="cs-popover" aria-label="Conversation space" onMouseEnter={cancelClose} onMouseLeave={scheduleClose} onToggle={positionPanel}>
      <div className="cs-heading"><strong>Conversation space</strong><span>{percent == null ? 'Unavailable' : `${percent}% full`}</span></div>
      <progress aria-label="Conversation space used" max={100} value={percent??0}/>
      <div className="cs-row cs-totals"><span>{formatTokens(data?.used??null)} used</span><b>{formatTokens(data?.remaining??null)} left</b></div>
      <div className="cs-breakdown" aria-label="Latest call token breakdown">
        {([['Input',data?.input,'input'],['Cached',data?.cached,'cached'],['Output',data?.output,'output'],['Reasoning',data?.reasoning,'reasoning']] as const).map(([label,value,color])=><div className={`cs-token-row cs-${color}`} key={label} title={`${label}: share of latest call tokens${color === 'reasoning' ? ' (included in Output)' : ''}`}><span className="cs-token-label"><i aria-hidden="true"/>{label}</span><b>{formatTokens(value??null)}</b><span className="cs-share">{tokenShare(value,data?.input,data?.cached,data?.output)}</span></div>)}
      </div>
      <div className="cs-row cs-model"><span>{actualModel??'Unknown model'} {data?.provider ? `(${data.provider})`:''}</span><span>{formatTokens(data?.capacity??null)} window</span></div>
      <details className="cs-details"><summary>View details <span aria-hidden="true">›</span></summary>
        <section className="cs-detail-section">
          <h4>Token usage</h4>
          <div className="cs-row"><span>Cache reuse</span><b>{cacheRate == null ? 'Unavailable' : `${cacheRate}% of input`}</b></div>
          <p>{error?'Usage could not be loaded. Retrying.':data?.estimated?'Context is estimated from the latest measurement.':'Context is reported by the provider.'}</p>
          <p>Input excludes cached tokens. Percentages use latest-call input + cached + output. Reasoning is included in Output.</p>
          <p>{data?.measuredAt ? `Measured ${new Date(data.measuredAt).toLocaleTimeString()}`:'No usage measurement yet.'}</p>
        </section>
        <section className="cs-detail-section">
          <h4>Jev routing <span className={`cs-status cs-status-${jev?.state??'waiting'}`}>{jev?.state === 'recorded' ? 'Recorded' : jev?.state === 'off' ? 'Off' : jev?.state === 'unavailable' ? 'Unavailable' : 'Waiting'}</span></h4>
          {jev?.state === 'off' ? <p>The latest turn used a manually selected model. Select Jev Routing in the model picker to route future calls.</p> : jev?.state === 'recorded' ? <>
            <div className="cs-row"><span>Last routed model</span><b>{jev.lastModel}</b></div>
            <div className="cs-row"><span>Reasoning</span><b>{jev.effort??'Unavailable'}</b></div>
            <div className="cs-row"><span>Recent calls</span><b>{jev.calls} · {jev.failures} failed</b></div>
            <div className="cs-route-models">{jev.models.map(row=><div className="cs-row" key={row.model}><span>{row.model}</span><b>{row.calls} · {Math.round(row.calls/jev.calls*100)}%</b></div>)}</div>
            <div className="cs-row"><span>Recorded router overhead</span><b>{formatTokens(jev.judgeTokens)} tokens</b></div>
            <p>Last route {jev.at ? new Date(jev.at).toLocaleString() : 'unavailable'}. Up to 200 recent calls for this session from the local routing log; older calls may use earlier routing rules.</p>
          </> : <p>{jev?.state === 'unavailable' ? 'The local routing log could not be read. Routing activity cannot be verified here.' : 'No matching Jev calls recorded for this session yet.'}</p>}
          <p>Jev selects a model for each call; it does not reduce context size. Cache reuse is not a token reduction. Token or cost savings are unmeasured without a comparable baseline.</p>
        </section>
      </details>
    </div>
  </>;
}
export default definePluginApp(app=>{app.composer.customize({id:'conversation-space',scopes:['thread'],actions:[{id:'context-circle',component:ConversationSpace}]});});
