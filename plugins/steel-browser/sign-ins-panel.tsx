import { useEffect, useRef, useState } from "react";
import { Check, GitBranch, Globe, LogIn, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import type { PluginRpcClient } from "@get-bb/plugin-sdk/app";
import type { AccountRecord, Scope, ServiceId, rpcContract } from "./contract.ts";
import { SERVICES } from "./service-catalog.ts";

export function SignInsPanel({ scope, rpc, onOpened }: {
  scope: Scope; rpc: PluginRpcClient<typeof rpcContract>; onOpened: () => void;
}) {
  const [records, setRecords] = useState<AccountRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ServiceId | null>(null);
  const [label, setLabel] = useState("");
  const alive = useRef(true);
  async function run(name: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(name); setError("");
    try { await action(); }
    catch { if (alive.current) setError("Sign-in action failed. Refresh before trying again."); }
    finally { if (alive.current) setBusy(null); }
  }
  async function refresh() {
    const result = await rpc.call("signIns", scope);
    if (alive.current) setRecords(result);
  }
  useEffect(() => {
    alive.current = true;
    void run("refresh", refresh);
    return () => { alive.current = false; };
  }, [rpc, scope]);

  return <section className="steel-signins" aria-labelledby="steel-signins-title">
    <div className="steel-toolbar">
      <div><h2 id="steel-signins-title">Saved sign-ins</h2>
        <span className="steel-updated">Project profile · User-confirmed accounts · Sessions may expire</span></div>
      <button className="steel-icon-button" type="button" disabled={!!busy} title="Refresh saved sign-ins"
        aria-label="Refresh saved sign-ins" onClick={() => void run("refresh", refresh)}><RefreshCw /></button>
    </div>
    {error && <p role="alert" className="steel-error">{error}</p>}
    {SERVICES.map(service => {
      const record = records.find(item => item.service === service.id);
      return <div className="steel-signin-row" key={service.id}>
        <div className="steel-signin-service">{service.id === "github" ? <GitBranch /> : <Globe />}
          <strong>{service.name}</strong></div>
        <div className="steel-signin-account">
          <span>{record?.label ?? "No confirmed account"}</span>
          <small>{record ? `User confirmed · ${new Date(record.confirmedAt).toLocaleDateString()}` : "Not verified"}</small>
        </div>
        <div className="steel-signin-actions">
          <button type="button" className="steel-secondary" disabled={!!busy} onClick={() => void run(`open:${service.id}`, async () => {
            await rpc.call("openSignIn", { scope, service: service.id });
            if (alive.current) onOpened();
          })}><LogIn />{busy === `open:${service.id}` ? "Opening..." : "Sign in"}</button>
          <button type="button" className="steel-icon-button" disabled={!!busy} title={`Confirm ${service.name} account`}
            aria-label={`Confirm ${service.name} account`}
            onClick={() => { setEditing(service.id); setLabel(record?.label ?? ""); }}>{record ? <Pencil /> : <Check />}</button>
          {record && <button type="button" className="steel-icon-button" disabled={!!busy}
            title="Forget account label (does not sign out)" aria-label={`Forget ${service.name} label`}
            onClick={() => {
              if (!window.confirm(`Forget the ${service.name} account label? This does not sign out of the website.`)) return;
              void run(`forget:${service.id}`, async () => {
                const next = await rpc.call("forgetSignIn", { scope, service: service.id });
                if (alive.current) setRecords(next);
              });
            }}><Trash2 /></button>}
        </div>
        {editing === service.id && <form className="steel-signin-form" onSubmit={event => {
          event.preventDefault();
          void run(`save:${service.id}`, async () => {
            const next = await rpc.call("confirmSignIn", { scope, service: service.id, label });
            if (alive.current) { setRecords(next); setEditing(null); setLabel(""); }
          });
        }}>
          <label>Account name or email<input aria-label={`${service.name} account label`} value={label}
            maxLength={120} required autoComplete="off" onChange={event => setLabel(event.target.value)} /></label>
          <button type="submit" className="steel-secondary" disabled={!!busy || !label.trim()}><Check />Confirm signed in</button>
          <button type="button" className="steel-icon-button" title="Cancel account edit" aria-label="Cancel account edit"
            onClick={() => { setEditing(null); setLabel(""); }}><X /></button>
        </form>}
      </div>;
    })}
  </section>;
}
