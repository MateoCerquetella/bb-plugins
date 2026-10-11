import { preparationRequestGate } from './request-gate.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useRpc,
  type PluginAppBuilder,
  type PluginNewThreadPanelProps,
  type PluginThreadPanelProps,
  type PluginThreadHeaderActionProps
} from '@get-bb/plugin-sdk/app';
import { preparationRpc, sandboxHtml, type Preparation } from './contract.js';
import { taskboardRpcContract, type WorkItem } from '../contract.js';
import { Button } from '../components/ui/button.js';
import './style.css';
const actionId = 'prepare-work';
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function usePreparation(id: string | null, projectId: string | null) {
  const rpc = useRpc<typeof preparationRpc>();
  const [value, setValue] = useState<Preparation | null>(null);
  const [error, setError] = useState('');
  const gate = useRef(preparationRequestGate());
  const setP = useCallback(
    (next: Preparation) => {
      if (next.id !== id || next.projectId !== projectId) return;
      gate.current.invalidate(); // In-flight reads must not undo this mutation.
      setValue((current) =>
        current?.id === next.id &&
        (current.brief.revision > next.brief.revision ||
          current.updatedAt > next.updatedAt)
          ? current
          : next
      );
    },
    [id, projectId]
  );
  useEffect(() => {
    let alive = true;
    let loading = false;
    setValue(null);
    setError('');
    gate.current.invalidate();
    const refresh = async () => {
      if (!id || !projectId || loading) return;
      loading = true;
      const accept = gate.current.begin({ id, projectId });
      try {
        const next = await rpc.call('prepareGet', { id, projectId });
        if (alive && accept(next)) {
          setValue((current) =>
            current?.id === next.id &&
            (current.brief.revision > next.brief.revision ||
              current.updatedAt > next.updatedAt)
              ? current
              : next
          );
          setError('');
        }
      } catch (e) {
        if (alive && accept()) setError(errorText(e));
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => {
      alive = false;
      gate.current.invalidate();
      clearInterval(timer);
    };
  }, [rpc, id, projectId]);
  // Never render an editor unless its displayed document matches mutation scope,
  // even during the render before an effect cleanup has run.
  const p = value?.id === id && value?.projectId === projectId ? value : null;
  return { p, setP, error };
}
function ArmPreparation({
  onCreated
}: {
  onCreated?: (p: Preparation) => void;
}) {
  const rpc = useRpc<typeof preparationRpc>();
  const composer = useComposer();
  const view = useComposerView();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const projectId =
    view.scope.kind === 'new-thread' ? view.scope.projectId : null;
  const arm = async () => {
    if (!projectId || !composer.text.trim() || busy) return;
    setBusy(true);
    try {
      const p = await rpc.call('prepareCreate', {
        projectId,
        request: composer.text.trim()
      });
      composer.insertMention({
        provider: 'preparation',
        id: p.id,
        label: 'Prepare work'
      });
      composer.focus();
      setStatus('Attached. Send your message normally to begin.');
      onCreated?.(p);
    } catch (e) {
      setStatus(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (view.scope.kind !== 'new-thread') return null;
  return (
    <span className="prep-arm">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !projectId || view.draft.isEmpty}
        onClick={() => void arm()}
      >
        {busy ? 'Attaching…' : 'Prepare work'}
      </Button>
      {status && (
        <span role="status" className="prep-hint">
          {status}
        </span>
      )}
    </span>
  );
}
function PrepareNew(props: PluginNewThreadPanelProps) {
  return <PrepareNewBody key={props.projectId ?? 'no-project'} {...props} />;
}
function PrepareNewBody({ projectId }: PluginNewThreadPanelProps) {
  const rpc = useRpc<typeof preparationRpc>();
  const navigate = useBbNavigate();
  const [list, setList] = useState<
    {
      id: string;
      title: string;
      threadId: string | null;
      ready: boolean;
      updatedAt: string;
    }[]
  >([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setSelected(null);
    if (!projectId) {
      setList([]);
      return;
    }
    let alive = true;
    const refresh = () =>
      rpc
        .call('prepareList', { projectId })
        .then((v) => {
          if (alive) setList(v);
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        });
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [rpc, projectId]);
  return (
    <div className="prep" data-testid="prepare-new">
      <header>
        <h2>Prepare work</h2>
        <p>
          Use your New thread message and its selected settings. Explore the
          change before implementation.
        </p>
      </header>
      {!projectId ? (
        <p>Choose a project in New thread.</p>
      ) : (
        <>
          <div className="prep-box">
            <p>
              Write your request in the existing composer, attach Prepare work,
              then send.
            </p>
            <ArmPreparation onCreated={(p) => setSelected(p.id)} />
          </div>
          {error && <p role="alert">{error}</p>}
          <h3>Saved preparations</h3>
          {!list.length && (
            <p className="prep-muted">
              Your briefs and prototype decisions will appear here.
            </p>
          )}
          {list.map((p) => (
            <button
              className="prep-list-item"
              key={p.id}
              onClick={() => setSelected(p.id)}
            >
              <span>{p.title}</span>
              <small>
                {p.ready
                  ? 'Ready'
                  : p.threadId
                    ? 'In preparation'
                    : 'Awaiting Send'}
              </small>
            </button>
          ))}
          {selected && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const t = list.find((p) => p.id === selected)?.threadId;
                  if (t) navigate.toThread(t);
                }}
              >
                Open linked conversation
              </Button>
              <PreparationWorkspace
                key={`${projectId}:${selected}`}
                id={selected}
                projectId={projectId}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
function PrepareThread({ threadId }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof preparationRpc>();
  const [p, setP] = useState<Preparation | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      rpc
        .call('prepareForThread', { threadId })
        .then((v) => {
          if (alive) setP(v);
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        });
    void refresh();
    const t = setInterval(() => void refresh(), 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [threadId, rpc]);
  return p?.threadId === threadId ? (
    <PreparationWorkspace
      key={`${p.projectId}:${p.id}`}
      id={p.id}
      projectId={p.projectId}
    />
  ) : (
    <div className="prep">
      <h2>Prepare work</h2>
      <p>
        {error ||
          'Waiting for the preparation agent to attach this conversation. Use Prepare work in New thread to start a new brief.'}
      </p>
    </div>
  );
}
function PrepareHeader({ threadId }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof preparationRpc>();
  const nav = useBbNavigate();
  const opened = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () =>
      rpc
        .call('prepareForThread', { threadId })
        .then((p) => {
          if (!alive) return;
          setVisible(Boolean(p));
          if (p && opened.current !== threadId) {
            if (nav.openThreadPanel({ actionId, title: 'Prepare work' }))
              opened.current = threadId;
          }
        })
        .catch(() => {});
    void check();
    const t = setInterval(() => void check(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [rpc, nav, threadId]);
  return visible ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => nav.openThreadPanel({ actionId, title: 'Prepare work' })}
    >
      Prepare work
    </Button>
  ) : null;
}
function TaskLink({
  p,
  onChange
}: {
  p: Preparation;
  onChange: (p: Preparation) => void;
}) {
  const rpc = useRpc<typeof preparationRpc>();
  const tasks = useRpc<typeof taskboardRpcContract>();
  const navigate = useBbNavigate();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [label, setLabel] = useState('Taskboard connection');
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const { config } = await tasks.call('getProjectConfig', {
        projectId: p.projectId
      });
      setLabel(
        config.source === 'github'
          ? `GitHub · ${config.githubRepos.join(', ') || 'no repositories'}`
          : config.source === 'linear'
            ? `Linear · ${config.linearTeamKey || 'not configured'}`
            : `Jira · ${config.jiraBaseUrl || 'not configured'}`
      );
      const result = await tasks.call('listItems', {
        projectId: p.projectId,
        limit: 100
      });
      setItems(result.items);
      setError('');
    } catch (e) {
      setError(
        'Connection unavailable; preparation can continue. ' + errorText(e)
      );
    }
  };
  const link = async (key: string) => {
    try {
      const item = items.find((i) => `${i.source}:${i.locator}` === key);
      onChange(
        await rpc.call('prepareLink', {
          id: p.id,
          projectId: p.projectId,
          task: item ? { source: item.source, locator: item.locator } : null
        })
      );
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
      className="prep-box"
    >
      <summary>Linked task · {p.linkedTask?.key || 'optional'}</summary>
      <p className="prep-muted">{label}</p>
      <select
        aria-label="Link an existing Taskboard task"
        value={
          p.linkedTask ? `${p.linkedTask.source}:${p.linkedTask.locator}` : ''
        }
        onChange={(e) => void link(e.target.value)}
      >
        <option value="">No linked task</option>
        {p.linkedTask &&
          !items.some((i) => i.locator === p.linkedTask?.locator) && (
            <option value={`${p.linkedTask.source}:${p.linkedTask.locator}`}>
              {p.linkedTask.key} · {p.linkedTask.title}
            </option>
          )}
        {items.map((i) => (
          <option
            key={`${i.source}:${i.locator}`}
            value={`${i.source}:${i.locator}`}
          >
            {i.key} · {i.title}
          </option>
        ))}
      </select>
      {p.linkedTask && (
        <a href={p.linkedTask.url} target="_blank" rel="noreferrer">
          Open {p.linkedTask.key}
        </a>
      )}
      <p className="prep-hint">
        Uses Taskboard’s existing connection and cached tasks. Linking makes no
        tracker changes.
      </p>
      {!items.length && !error && (
        <p className="prep-hint">
          No cached tasks for this project. Open Taskboard to load its tasks;
          preparation can continue.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          navigate.toPluginPanel('tasks', {
            subPath: `manage/${encodeURIComponent(p.projectId)}`
          })
        }
      >
        Taskboard settings
      </Button>
    </details>
  );
}
function PrototypePreview({
  p,
  versionId
}: {
  p: Preparation;
  versionId: string;
}) {
  const rpc = useRpc<typeof preparationRpc>();
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setHtml('');
    void rpc
      .call('prepareHtml', { id: p.id, projectId: p.projectId, versionId })
      .then((v) => {
        if (alive) setHtml(v.html);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [p.id, p.projectId, versionId, rpc]);
  return error ? (
    <p role="alert">{error}</p>
  ) : html ? (
    <iframe
      title="Interactive prototype"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={sandboxHtml(html)}
      className="prep-preview"
    />
  ) : (
    <p>Loading preview…</p>
  );
}
function PreparationWorkspace({
  id,
  projectId
}: {
  id: string;
  projectId: string;
}) {
  const rpc = useRpc<typeof preparationRpc>();
  const nav = useBbNavigate();
  const { p, setP, error: loadError } = usePreparation(id, projectId);
  const [tab, setTab] = useState('brief');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [baseRevision, setBaseRevision] = useState(-1);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(2);
  const [direction, setDirection] = useState('');
  const [message, setMessage] = useState('');
  const [refineId, setRefineId] = useState<string | null>(null);
  const [viewVersions, setViewVersions] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState(false);
  const [packet, setPacket] = useState<{
    markdown: string;
    prototypeHtml: string | null;
    json: string;
  } | null>(null);
  useEffect(() => {
    setDirty(false);
    setBaseRevision(-1);
    setPacket(null);
  }, [id]);
  useEffect(() => {
    if (p && !dirty) {
      setTitle(p.brief.title);
      setDescription(p.brief.description);
      setBaseRevision(p.brief.revision);
    }
  }, [p?.brief.revision, p?.id, dirty]);
  async function run(fn: () => Promise<Preparation>) {
    setBusy(true);
    setError('');
    try {
      setP(await fn());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!p)
    return (
      <div className="prep">
        <p role={loadError ? 'alert' : 'status'}>
          {loadError || 'Loading preparation…'}
        </p>
      </div>
    );
  const scope = { id, projectId };
  const pending = p.jobs.filter((j) =>
    ['queued', 'starting', 'running'].includes(j.status)
  );
  const alternatives = [
    ...new Set(
      p.jobs.filter((j) => j.alternativeId).map((j) => j.alternativeId!)
    )
  ];
  return (
    <div className="prep" data-testid="preparation-workspace">
      <header>
        <div className="prep-row">
          <h2>{p.brief.title}</h2>
          <span className="prep-tag">
            {p.ready ? 'Ready' : `Brief r${p.brief.revision}`}
          </span>
        </div>
        <p className="prep-hint">
          {p.execution
            ? `${p.execution.providerId} · ${p.execution.model} · ${p.execution.reasoningLevel} · ${p.execution.permissionMode}`
            : 'Uses your New thread settings after Send'}
        </p>
        {p.context && (
          <p className="prep-hint">
            {p.context.root} · {p.context.commit.slice(0, 8)}
          </p>
        )}
        {!p.threadId && (
          <p className="prep-note">
            Send your New thread message with the attached Prepare work
            reference to begin investigation.
          </p>
        )}
      </header>
      <nav className="prep-tabs">
        {['brief', 'sources', 'prototypes', 'history'].map((t) => (
          <button key={t} data-active={tab === t} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
            {t === 'prototypes' && ` (${alternatives.length})`}
          </button>
        ))}
      </nav>
      {(error || loadError) && (
        <p role="alert" className="prep-error">
          {error || loadError}
        </p>
      )}
      {pending.length > 0 && (
        <div className="prep-note" role="status">
          {pending.map((j) => (
            <div key={j.id}>
              {j.kind === 'brief' ? 'Brief' : 'Prototype'} ·{' '}
              {j.status === 'starting' && !p.context
                ? 'Reading repository context'
                : j.status}
              {j.threadId && (
                <button onClick={() => nav.toThread(j.threadId!)}>
                  View agent
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {p.jobs
        .filter((j) => j.status === 'failed')
        .map((j) => (
          <div className="prep-error" key={j.id}>
            <p>
              {j.kind} failed: {j.error}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || pending.length > 0}
              onClick={() =>
                void run(() =>
                  rpc.call('prepareRetry', { ...scope, jobId: j.id })
                )
              }
            >
              Retry this {j.kind}
            </Button>
            {j.threadId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => nav.toThread(j.threadId!)}
              >
                Open agent thread
              </Button>
            )}
          </div>
        ))}
      {tab === 'brief' && (
        <section>
          <label>
            Title
            <input
              aria-label="Brief title"
              disabled={busy}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label="Brief description"
              disabled={busy}
              rows={17}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
              placeholder="The repository investigation will produce your editable brief here."
            />
          </label>
          <div className="prep-row">
            <span className="prep-hint">
              {dirty ? 'Unsaved edits' : 'Saved'}
              {dirty && baseRevision !== p.brief.revision
                ? ' · a newer revision is available; copy your edits before reloading'
                : ''}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={busy || !dirty}
              onClick={() => {
                void run(async () => {
                  const result = await rpc.call('prepareEdit', {
                    ...scope,
                    expectedRevision: baseRevision,
                    title,
                    description
                  });
                  setDirty(false);
                  return result;
                });
              }}
            >
              Save changes
            </Button>
          </div>
          {p.proposals.map((b) => (
            <details className="prep-box" key={b.revision}>
              <summary>Agent proposal · review before applying</summary>
              <h3>{b.title}</h3>
              <pre>{b.description}</pre>
              <Button
                type="button"
                disabled={busy || dirty}
                onClick={() =>
                  void run(() =>
                    rpc.call('prepareApply', {
                      ...scope,
                      revision: b.revision,
                      expectedRevision: p.brief.revision
                    })
                  )
                }
              >
                Apply proposal
              </Button>
            </details>
          ))}
          <TaskLink p={p} onChange={setP} />
          <details className="prep-box">
            <summary>Original request</summary>
            <pre>{p.request}</pre>
          </details>
        </section>
      )}
      {tab === 'sources' && (
        <section>
          <h3>Repository context</h3>
          {!p.context ? (
            <p>Sources appear after investigation.</p>
          ) : (
            <>
              {p.context.notes.map((n, i) => (
                <p className="prep-muted" key={i}>
                  {n}
                </p>
              ))}
              <details className="prep-box">
                <summary>
                  Broad inventory · {p.context.totalPaths} eligible paths
                </summary>
                <pre>{p.context.inventory.join('\n')}</pre>
              </details>
              {p.context.sources.map((s) => (
                <details className="prep-box" key={s.path}>
                  <summary>
                    {s.path}:{s.start}–{s.end}
                  </summary>
                  <small>sha256 {s.sha256}</small>
                  <pre>{s.excerpt}</pre>
                </details>
              ))}
            </>
          )}
        </section>
      )}
      {tab === 'prototypes' && (
        <section>
          <h3>Explore alternatives</h3>
          <div className="prep-generation">
            <label>
              Alternatives
              <input
                aria-label="Prototype count"
                type="number"
                min={1}
                max={4}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
              <small>1–4 per run</small>
            </label>
            <label>
              Design direction · optional
              <input
                aria-label="Design direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder="Layout, interaction, or emphasis"
              />
            </label>
          </div>
          <div className="prep-row">
            <Button
              type="button"
              disabled={
                busy ||
                dirty ||
                !p.context ||
                !p.brief.description ||
                pending.length > 0
              }
              onClick={() =>
                void run(() =>
                  rpc.call('prepareGenerate', { ...scope, count, direction })
                )
              }
            >
              Generate prototypes
            </Button>
            <label className="prep-inline">
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => setCompare(e.target.checked)}
              />
              Compare
            </label>
          </div>
          <p className="prep-hint">
            Next generation uses saved brief r{p.brief.revision}. Versions are
            preserved. Preview code runs in an isolated frame.
          </p>
          <div
            className={
              compare ? 'prep-alternatives compare' : 'prep-alternatives'
            }
          >
            {alternatives.map((alternativeId, i) => {
              const versions = p.versions.filter(
                (v) => v.alternativeId === alternativeId
              );
              const version =
                versions.find((v) => v.id === viewVersions[alternativeId]) ??
                versions.at(-1);
              return (
                <article
                  className="prep-prototype"
                  data-selected={p.selection === version?.id}
                  key={alternativeId}
                >
                  <div className="prep-row">
                    <h3>{version?.name || `Alternative ${i + 1}`}</h3>
                    {version && (
                      <select
                        aria-label={`Alternative ${i + 1} version`}
                        value={version.id}
                        onChange={(e) =>
                          setViewVersions((v) => ({
                            ...v,
                            [alternativeId]: e.target.value
                          }))
                        }
                      >
                        {versions.map((v, n) => (
                          <option key={v.id} value={v.id}>
                            v{n + 1} · brief r{v.briefRevision}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {version ? (
                    <>
                      <p>{version.explanation}</p>
                      <PrototypePreview p={p} versionId={version.id} />
                      <div className="prep-row">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || dirty}
                          variant={
                            p.selection === version.id ? 'default' : 'outline'
                          }
                          onClick={() =>
                            void run(() =>
                              rpc.call('prepareSelect', {
                                ...scope,
                                versionId: version.id
                              })
                            )
                          }
                        >
                          {p.selection === version.id
                            ? 'Selected'
                            : 'Select version'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRefineId(version.id);
                            document
                              .getElementById(`prep-message-${id}`)
                              ?.focus();
                          }}
                        >
                          Refine this version
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="prep-muted">
                      {
                        p.jobs
                          .filter((j) => j.alternativeId === alternativeId)
                          .at(-1)?.status
                      }{' '}
                      · artifact appears when the agent finishes.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {tab === 'history' && (
        <section>
          <h3>Brief versions</h3>
          {[...p.history, p.brief].reverse().map((b) => (
            <details className="prep-box" key={b.revision}>
              <summary>
                r{b.revision} · {b.author} · {new Date(b.at).toLocaleString()}
              </summary>
              <h3>{b.title}</h3>
              <pre>{b.description}</pre>
            </details>
          ))}
        </section>
      )}
      <section className="prep-conversation">
        <h3>Conversation</h3>
        <div className="prep-messages">
          {p.messages.map((m, i) => (
            <div data-role={m.role} key={i}>
              <small>{m.role === 'user' ? 'You' : 'Agent'}</small>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
        <label>
          {refineId ? 'Refine prototype version' : 'Refine the brief'}
          <textarea
            id={`prep-message-${id}`}
            aria-label="Preparation refinement"
            disabled={busy}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what should change or stay the same"
          />
        </label>
        <div className="prep-row">
          {refineId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRefineId(null)}
            >
              Back to brief
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={
              busy ||
              dirty ||
              !message.trim() ||
              pending.length > 0 ||
              !p.context
            }
            onClick={() =>
              void run(async () => {
                const result = await rpc.call('prepareRefine', {
                  ...scope,
                  message,
                  ...(refineId ? { versionId: refineId } : {})
                });
                setMessage('');
                setRefineId(null);
                return result;
              })
            }
          >
            Send refinement
          </Button>
        </div>
      </section>
      <footer className="prep-row">
        <span className="prep-hint">
          Preparation only · implementation has not started
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || dirty || !p.selection || pending.length > 0}
          onClick={() =>
            void run(() =>
              rpc.call('prepareReady', {
                ...scope,
                expectedRevision: p.brief.revision
              })
            )
          }
        >
          {p.ready ? 'Ready ✓' : 'Mark ready'}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || dirty || !p.ready}
          onClick={() => {
            setError('');
            void rpc
              .call('prepareExport', scope)
              .then(setPacket)
              .catch((e) => setError(errorText(e)));
          }}
        >
          Export for Empirical
        </Button>
      </footer>
      {packet && (
        <section className="prep-box">
          <h3>Preparation packet</h3>
          <p>
            Input for Empirical’s specification and prototype decisions. Export
            starts no implementation and claims no gates passed.
          </p>
          <div className="prep-row">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                download('preparation.md', packet.markdown, 'text/markdown')
              }
            >
              Download brief
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                download('preparation.json', packet.json, 'application/json')
              }
            >
              Download full packet
            </Button>
            {packet.prototypeHtml && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  download(
                    'prototype.html',
                    sandboxHtml(packet.prototypeHtml!),
                    'text/html'
                  )
                }
              >
                Download prototype
              </Button>
            )}
          </div>
          <details>
            <summary>Read packet</summary>
            <pre>{packet.markdown}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
export function registerPreparationApp(app: PluginAppBuilder) {
  app.slots.experimental_newThreadPanelAction({
    id: 'prepare-work-new',
    title: 'Prepare work',
    icon: 'Target',
    component: PrepareNew,
    layout: 'flush'
  });
  app.slots.threadPanelAction({
    id: actionId,
    title: 'Prepare work',
    icon: 'Target',
    component: PrepareThread,
    layout: 'flush'
  });
  app.slots.experimental_threadHeaderAction({
    id: 'prepare-work-header',
    title: 'Prepare work',
    component: PrepareHeader
  });
}
