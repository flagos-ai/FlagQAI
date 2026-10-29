import { useState } from "react";
import { Modal } from "./Modal";
import { CloseButton } from "./CloseButton";
import { useAgentSettings } from "../hooks/useAgentSettings";
import type { AgentConversation } from "../hooks/useAgentConversation";
export function AgentSettings({
  agent,
  initialTab,
  onClose,
}: {
  agent: AgentConversation;
  initialTab: "models" | "providers";
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("");
  const settings = useAgentSettings(agent),
    { providers, models, form, setForm } = settings;
  const locked =
    agent.busy ||
    agent.sending ||
    agent.view.working ||
    !!Object.keys(agent.view.permissions).length ||
    !!Object.keys(agent.view.questions).length;
  const modelKey = (provider: string | undefined, id: string) =>
    JSON.stringify([provider || "", id]);
  const chosen = models?.models.find(
    (m) => modelKey(m.provider, m.id) === selected,
  );
  const configured = providers?.configured.find((p) => p.route === form.route);
  return (
    <Modal
      className="fq-agent-settings-dialog"
      label="Models and providers"
      onClose={onClose}
    >
      <header>
        <h2>Models & providers</h2>
        <CloseButton label="Close Agent settings" onClick={onClose} />
      </header>
      <nav aria-label="Agent settings sections">
        <button
          className={tab === "models" ? "selected" : ""}
          aria-pressed={tab === "models"}
          onClick={() => setTab("models")}
        >
          Models
        </button>
        <button
          className={tab === "providers" ? "selected" : ""}
          aria-pressed={tab === "providers"}
          onClick={() => setTab("providers")}
        >
          Providers
        </button>
        <button
          className="push"
          disabled={settings.busy}
          onClick={() => void settings.load()}
        >
          Refresh
        </button>
      </nav>
      {settings.error && (
        <p role="alert" className="fq-settings-error">
          {settings.error}
        </p>
      )}
      {settings.notice && <p role="status">{settings.notice}</p>}
      {settings.busy && <p role="status">Working…</p>}
      {tab === "models" ? (
        <>
          <p>
            Current:{" "}
            <strong>
              {models?.current?.provider ? models.current.provider + " / " : ""}
              {models?.current?.model ||
                agent.view.model ||
                "No active session"}
            </strong>
          </p>
          {!agent.session && (
            <p>
              Connect an Agent session to choose its model. Providers can be
              configured first.
            </p>
          )}
          {agent.session && models?.available === false && (
            <p>Model selection is unavailable for this backend.</p>
          )}
          <label>
            Search models
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Provider or model name"
            />
          </label>
          <div
            className="fq-settings-model-list"
            role="radiogroup"
            aria-label="Available Agent models"
          >
            {models?.models
              .filter((m) =>
                (m.id + " " + m.label + " " + m.provider)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((m) => (
                <label key={modelKey(m.provider, m.id)}>
                  <input
                    type="radio"
                    name="agent-model"
                    aria-label={(m.provider ? m.provider + " / " : "") + m.id}
                    value={modelKey(m.provider, m.id)}
                    disabled={locked || settings.busy}
                    checked={selected === modelKey(m.provider, m.id)}
                    onChange={() => setSelected(modelKey(m.provider, m.id))}
                  />
                  <span>
                    <strong>{m.label || m.id}</strong>
                    <small>
                      {m.provider ? m.provider + " / " : ""}
                      {m.id}
                    </small>
                  </span>
                  {models.current?.model === m.id &&
                    models.current?.provider === m.provider && (
                      <small>Current</small>
                    )}
                </label>
              ))}
            {models && !models.models.length && (
              <p>No models configured. Add a Provider to get started.</p>
            )}
          </div>
          {locked && (
            <p>
              Finish the current turn and pending decisions before switching
              models.
            </p>
          )}
          <footer>
            <button onClick={() => setTab("providers")}>
              Configure provider
            </button>
            <button
              className="primary"
              disabled={!chosen || locked || settings.busy}
              onClick={async () => {
                if (
                  chosen &&
                  (await agent.switchModel({
                    provider: chosen.provider,
                    model: chosen.id,
                  }))
                )
                  onClose();
              }}
            >
              Use selected model
            </button>
          </footer>
        </>
      ) : (
        <>
          <p>
            Uses the same local configuration as CLI <code>/provider</code>.
            Saving also sets the first model below as the default for new
            sessions.
          </p>
          {providers?.available === false ? (
            <p>Provider configuration is unavailable in this service.</p>
          ) : (
            <>
              <div className="fq-settings-provider-list">
                {providers?.configured.map((p) => (
                  <button
                    key={p.route}
                    disabled={settings.busy}
                    onClick={() => settings.selectProvider(p.route, p.kind)}
                  >
                    {p.route}
                    <small>
                      {p.keyConfigured ? "Key configured" : "No stored key"} ·{" "}
                      {p.models.length} models
                    </small>
                  </button>
                ))}
              </div>
              <fieldset
                disabled={settings.busy || locked || !providers?.available}
              >
                <label>
                  Provider type
                  <select
                    value={form.kind}
                    onChange={(e) =>
                      settings.selectProvider(
                        e.target.value === "catalog"
                          ? providers?.catalog[0]?.route || ""
                          : "",
                        e.target.value as "catalog" | "custom",
                      )
                    }
                  >
                    <option value="catalog">Built-in provider</option>
                    <option value="custom">Custom endpoint</option>
                  </select>
                </label>
                <label>
                  Provider
                  {form.kind === "catalog" ? (
                    <select
                      value={form.route}
                      onChange={(e) =>
                        settings.selectProvider(e.target.value, "catalog")
                      }
                    >
                      {providers?.catalog.map((p) => (
                        <option key={p.route} value={p.route}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={form.route}
                      onChange={(e) =>
                        setForm({ ...form, route: e.target.value })
                      }
                      placeholder="my-provider"
                      autoComplete="off"
                    />
                  )}
                </label>
                <label>
                  Base URL{" "}
                  {form.kind === "catalog" ? "(optional override)" : ""}
                  <input
                    type="url"
                    value={form.baseURL}
                    onChange={(e) =>
                      setForm({ ...form, baseURL: e.target.value })
                    }
                    placeholder="https://api.example.com/v1"
                    autoComplete="off"
                  />
                </label>
                <label>
                  API protocol
                  <select
                    value={form.api}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        api: e.target.value as typeof form.api,
                      })
                    }
                  >
                    {form.kind === "catalog" && (
                      <option value="">Provider default</option>
                    )}
                    <option value="openai-completions">
                      OpenAI Chat Completions
                    </option>
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="anthropic-messages">
                      Anthropic Messages
                    </option>
                  </select>
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) =>
                      setForm({ ...form, apiKey: e.target.value })
                    }
                    placeholder={
                      configured?.keyConfigured
                        ? "Leave blank to keep configured key"
                        : "Enter key if required"
                    }
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                </label>
                <small>
                  Keys are stored by the local Harness, never returned or saved
                  in browser storage. Discovery contacts the selected provider.
                </small>
                <button
                  disabled={
                    !form.route.trim() ||
                    (form.kind === "custom" && !form.baseURL.trim())
                  }
                  onClick={() => void settings.discover()}
                >
                  Discover models
                </button>
                {!!settings.discovered.length && (
                  <div className="fq-settings-discovered">
                    {settings.discovered.map((m) => {
                      const ids = form.models
                          .split(/[\n,]+/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                        checked = ids.includes(m.id);
                      return (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm({
                                ...form,
                                models: (checked
                                  ? ids.filter((id) => id !== m.id)
                                  : [...ids, m.id]
                                ).join("\n"),
                              })
                            }
                          />
                          {m.name || m.id}
                        </label>
                      );
                    })}
                  </div>
                )}
                <label>
                  Model IDs (one per line; first is default)
                  <textarea
                    aria-label="Provider model IDs"
                    rows={3}
                    value={form.models}
                    onChange={(e) =>
                      setForm({ ...form, models: e.target.value })
                    }
                    placeholder="model-id"
                    spellCheck={false}
                  />
                </label>
                <footer>
                  <button
                    className="primary"
                    disabled={
                      !form.route.trim() ||
                      !form.models.trim() ||
                      (form.kind === "custom" && !form.baseURL.trim())
                    }
                    onClick={() => void settings.save()}
                  >
                    Save provider
                  </button>
                </footer>
              </fieldset>
              {locked && (
                <p>
                  Finish the current turn and pending decisions before saving
                  configuration.
                </p>
              )}
            </>
          )}
        </>
      )}
      {agent.error && (
        <p role="alert" className="fq-settings-error">
          {agent.error}
        </p>
      )}
    </Modal>
  );
}
