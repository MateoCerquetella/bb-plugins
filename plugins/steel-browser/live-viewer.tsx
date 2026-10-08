import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Copy, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { MAX_CLIPBOARD_LENGTH, trustedViewerMessage, validatePaste } from "./viewer-protocol.ts";

export function useDocumentVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function LiveViewer({ url, title }: { url: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const copyDeadline = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [reload, setReload] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");

  function send(data: object) {
    frame.current?.contentWindow?.postMessage(data, new URL(url).origin);
  }
  function closePaste() {
    if (input.current) input.current.value = "";
    setPasteOpen(false);
  }
  function paste(text: string) {
    const error = validatePaste(text);
    if (error) { setStatus(error); return; }
    send({ type: "triggerPaste", text });
    closePaste();
    // Steel has no paste acknowledgement: do not claim the website accepted it.
    setStatus("Paste sent to the focused browser field.");
  }
  useEffect(() => {
    setReady(false);
    setStatus("");
    copyDeadline.current = 0;
    const receive = (event: MessageEvent) => {
      if (!trustedViewerMessage(event, frame.current?.contentWindow ?? null, url)) return;
      if (event.data.type === "clipboardBridgeReady") { setReady(true); return; }
      if (event.data.type === "requestClipboardRead") {
        // A remote shortcut opens a local prompt, never a silent clipboard read.
        setPasteOpen(true);
        return;
      }
      if (event.data.type !== "requestClipboardWrite" || Date.now() > copyDeadline.current) return;
      copyDeadline.current = 0;
      clearTimeout(copyTimer.current);
      const { text, requestId } = event.data;
      if (typeof text !== "string" || text.length > MAX_CLIPBOARD_LENGTH || !Number.isSafeInteger(requestId)) return;
      // Only a response to the explicit Copy button may write the local clipboard.
      void (async () => {
        try {
          await navigator.clipboard.writeText(text);
          send({ type: "clipboardWriteResponse", requestId, success: true });
          setStatus("Selection copied.");
        } catch {
          send({ type: "clipboardWriteResponse", requestId, success: false });
          setStatus("Clipboard access denied. Allow clipboard access and try Copy again.");
        }
      })();
    };
    window.addEventListener("message", receive);
    return () => {
      copyDeadline.current = 0;
      clearTimeout(copyTimer.current);
      window.removeEventListener("message", receive);
    };
  }, [url, reload]);
  useEffect(() => {
    if (pasteOpen) { dialog.current?.showModal(); input.current?.focus(); }
    else dialog.current?.close();
  }, [pasteOpen]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pasteOpen) setExpanded(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded, pasteOpen]);

  return <div className={`steel-live${expanded ? " steel-live--expanded" : ""}`}>
    <div className="steel-live__bar">
      <span>{ready ? "Interactive" : "Connecting viewer"}</span>
      <div className="steel-live__tools">
        <button type="button" title="Copy selected browser text" aria-label="Copy selected browser text"
          disabled={!ready} onClick={() => {
            copyDeadline.current = Date.now() + 5000;
            clearTimeout(copyTimer.current);
            setStatus("Copy requested.");
            send({ type: "triggerCopy" });
            copyTimer.current = setTimeout(() => {
              copyDeadline.current = 0;
              setStatus("No selection received. Select text in the browser and try Copy again.");
            }, 5000);
          }}><Copy /></button>
        <button type="button" title="Paste into focused browser field" aria-label="Paste into browser"
          disabled={!ready} onClick={() => { setStatus(""); setPasteOpen(true); }}><ClipboardPaste /></button>
        <button type="button" title="Reload viewer" aria-label="Reconnect live viewer"
          onClick={() => setReload(value => value + 1)}><RefreshCw /></button>
        <button type="button" title={expanded ? "Exit expanded control" : "Take control"}
          aria-label={expanded ? "Exit expanded control" : "Take control"} aria-pressed={expanded}
          onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>
      </div>
    </div>
    <iframe ref={frame} key={`${url}:${reload}`} src={url} title={title}
      allow="clipboard-read; clipboard-write; fullscreen" />
    {status && <p className="steel-live__status" role="status">{status}</p>}
    <dialog ref={dialog} className="steel-paste-dialog" aria-labelledby={`paste-${title}`}
      onCancel={closePaste} onClose={closePaste}>
      <header><h3 id={`paste-${title}`}>Paste into browser</h3>
        <button type="button" title="Close paste" aria-label="Close paste" onClick={closePaste}><X /></button></header>
      <form onSubmit={event => { event.preventDefault(); paste(input.current?.value ?? ""); }}>
        <label>Text for the focused browser field
          <input ref={input} type="password" autoComplete="off" maxLength={MAX_CLIPBOARD_LENGTH}
            aria-label="Text to paste" />
        </label>
        {status && <p role="status">{status}</p>}
        <div className="steel-paste-dialog__actions">
          <button type="button" onClick={async () => {
            try { const text = await navigator.clipboard.readText(); paste(text); }
            catch { setStatus("Clipboard access denied. Paste into the field above, then select Send."); }
          }}>Paste clipboard</button>
          <button type="submit">Send</button>
        </div>
      </form>
    </dialog>
  </div>;
}
