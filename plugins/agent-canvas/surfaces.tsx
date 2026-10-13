import {useState,useRef,useMemo,useEffect,useCallback} from "react";
import {useRpc,experimental_Icon as Icon} from "@get-bb/plugin-sdk/app";
import {type rpcContract,type Snapshot,browserTargetSchema} from "./contract";
export function BrowserPreview({ browser }: { browser: Snapshot["browsers"][number] }) {
  const rpc = useRpc<typeof rpcContract>();
  const [image, setImage] = useState<{ src: string; key: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(true);
  const pending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const targetKey = JSON.stringify(browser.target);
  const target = useMemo(() => targetKey === "null" ? null : browserTargetSchema.parse(JSON.parse(targetKey)), [targetKey]);
  const capture = useCallback(async () => {
    if (!target || pending.current) return;
    pending.current = true; setBusy(true); setFailed(false);
    try {
      const result = await rpc.call("captureBrowser", target);
      setImage({ src: `data:${result.mimeType};base64,${result.base64}`, key: targetKey, at: Date.now() });
    } catch { setFailed(true); }
    finally { pending.current = false; setBusy(false); }
  }, [rpc, target, targetKey]);
  useEffect(() => { setImage(null); setFailed(false); }, [targetKey]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!target || !visible || !live) return;
    if (document.visibilityState === "visible") void capture();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void capture(); }, 3_000);
    return () => clearInterval(timer);
  }, [capture, target, visible, live]);
  const currentImage = image?.key === targetKey ? image : null;
  return <div className="ac-browser-preview" ref={root}>
    {currentImage ? <img className="ac-browser-image" src={currentImage.src} alt={`Captured browser tab: ${browser.title}`} /> : <div className="ac-browser-placeholder"><Icon name="Globe" /></div>}
    {target ? <div className="ac-preview-controls">
      <label title="Refresh visible captures every three seconds"><input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />Live capture</label>
      <span>{failed ? "Unavailable" : currentImage ? new Date(currentImage.at).toLocaleTimeString() : "Connecting"}</span>
      <button className="ac-icon" title="Refresh capture" aria-label="Refresh browser capture" disabled={busy} onClick={() => void capture()}><Icon name="RotateCcw" /></button>
    </div> : <span>Saved tab · live capture unavailable</span>}
    {failed && <span role="alert">Capture unavailable. Last image may be stale.</span>}
  </div>;
}
