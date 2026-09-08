import { useCallback, useEffect, useId, useRef, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.ts";
import { CHANGED, defaults, imageUrl, SLOT_COUNT, type BackgroundSettings, type Snapshot } from "./lib/model.ts";
import { backgroundRules, mountBackground, notifyChange } from "./lib/background.ts";
import { CAPY_CSS, mountCapyEffect, type CapyEffect } from "./lib/capy-effect.ts";
import { readImage } from "./lib/upload.ts";
import "./app.css";

function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }

export function BackgroundEditor() {
  const rpc = useRpc<typeof rpcContract>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<BackgroundSettings>({ ...defaults });
  const [upload, setUpload] = useState<{ name: string; dataUrl: string } | null>(null);
  const [remove, setRemove] = useState(false);
  const [slotNumber, setSlotNumber] = useState(1);
  const [slotName, setSlotName] = useState("My background");
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const dirty = useRef(false);
  const requests = useRef(0);
  const slotInitialized = useRef(false);
  const mounted = useRef(true);
  const picking = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const refresh = useCallback(() => {
    const request = ++requests.current;
    void rpc.call("get", null).then(value => {
      if (!mounted.current || request !== requests.current) return;
      if (!slotInitialized.current) {
        slotInitialized.current = true;
        const firstEmpty = Array.from({length:SLOT_COUNT}, (_,i)=>i+1).find(n=>!value.slots.some(s=>s.slot===n)) ?? 1;
        setSlotNumber(firstEmpty); setSlotName(value.slots.find(s=>s.slot===firstEmpty)?.name ?? `Slot ${firstEmpty}`);
      }
      setSnapshot(value);
      if (!dirty.current) setDraft(value.settings);
      notifyChange(value);
    }).catch(cause => { if (mounted.current) setError(message(cause)); });
  }, [rpc]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; picking.current++; }; }, [refresh]);
  useRealtime(CHANGED, refresh);

  function change<K extends keyof BackgroundSettings>(key: K, value: BackgroundSettings[K]) {
    dirty.current = true;
    setDraft(previous => ({ ...previous, [key]: value }));
    setStatus("Unsaved changes");
  }
  async function choose(file: File | undefined) {
    if (!file || saving.current) return;
    saving.current = true;
    const generation = ++picking.current;
    setBusy(true); setError(null);
    try {
      const { dataUrl, resized } = await readImage(file);
      if (!mounted.current || generation !== picking.current) return;
      setUpload({ name: file.name.slice(0, 160), dataUrl }); setRemove(false);
      dirty.current = true; setStatus(resized ? "Image resized and ready — apply to save" : "Image ready — apply to save");
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  function accept(value: Snapshot, text: string) {
    requests.current++;
    notifyChange(value);
    if (!mounted.current) return;
    dirty.current = false;
    setSnapshot(value); setDraft(value.settings); setUpload(null); setRemove(false);
    if (fileInput.current) fileInput.current.value = "";
    setStatus(text);
  }
  async function apply(reset = false, saveSlot = false) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null); setStatus("");
    try {
      const value = reset ? await rpc.call("reset", null) : await rpc.call("apply", {
        settings: draft,
        image: upload ? { action: "replace", ...upload } : remove ? { action: "remove" } : { action: "keep" },
        ...(saveSlot ? { saveSlot: { slot: slotNumber, name: slotName.trim() || `Slot ${slotNumber}` } } : {}),
      });
      accept(value, reset ? "Default background restored; saved slots kept" : saveSlot ? `Saved to slot ${slotNumber}` : value.settings.newThreadOnly ? "Applied to the New thread screen" : "Applied to all threads");
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  async function useSlot(slot: number, deleting = false) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      const value = deleting ? await rpc.call("deleteSlot", {slot}) : await rpc.call("activateSlot", {slot});
      if (deleting) { requests.current++; notifyChange(value); if (mounted.current) { setSnapshot(value); setStatus(`Slot ${slot} cleared`); } }
      else accept(value, `Using ${value.slots.find(s => s.slot === slot)?.name ?? `slot ${slot}`}`);
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  const currentImage = upload?.dataUrl ?? (remove ? null : imageUrl(snapshot?.image ?? null));
  const imageName = upload?.name ?? (!remove ? snapshot?.image?.name : null);
  return (
    <div className="aura-editor">
      <style>{backgroundRules(".aura-preview-scene") + CAPY_CSS}</style>
      <div className="aura-intro">
        <div><p className="aura-eyebrow">MAKE ROOM FOR YOURSELF</p><h2>Your conversations, your backdrop.</h2><p>A little texture. A favorite image. A quieter place to think.</p></div>
        <label className="aura-switch"><input type="checkbox" checked={draft.enabled} disabled={busy || !snapshot} onChange={e => change("enabled", e.target.checked)} /><span>Enabled</span></label>
      </div>
      {error && <p className="aura-error" role="alert">{error}</p>}
      <div className="aura-layout">
        <div className="aura-preview-wrap">
          <div className="aura-preview-scene">
            <CapyPreview settings={draft} image={currentImage} />
            <div className="aura-preview-label"><span className="aura-live-dot"/>LIVE PREVIEW</div>
            <div className="aura-preview-conversation">
              <span className="aura-preview-greeting">Space for your next idea.</span>
              <p>Your messages stay clear, with a soft background behind them.</p>
              <div className="aura-preview-composer"><span>What would you like to make?</span><div><span>＋</span><span className="aura-preview-send">↑</span></div></div>
            </div>
            <span className="aura-preview-footnote">AURA</span>
          </div>
          <p className="aura-caption">{draft.newThreadOnly ? "Only on the New thread screen — existing conversations stay plain." : "Shown in all conversations and on New thread."} Images stay on your BB server.</p>
        </div>
        <fieldset className="aura-controls" disabled={busy || !snapshot}>
          <legend className="aura-sr-only">Background controls</legend>
          <label className="aura-scope"><input type="checkbox" aria-label="New thread screen only" aria-describedby={`${id}-scope-help`} checked={draft.newThreadOnly} onChange={e => change("newThreadOnly", e.target.checked)} /><span><strong>New thread screen only</strong><small id={`${id}-scope-help`}>Hide Aura inside existing conversations.</small></span></label>
          <div className="aura-field">
            <span className="aura-field-title">Your image <span>optional</span></span>
            <button type="button" className="aura-upload" onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void choose(e.dataTransfer.files[0]); }}>
              <span className="aura-upload-icon" aria-hidden="true">↥</span>
              <strong>{imageName ? "Replace image" : "Choose an image"}</strong>
              <span>or drop a PNG / JPG · up to 32 MB · resized automatically</span>
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg" aria-label="Upload background image" className="aura-sr-only" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
            {imageName && <div className="aura-file"><span title={imageName}>{imageName}</span><button type="button" onClick={() => { setUpload(null); setRemove(true); dirty.current = true; setStatus("Unsaved changes"); }}>Remove</button></div>}
          </div>
          <div className="aura-field"><label className="aura-field-title" htmlFor={`${id}-effect`}>Texture</label><select id={`${id}-effect`} value={draft.effect} onChange={e => change("effect", e.target.value as BackgroundSettings["effect"])}><option value="pixels">Capy dithering</option><option value="none">No texture</option></select></div>
          {draft.effect === "pixels" && !currentImage && <><div className="aura-field"><label className="aura-field-title" htmlFor={`${id}-tint`}>Pixel color</label><select id={`${id}-tint`} value={draft.tint} onChange={e => change("tint", e.target.value as BackgroundSettings["tint"])}><option value="lavender">Lavender</option><option value="theme">Follow BB theme</option></select></div>
          <Slider id={`${id}-strength`} label="Texture strength" value={draft.intensity} onChange={v => change("intensity", v)} /></>}
          {currentImage && <><Slider id={`${id}-opacity`} label="Image visibility" value={draft.imageOpacity} max={1} onChange={v => change("imageOpacity", v)} /><Slider id={`${id}-fade`} label="Dim behind composer" value={draft.fade} onChange={v => { change("fade", v); change("dimmerEnabled", v > 0); }} /><div className="aura-field"><label className="aura-field-title" htmlFor={`${id}-fit`}>Image fit</label><select id={`${id}-fit`} value={draft.fit} onChange={e => change("fit", e.target.value as BackgroundSettings["fit"])}><option value="cover">Fill the conversation</option><option value="contain">Show the whole image</option></select></div></>}
        </fieldset>
      </div>
      <section className="aura-library" aria-label="Saved backgrounds">
        <div className="aura-library-heading"><h3>Saved backgrounds</h3><span>Six slots. Switch whenever you like.</span></div>
        <div className="aura-slots">
          {Array.from({length: SLOT_COUNT}, (_, i) => i + 1).map(number => {
            const saved = snapshot?.slots.find(s => s.slot === number);
            const active = snapshot?.activeSlot === number;
            return <div className="aura-slot" key={number} data-active={active ? "true" : undefined}>
              {saved ? <button type="button" className="aura-slot-use" disabled={busy || !snapshot} aria-label={`Use slot ${number}: ${saved.name}`} onClick={() => void useSlot(number)}>
                <span className="aura-slot-art">{saved.image ? <img src={imageUrl(saved.image)!} alt="" /> : <span className="aura-slot-pixels" />}</span>
                <span className="aura-slot-name">{saved.name}</span><small>{active ? "Active" : `Slot ${number} · Use`}</small>
              </button> : <button type="button" className="aura-slot-use aura-slot-empty" disabled={busy || !snapshot} aria-label={`Choose empty slot ${number}`} onClick={() => { setSlotNumber(number); setSlotName(`Slot ${number}`); }}><span>＋</span><strong>Slot {number}</strong><small>Empty</small></button>}
              {saved && <button type="button" className="aura-slot-clear" disabled={busy} aria-label={`Clear slot ${number}: ${saved.name}`} onClick={() => void useSlot(number, true)}>Clear</button>}
            </div>;
          })}
        </div>
        <div className="aura-slot-save">
          <label>Save to<select aria-label="Save to slot" value={slotNumber} disabled={busy || !snapshot} onChange={e => { const n=Number(e.target.value);setSlotNumber(n);setSlotName(snapshot?.slots.find(s=>s.slot===n)?.name ?? `Slot ${n}`); }}>{Array.from({length:SLOT_COUNT},(_,i)=>i+1).map(n=><option key={n} value={n}>Slot {n}{snapshot?.slots.find(s=>s.slot===n) ? ` · ${snapshot.slots.find(s=>s.slot===n)!.name}` : " · Empty"}</option>)}</select></label>
          <label>Name<input aria-label="Slot name" maxLength={60} value={slotName} disabled={busy || !snapshot} onChange={e=>setSlotName(e.target.value)} /></label>
          <button type="button" className="aura-save-slot" disabled={busy || !snapshot} onClick={() => void apply(false, true)}>{snapshot?.slots.some(s=>s.slot===slotNumber) ? `Replace slot ${slotNumber}` : `Save slot ${slotNumber}`}</button>
        </div>
        <p className="aura-caption">Saves the current image and appearance. The New thread screen only setting stays the same when switching slots.</p>
      </section>
      <div className="aura-actions"><button type="button" className="aura-reset" disabled={busy || !snapshot} onClick={() => void apply(true)}>Reset to default</button><span role="status">{busy ? "Saving / processing…" : snapshot ? status : "Loading background…"}</span><button type="button" className="aura-apply" disabled={busy || !snapshot} onClick={() => void apply()}>Apply background</button></div>
    </div>
  );
}
function CapyPreview({ settings, image }: { settings: BackgroundSettings; image: string | null }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const effect = useRef<CapyEffect | null>(null);
  useEffect(() => {
    const parent = anchor.current?.parentElement;
    if (!parent) return;
    const mounted = mountCapyEffect(parent, settings, image);
    effect.current = mounted;
    return () => { mounted.dispose(); effect.current = null; };
  }, []);
  useEffect(() => { effect.current?.update(settings, image); }, [settings, image]);
  return <span ref={anchor} hidden />;
}
function Slider({ id, label, value, max = 1, onChange }: { id: string; label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return <div className="aura-field"><label className="aura-field-title" htmlFor={id}>{label}<output htmlFor={id}>{Math.round(value * 100)}%</output></label><input id={id} type="range" min="0" max={max} step="0.01" value={value} onChange={e => onChange(Number(e.target.value))} /></div>;
}
function NewThreadDimmer() {
  const rpc = useRpc<typeof rpcContract>();
  const [value, setValue] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  const refresh = useCallback(() => {
    void rpc.call("get", null).then(result => { if (mounted.current && !locked.current) setValue(result); }).catch(() => {});
  }, [rpc]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; }; }, [refresh]);
  useRealtime(CHANGED, refresh);
  const dimmed = !!value && value.settings.dimmerEnabled && (!value.image || value.settings.fade > 0);
  async function toggle() {
    if (!value || locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      const result = await rpc.call("setDimmer", { enabled: !dimmed });
      notifyChange(result);
      if (mounted.current) setValue(result);
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  if (!value?.settings.enabled) return null;
  return <span className="aura-dimmer-control"><button type="button" className="aura-dimmer-toggle" aria-label="Dim background" aria-pressed={dimmed} title={dimmed ? "Show full wallpaper" : "Dim wallpaper behind the composer"} disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>void toggle()}><span aria-hidden="true">◐</span><span>Dim</span></button>{error && <span role="alert" className="aura-dimmer-error">{error}</span>}</span>;
}
export default definePluginApp(app => {
  app.composer.customize({ id: "new-thread-dimmer", scopes: ["new-thread"], actions: [{ id: "dimmer", component: NewThreadDimmer }] });
  app.contentScripts.register({ id: "aura-background", mount: ({ signal }) => mountBackground(signal) });
  app.slots.settingsSection({ id: "backgrounds", title: "Aura", component: BackgroundEditor });
  app.slots.threadPanelAction({ id: "backgrounds", title: "Aura", icon: "Image", component: BackgroundEditor, layout: "flush" });
  app.slots.experimental_newThreadPanelAction({ id: "backgrounds", title: "Aura", icon: "Image", component: BackgroundEditor, layout: "flush" });
});
