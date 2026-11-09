import "../souls.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";

import { type rpcContract } from "../contract";
import { DoodAvatar } from "./dood";
import { DoodOrb } from "./dood-orb";
import {
  draftIsUnsaved,
  readAuthor,
  readDraft,
  removeDraft,
  writeAuthor,
  writeDraft,
  type SoulDraft,
} from "./draft";
import {
  BOT_ORDER,
  type AuditEntry,
  type AuditResult,
  type BotName,
  type Failure,
  type SoulRecord,
  type StatusResult,
} from "./soul-contract";
import {
  botTitle,
  characterDelta,
  diffLines,
  formatAuditTime,
  missingBots,
  newestAuditForBot,
  orderedSouls,
  soulSummary,
  storedTextMatches,
  toolsForBot,
  verifySavedSoul,
} from "./soul";

type RpcClient = ReturnType<typeof useRpc<typeof rpcContract>>;
type ConfirmStage = "none" | "diff" | "final";

interface SaveNotice {
  kind: "verified" | "partial";
  message: string;
  audit: AuditEntry | null;
  digest: string | null;
}

interface ViewRef {
  selectedBot: BotName | null;
  editor: string;
  original: string;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function failureText(failure: Failure): string {
  if (failure.reason !== "not-running" || failure.startCommand === null) {
    return failure.message;
  }
  return `${failure.message}\n\nStart it with:\n${failure.startCommand}`;
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "primary";
}) {
  return <span className={`fs-badge fs-badge--${tone}`}>{children}</span>;
}

function PanelHeader({
  loading,
  onBack,
  onRefresh,
}: {
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="fs-panel-header">
      <div className="fs-title-block">
        <span className="fs-kicker">Factory Bots · Factory MCP</span>
        <h1>Souls</h1>
        <p>
          The prose each bot is told. Read it, change it deliberately, and keep
          the authority outside it.
        </p>
      </div>
      <div className="fs-header-actions">
        <button type="button" className="fs-link-button fs-back-board" onClick={onBack}>
          ← Board
        </button>
        <Badge tone="primary">Souls only</Badge>
        <button
          type="button"
          className="fs-button"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </header>
  );
}

