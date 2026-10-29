import { useEffect, useRef, useState } from "react";
import type { ProviderState } from "../../../../packages/sdk/index.d.ts";
import { harnessClient } from "../api/harness";
import type { AgentConversation } from "./useAgentConversation";
import {
  blankProvider,
  providerInput,
  type ProviderForm,
} from "../state/agent-settings";
type ModelCatalog = Awaited<ReturnType<typeof harnessClient.listSessionModels>>;
export function useAgentSettings(agent: AgentConversation) {
  const [providers, setProviders] = useState<ProviderState | null>(null),
    [models, setModels] = useState<ModelCatalog | null>(null),
    [form, setForm] = useState(blankProvider),
    [discovered, setDiscovered] = useState<
      Array<{ id: string; name?: string }>
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const live = useRef(true),
    operation = useRef(false);
  const requestVersion = useRef(0);
  const load = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const [p, m] = await Promise.all([
        harnessClient.listProviders(),
        agent.session
          ? harnessClient.listSessionModels(agent.session.id)
          : Promise.resolve(null),
      ]);
      if (live.current) {
        setProviders(p);
        setModels(m);
        setForm((previous) => {
          if (previous.route) return previous;
          const existing =
            p.configured.find((item) => item.route === m?.current?.provider) ||
            p.configured[0];
          return existing
            ? {
                kind: existing.kind,
                route: existing.route,
                baseURL: existing.baseURL || "",
                api:
                  existing.api ||
                  (existing.kind === "custom" ? "openai-completions" : ""),
                apiKey: "",
                models: existing.models.join("\n"),
              }
            : { ...previous, route: p.catalog[0]?.route || "" };
        });
      }
    } catch (problem) {
      if (live.current)
        setError(
          problem instanceof Error
            ? problem.message
            : "Cannot load Agent settings.",
        );
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };
  useEffect(() => {
    live.current = true;
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void load();
    });
    return () => {
      mounted = false;
      live.current = false;
      requestVersion.current++;
    };
  }, [agent.session?.id]);
  const selectProvider = (route: string, kind: ProviderForm["kind"]) => {
    const existing = providers?.configured.find((p) => p.route === route);
    requestVersion.current++;
    setDiscovered([]);
    setError("");
    setNotice("");
    setForm({
      kind,
      route,
      baseURL: existing?.baseURL || "",
      api: existing?.api || (kind === "custom" ? "openai-completions" : ""),
      apiKey: "",
      models: existing?.models.join("\n") || "",
    });
  };
  const discover = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const version = ++requestVersion.current;
    try {
      const list = await harnessClient.discoverProviderModels(
        providerInput(form),
      );
      if (live.current && version === requestVersion.current) {
        setDiscovered(list);
        setNotice(
          list.length
            ? `Discovered ${list.length} models. Choose which to save.`
            : "No models returned. Enter model IDs manually.",
        );
      }
    } catch (problem) {
      if (live.current && version === requestVersion.current)
        setError(
          problem instanceof Error
            ? problem.message
            : "Model discovery failed.",
        );
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };
  const save = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ids = [
        ...new Set(
          form.models
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      if (!ids.length)
        throw new Error("Choose or enter at least one model ID.");
      await harnessClient.configureProvider({
        ...providerInput(form),
        models: ids,
      });
      if (live.current) {
        setForm((previous) => ({ ...previous, apiKey: "" }));
        setNotice(
          "Provider saved for the CLI and new sessions. Use Models to switch this chat.",
        );
      }
      const p = await harnessClient.listProviders();
      if (live.current) setProviders(p);
      if (agent.session) {
        const m = await harnessClient.listSessionModels(agent.session.id);
        if (live.current) setModels(m);
      }
    } catch (problem) {
      if (live.current)
        setError(
          problem instanceof Error
            ? problem.message
            : "Provider configuration failed.",
        );
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };
  return {
    providers,
    models,
    form,
    setForm,
    discovered,
    busy,
    error,
    notice,
    load,
    selectProvider,
    discover,
    save,
  };
}