function OfflineState({
  failure,
  onRetry,
}: {
  failure: Failure;
  onRetry: () => void;
}) {
  return (
    <section className="fs-center-state" aria-labelledby="fs-offline-title">
      <span className="fs-state-icon" aria-hidden="true">
        ⏸
      </span>
      <h2 id="fs-offline-title">Factory is not running</h2>
      <p>{failure.message}</p>
      {failure.startCommand === null ? (
        <p className="fs-muted">
          The Factory MCP config is missing a usable start command.
        </p>
      ) : (
        <>
          <p className="fs-muted">Start the factory, then refresh this panel.</p>
          <pre className="fs-command">
            <code>{failure.startCommand}</code>
          </pre>
        </>
      )}
      <button type="button" className="fs-button" onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="fs-center-state" aria-live="polite">
      <span className="fs-state-icon" aria-hidden="true">
        ◌
      </span>
      <h2>Reading Factory souls…</h2>
      <p className="fs-muted">Connecting to the Factory MCP.</p>
    </section>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="fs-center-state" role="alert">
      <span className="fs-state-icon fs-state-icon--bad" aria-hidden="true">
        !
      </span>
      <h2>Could not read Factory souls</h2>
      <p className="fs-error">{message}</p>
      <button type="button" className="fs-button" onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}

function SoulList({
  souls,
  auditEntries,
  selectedBot,
  onSelect,
}: {
  souls: readonly SoulRecord[];
  auditEntries: readonly AuditEntry[];
  selectedBot: BotName | null;
  onSelect: (bot: BotName) => void;
}) {
  const ordered = orderedSouls(souls);
  const missing = missingBots(souls);

  return (
    <section className="fs-list-panel" aria-labelledby="fs-list-title">
      <div className="fs-section-heading">
        <div>
          <span className="fs-kicker">Bots</span>
          <h2 id="fs-list-title">Souls</h2>
        </div>
        <Badge>{ordered.length} / {BOT_ORDER.length}</Badge>
      </div>

      {missing.length > 0 ? (
        <p className="fs-warning fs-list-warning">
          factory_souls did not return {missing.map(botTitle).join(", ")}. They
          are not shown and were not invented.
        </p>
      ) : null}

      {ordered.length === 0 ? (
        <p className="fs-muted">No souls were returned by the Factory MCP.</p>
      ) : (
        <ul className="fs-soul-list">
          {ordered.map((entry) => {
            const latest = newestAuditForBot(auditEntries, entry.bot);
            const draft = readDraft(entry.bot);
            const unsaved = draftIsUnsaved(draft, entry.soul);
            const selected = entry.bot === selectedBot;
            return (
              <li key={entry.bot}>
                <button
                  type="button"
                  className={`fs-soul-row${selected ? " is-selected" : ""}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(entry.bot as BotName)}
                >
                  <span className="fs-row-top">
                    <span className="fs-row-identity">
                      <span className="fs-row-dood" aria-hidden="true">
                        <DoodAvatar agentId={entry.bot} />
                      </span>
                      <span className="fs-row-name">{botTitle(entry.bot)}</span>
                    </span>
                    {unsaved ? <Badge tone="warn">Unsaved</Badge> : null}
                  </span>
                  <span className="fs-row-summary">{soulSummary(entry.soul)}</span>
                  <span className="fs-row-meta">
                    <span>{entry.soul.length.toLocaleString()} chars</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {latest === null
                        ? "No audit entry"
                        : formatAuditTime(latest.at)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="fs-panel-footnote">
        This panel can reach only factory_status, factory_souls,
        factory_soul_set and factory_soul_audit.
      </p>
    </section>
  );
}

function ToolList({
  tools,
  status,
}: {
  tools: string[] | null;
  status: StatusResult | null;
}) {
  return (
    <aside className="fs-tools" aria-labelledby="fs-tools-title">
      <div className="fs-section-heading fs-section-heading--compact">
        <div>
          <span className="fs-kicker">Authority</span>
          <h3 id="fs-tools-title">Tools</h3>
        </div>
        <Badge>read-only</Badge>
      </div>
      {status === null ? (
        <p className="fs-muted">Reading factory_status…</p>
      ) : !status.ok ? (
        <p className="fs-warning">
          factory_status did not answer: {status.message}
        </p>
      ) : tools === null ? (
        <div className="fs-gap-note">
          <p>Not reported by factory_status.</p>
          <p className="fs-muted">
            The soul is prose. Tool authority is separate and is not inferred
            here.
          </p>
        </div>
      ) : tools.length === 0 ? (
        <p className="fs-muted">factory_status reports no tools for this bot.</p>
      ) : (
        <ul className="fs-tool-list">
          {tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function AuditProof({ entry }: { entry: AuditEntry | null }) {
  if (entry === null) {
    return (
      <div className="fs-audit fs-audit--empty">
        <span className="fs-kicker">Audit</span>
        <p>No audit entry returned for this bot.</p>
      </div>
    );
  }
  return (
    <div className="fs-audit">
      <span className="fs-kicker">Newest audit row</span>
      <dl>
        <div>
          <dt>Author</dt>
          <dd>{entry.author}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatAuditTime(entry.at)}</dd>
        </div>
        <div>
          <dt>Digest</dt>
          <dd className="fs-digest">{entry.digest}</dd>
        </div>
      </dl>
    </div>
  );
}

function DiffReview({
  bot,
  original,
  edited,
  onCancel,
  onContinue,
}: {
  bot: BotName;
  original: string;
  edited: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const lines = useMemo(() => diffLines(original, edited), [original, edited]);
  const delta = characterDelta(original, edited);

  return (
    <section className="fs-review" aria-labelledby="fs-review-title">
      <div className="fs-review-head">
        <div>
          <span className="fs-kicker">First confirmation</span>
          <h2 id="fs-review-title">Review {botTitle(bot)}&apos;s change</h2>
        </div>
        <Badge tone={delta === 0 ? "neutral" : "warn"}>
          {delta > 0 ? "+" : ""}
          {delta} chars
        </Badge>
      </div>
      <p className="fs-muted">
        This is a preview. Nothing has been sent to the factory yet.
      </p>
      <div className="fs-diff-meta">
        <span>{original.length.toLocaleString()} current chars</span>
        <span aria-hidden="true">→</span>
        <span>{edited.length.toLocaleString()} edited chars</span>
      </div>
      <div className="fs-diff" role="region" aria-label="Current versus edited soul">
        <div className="fs-diff-head" aria-hidden="true">
          <span>Before</span>
          <span>After</span>
          <span />
          <span>Text</span>
        </div>
        {lines.map((line, index) => (
          <div
            className={`fs-diff-line fs-diff-line--${line.kind}`}
            key={`${index}-${line.kind}-${line.text}`}
          >
            <span className="fs-diff-gutter">{line.beforeLine ?? ""}</span>
            <span className="fs-diff-gutter">{line.afterLine ?? ""}</span>
            <span className="fs-diff-sign" aria-hidden="true">
              {line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}
            </span>
            <span className="fs-diff-text">
              {line.text === "" ? " " : line.text}
            </span>
          </div>
        ))}
      </div>
      <div className="fs-review-actions">
        <button type="button" className="fs-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="fs-button fs-button--primary"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </section>
  );
}

function ConfirmDialog({
  bot,
  author,
  typedBot,
  acknowledged,
  saving,
  error,
  onTypedBot,
  onAcknowledged,
  onCancel,
  onSave,
  canSave,
  inputRef,
}: {
  bot: BotName;
  author: string;
  typedBot: string;
  acknowledged: boolean;
  saving: boolean;
  error: string | null;
  onTypedBot: (value: string) => void;
  onAcknowledged: (value: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="fs-dialog-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) onCancel();
      }}
    >
      <section
        className="fs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fs-dialog-title"
        aria-describedby="fs-dialog-description"
      >
        <div className="fs-kicker">Second confirmation</div>
        <h2 id="fs-dialog-title">Save {botTitle(bot)}&apos;s soul?</h2>
        <p id="fs-dialog-description" className="fs-dialog-warning">
          This changes what {botTitle(bot)} is told on its very next turn. It
          cannot change code, tools or permissions.
        </p>
        <div className="fs-author-proof">
          <span>Author</span>
          <strong>{author.trim() === "" ? "Required" : author.trim()}</strong>
        </div>
        <label className="fs-field">
          <span>
            Type <strong>{bot}</strong> exactly
          </span>
          <input
            ref={inputRef}
            type="text"
            value={typedBot}
            onChange={(event) => onTypedBot(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={saving}
            placeholder={bot}
          />
        </label>
        <label className="fs-checkbox">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledged(event.target.checked)}
            disabled={saving}
          />
          <span>I understand the next turn uses this text</span>
        </label>
        {error === null ? null : (
          <p className="fs-error" role="alert">
            {error}
          </p>
        )}
        <div className="fs-dialog-actions">
          <button
            type="button"
            className="fs-button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="fs-button fs-button--primary"
            onClick={onSave}
            disabled={!canSave}
          >
            {saving ? "Saving…" : "Save soul"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SoulDetail({
  bot,
  original,
  editor,
  author,
  draft,
  draftRestored,
  draftBaseMoved,
  tools,
  status,
  audit,
  auditEntry,
  saveNotice,
  verified,
  confirmStage,
  typedBot,
  acknowledged,
  saving,
  saveError,
  onEditor,
  onAuthor,
  onReview,
  onCancelReview,
  onContinue,
  onTypedBot,
  onAcknowledged,
  onSave,
  onDiscardDraft,
  onBack,
  canReview,
  canSave,
  inputRef,
}: {
  bot: BotName;
  original: string;
  editor: string;
  author: string;
  draft: SoulDraft | null;
  draftRestored: boolean;
  draftBaseMoved: boolean;
  tools: string[] | null;
  status: StatusResult | null;
  audit: AuditResult | null;
  auditEntry: AuditEntry | null;
  saveNotice: SaveNotice | null;
  verified: boolean;
  confirmStage: ConfirmStage;
  typedBot: string;
  acknowledged: boolean;
  saving: boolean;
  saveError: string | null;
  onEditor: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onAuthor: (event: ChangeEvent<HTMLInputElement>) => void;
  onReview: () => void;
  onCancelReview: () => void;
  onContinue: () => void;
  onTypedBot: (value: string) => void;
  onAcknowledged: (value: boolean) => void;
  onSave: () => void;
  onDiscardDraft: () => void;
  onBack: () => void;
  canReview: boolean;
  canSave: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const unsaved = editor !== original;
  const delta = characterDelta(original, editor);
  const auditError = audit !== null && !audit.ok ? audit.message : null;

  return (
    <section className="fs-detail-panel" aria-labelledby="fs-detail-title">
      <button type="button" className="fs-mobile-back" onClick={onBack}>
        ← All souls
      </button>
      <div className="fs-detail-head">
        <div className="fs-detail-title">
          <span className="fs-detail-dood" aria-hidden="true">
            <DoodOrb agentId={bot} status="idle" size={88} />
          </span>
          <div>
            <span className="fs-kicker">Soul</span>
            <h2 id="fs-detail-title">{botTitle(bot)}</h2>
          </div>
        </div>
        <div className="fs-detail-badges">
          {verified ? <Badge tone="good">Verified saved</Badge> : null}
          {unsaved ? <Badge tone="warn">Unsaved</Badge> : null}
          {draft !== null && draftRestored ? <Badge>Draft restored</Badge> : null}
        </div>
      </div>

      <p className="fs-warning fs-warning--next-turn">
        This changes what {botTitle(bot)} is told on its very next turn. It
        cannot change code, tools or permissions.
      </p>

      {draftRestored ? (
        <div className={`fs-draft-banner${draftBaseMoved ? " fs-draft-banner--moved" : ""}`}>
          <div>
            <strong>Unsaved draft restored.</strong>{" "}
            {draftBaseMoved
              ? "The stored soul changed since this draft began; review the diff before saving."
              : "This text is local to your browser until the save is verified."}
          </div>
          <button type="button" className="fs-link-button" onClick={onDiscardDraft}>
            Discard draft
          </button>
        </div>
      ) : null}

      {saveNotice === null ? null : (
        <div
          className={`fs-save-notice fs-save-notice--${saveNotice.kind}`}
          role={saveNotice.kind === "partial" ? "alert" : "status"}
        >
          <div>
            <strong>
              {saveNotice.kind === "verified"
                ? "Verified saved"
                : "Write accepted, verification incomplete"}
            </strong>
            <p>{saveNotice.message}</p>
          </div>
          {saveNotice.audit === null ? (
            <p className="fs-muted">No new audit row was returned.</p>
          ) : (
            <AuditProof entry={saveNotice.audit} />
          )}
          {saveNotice.digest === null ? null : (
            <p className="fs-save-digest">
              Save receipt: <code>{saveNotice.digest}</code>
            </p>
          )}
        </div>
      )}

      {confirmStage === "diff" ? (
        <DiffReview
          bot={bot}
          original={original}
          edited={editor}
          onCancel={onCancelReview}
          onContinue={onContinue}
        />
      ) : (
        <div className="fs-detail-grid">
          <div className="fs-editor-column">
            <label className="fs-field fs-field--editor" htmlFor="fs-soul-editor">
              <span className="fs-editor-label">
                <span>Full soul</span>
                <span className="fs-muted">
                  {editor.length.toLocaleString()} characters
                  {unsaved ? (
                    <>
                      {" "}
                      · {delta > 0 ? "+" : ""}
                      {delta} from stored
                    </>
                  ) : null}
                </span>
              </span>
              <textarea
                id="fs-soul-editor"
                className="fs-editor"
                value={editor}
                onChange={onEditor}
                spellCheck={false}
                disabled={confirmStage !== "none"}
                aria-describedby="fs-editor-help"
              />
            </label>
            <p id="fs-editor-help" className="fs-muted fs-editor-help">
              The Factory normalizes a single trailing newline when it stores
              the text. The diff shows the exact characters before that
              normalization.
            </p>

            <label className="fs-field fs-author-field" htmlFor="fs-author">
              <span>Change author</span>
              <input
                id="fs-author"
                type="text"
                value={author}
                onChange={onAuthor}
                autoComplete="name"
                placeholder="Your name"
                maxLength={200}
                disabled={confirmStage !== "none"}
              />
            </label>
            <p className="fs-muted fs-editor-help">
              Remembered for this browser session and shown in the final
              confirmation.
            </p>

            <div className="fs-editor-actions">
              <button
                type="button"
                className="fs-button fs-button--primary"
                onClick={onReview}
                disabled={!canReview}
              >
                Review &amp; save
              </button>
              {unsaved ? (
                <button
                  type="button"
                  className="fs-link-button"
                  onClick={onDiscardDraft}
                >
                  Discard draft
                </button>
              ) : null}
            </div>
            {!canReview ? (
              <p className="fs-muted fs-save-hint">
                {editor.trim() === ""
                  ? "The soul cannot be empty."
                  : author.trim() === ""
                    ? "Enter an author before saving."
                    : "Edit the soul to enable review."}
              </p>
            ) : null}
          </div>

          <div className="fs-side-column">
            <ToolList tools={tools} status={status} />
            {auditError === null ? (
              <AuditProof entry={auditEntry} />
            ) : (
              <div className="fs-audit fs-audit--empty">
                <span className="fs-kicker">Audit</span>
                <p className="fs-warning">
                  The audit could not be read: {auditError}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmStage === "final" ? (
        <ConfirmDialog
          bot={bot}
          author={author}
          typedBot={typedBot}
          acknowledged={acknowledged}
          saving={saving}
          error={saveError}
          onTypedBot={onTypedBot}
          onAcknowledged={onAcknowledged}
          onCancel={onCancelReview}
          onSave={onSave}
          canSave={canSave}
          inputRef={inputRef}
        />
      ) : null}
    </section>
  );
}

export function SoulsView({
  factoryId,
  onBack,
}: {
  factoryId: string;
  onBack: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [souls, setSouls] = useState<SoulRecord[]>([]);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState<Failure | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedBot, setSelectedBot] = useState<BotName | null>(null);
  const [editor, setEditor] = useState("");
  const [original, setOriginal] = useState("");
  const [draft, setDraft] = useState<SoulDraft | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftBaseMoved, setDraftBaseMoved] = useState(false);
  const [author, setAuthor] = useState(() => readAuthor());
  const [confirmStage, setConfirmStage] = useState<ConfirmStage>("none");
  const [typedBot, setTypedBot] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [verified, setVerified] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const viewRef = useRef<ViewRef>({ selectedBot, editor, original });
  viewRef.current = { selectedBot, editor, original };

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setLoadError(null);
      setOffline(null);
      try {
        const [soulsResult, statusResult, auditResult] = await Promise.all([
          rpc.call("getSouls", { factoryId }),
          rpc.call("getStatus", { factoryId }),
          rpc.call("getAudit", { factoryId }),
        ]);

        setStatus(statusResult);
        setAudit(auditResult);

        if (!soulsResult.ok) {
          setSouls([]);
          setSelectedBot(null);
          if (soulsResult.reason === "not-running") setOffline(soulsResult);
          else setLoadError(soulsResult.message);
          return;
        }

        setSouls(soulsResult.souls);
        const view = viewRef.current;
        if (view.selectedBot === null) return;
        const next = soulsResult.souls.find(
          (entry) => entry.bot === view.selectedBot,
        );
        if (next === undefined) {
          setSelectedBot(null);
          setEditor("");
          setOriginal("");
          setDraft(null);
          setDraftRestored(false);
          return;
        }
        const currentDraft = readDraft(view.selectedBot);
        if (currentDraft !== null && storedTextMatches(next.soul, view.editor)) {
          setEditor(next.soul);
          setOriginal(next.soul);
          removeDraft(view.selectedBot);
          setDraft(null);
          setDraftRestored(false);
          setDraftBaseMoved(false);
          setVerified(true);
          setSaveNotice(null);
          return;
        }
        if (view.editor === view.original) {
          setEditor(next.soul);
          setOriginal(next.soul);
          removeDraft(view.selectedBot);
          setDraft(null);
          setDraftRestored(false);
          setDraftBaseMoved(false);
        } else {
          setOriginal(next.soul);
          setDraftBaseMoved(
            currentDraft !== null && currentDraft.base !== next.soul,
          );
        }
      } catch (cause) {
        setLoadError(errorText(cause));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [rpc, factoryId],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (confirmStage !== "final") return;
    inputRef.current?.focus();
  }, [confirmStage]);

  useEffect(() => {
    if (confirmStage === "none") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setConfirmStage("none");
        setSaveError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmStage, saving]);

  const openBot = (bot: BotName) => {
    const record = souls.find((entry) => entry.bot === bot);
    if (record === undefined) return;
    const storedDraft = readDraft(bot);
    const shouldRestore = storedDraft !== null && storedDraft.text !== record.soul;
    setSelectedBot(bot);
    setOriginal(record.soul);
    setEditor(shouldRestore ? storedDraft.text : record.soul);
    setDraft(shouldRestore ? storedDraft : null);
    setDraftRestored(shouldRestore);
    setDraftBaseMoved(shouldRestore && storedDraft.base !== record.soul);
    setConfirmStage("none");
    setTypedBot("");
    setAcknowledged(false);
    setSaveError(null);
    setSaveNotice(null);
    setVerified(false);
    if (!shouldRestore) removeDraft(bot);
  };

  const changeEditor = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setEditor(next);
    setConfirmStage("none");
    setSaveError(null);
    setSaveNotice(null);
    setVerified(false);
    if (selectedBot === null) return;
    if (next === original) {
      removeDraft(selectedBot);
      setDraft(null);
      setDraftRestored(false);
      setDraftBaseMoved(false);
      return;
    }
    const nextDraft = writeDraft(selectedBot, next, original);
    setDraft(nextDraft);
  };

  const changeAuthor = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setAuthor(next);
    writeAuthor(next);
  };

  const discardDraft = () => {
    if (selectedBot !== null) removeDraft(selectedBot);
    setEditor(original);
    setDraft(null);
    setDraftRestored(false);
    setDraftBaseMoved(false);
    setConfirmStage("none");
    setSaveError(null);
    setSaveNotice(null);
    setVerified(false);
  };

  const review = () => {
    if (selectedBot === null) return;
    if (
      editor.trim() === "" ||
      author.trim() === "" ||
      editor === original ||
      saving
    ) {
      return;
    }
    setSaveError(null);
    setSaveNotice(null);
    setTypedBot("");
    setAcknowledged(false);
    setConfirmStage("diff");
  };

  const cancelReview = () => {
    if (saving) return;
    setConfirmStage("none");
    setTypedBot("");
    setAcknowledged(false);
    setSaveError(null);
  };

  const continueReview = () => {
    setTypedBot("");
    setAcknowledged(false);
    setSaveError(null);
    setConfirmStage("final");
  };

  const canReview =
    selectedBot !== null &&
    editor.trim() !== "" &&
    author.trim() !== "" &&
    editor !== original &&
    !saving;

  const canSave =
    canReview &&
    confirmStage === "final" &&
    typedBot === selectedBot &&
    acknowledged &&
    !saving;

  const save = async () => {
    if (!canSave || selectedBot === null) return;
    const bot = selectedBot;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await rpc.call("saveSoul", {
        factoryId,
        bot,
        soul: editor,
        author: author.trim(),
      });
      if (!result.ok) {
        setSaveError(failureText(result));
        return;
      }

      const [freshSouls, freshAudit] = await Promise.all([
        rpc.call("getSouls", { factoryId }),
        rpc.call("getAudit", { factoryId }),
      ]);
      const showPartial = (failed: Failure) => {
        setConfirmStage("none");
        setSaveNotice({
          kind: "partial",
          message: `The Factory accepted the write, but ${failed.reason === "not-running" ? "the Factory became unreachable" : "the follow-up read failed"}: ${failureText(failed)}`,
          audit: null,
          digest: result.digest,
        });
      };
      if (!freshSouls.ok) {
        showPartial(freshSouls);
        return;
      }
      if (!freshAudit.ok) {
        showPartial(freshAudit);
        return;
      }

      const verification = verifySavedSoul(
        bot,
        editor,
        freshSouls.souls,
        freshAudit.entries,
      );
      if (verification.record === null || !verification.verified) {
        setConfirmStage("none");
        setSaveNotice({
          kind: "partial",
          message:
            verification.record === null
              ? "The Factory accepted the write, but factory_souls no longer returned this bot."
              : "The Factory accepted the write, but the stored soul does not match the edited text yet.",
          audit: verification.audit,
          digest: result.digest,
        });
        return;
      }

      setSouls(freshSouls.souls);
      setAudit(freshAudit);
      setEditor(verification.record.soul);
      setOriginal(verification.record.soul);
      setDraft(null);
      setDraftRestored(false);
      setDraftBaseMoved(false);
      removeDraft(bot);
      setVerified(true);
      setConfirmStage("none");
      setTypedBot("");
      setAcknowledged(false);
      setSaveNotice({
        kind: "verified",
        message: `${botTitle(bot)}'s soul was re-read and matches the text the Factory stored.`,
        audit: verification.audit,
        digest: result.digest,
      });
    } catch (cause) {
      setSaveError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const selectedRecord = souls.find((entry) => entry.bot === selectedBot) ?? null;
  const auditEntries = audit !== null && audit.ok ? audit.entries : [];
  const auditEntry =
    selectedBot === null ? null : newestAuditForBot(auditEntries, selectedBot);
  const tools =
    selectedBot === null
      ? null
      : toolsForBot(status !== null && status.ok ? status.toolsByBot : null, selectedBot);
  const layoutClass = `fs-layout${selectedBot === null ? "" : " has-selection"}`;

  if (loading && souls.length === 0) {
    return (
      <div className="fs-app">
        <PanelHeader loading={loading} onBack={onBack} onRefresh={() => void load("refresh")} />
        <LoadingState />
      </div>
    );
  }

  if (offline !== null) {
    return (
      <div className="fs-app">
        <PanelHeader
          loading={refreshing}
          onBack={onBack}
          onRefresh={() => void load("refresh")}
        />
        <OfflineState failure={offline} onRetry={() => void load("refresh")} />
      </div>
    );
  }

  if (loadError !== null && souls.length === 0) {
    return (
      <div className="fs-app">
        <PanelHeader
          loading={refreshing}
          onBack={onBack}
          onRefresh={() => void load("refresh")}
        />
        <ErrorState
          message={loadError}
          onRetry={() => void load("refresh")}
        />
      </div>
    );
  }

  return (
    <div className="fs-app">
      <PanelHeader loading={loading || refreshing} onBack={onBack} onRefresh={() => void load("refresh")} />
      {loadError === null ? null : (
        <p className="fs-warning" role="alert">
          Refresh failed; showing the last known souls. {loadError}
        </p>
      )}
      <div className={layoutClass} data-has-selection={selectedBot !== null}>
        <SoulList
          souls={souls}
          auditEntries={auditEntries}
          selectedBot={selectedBot}
          onSelect={openBot}
        />
        <div className="fs-detail-slot">
          {selectedRecord === null || selectedBot === null ? (
            <section className="fs-detail-panel fs-detail-empty">
              <span className="fs-state-icon" aria-hidden="true">
                ◌
              </span>
              <h2>Select a soul</h2>
              <p className="fs-muted">
                Open a bot to read its full text, its tools, and its audit
                history.
              </p>
            </section>
          ) : (
            <SoulDetail
              bot={selectedBot}
              original={original}
              editor={editor}
              author={author}
              draft={draft}
              draftRestored={draftRestored}
              draftBaseMoved={draftBaseMoved}
              tools={tools}
              status={status}
              audit={audit}
              auditEntry={auditEntry}
              saveNotice={saveNotice}
              verified={verified}
              confirmStage={confirmStage}
              typedBot={typedBot}
              acknowledged={acknowledged}
              saving={saving}
              saveError={saveError}
              onEditor={changeEditor}
              onAuthor={changeAuthor}
              onReview={review}
              onCancelReview={cancelReview}
              onContinue={continueReview}
              onTypedBot={setTypedBot}
              onAcknowledged={setAcknowledged}
              onSave={() => void save()}
              onDiscardDraft={discardDraft}
              onBack={() => {
                setSelectedBot(null);
                setConfirmStage("none");
              }}
              canReview={canReview}
              canSave={canSave}
              inputRef={inputRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}
