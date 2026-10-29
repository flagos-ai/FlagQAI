import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutoCompactionPolicy,
  BackendResource,
  PermissionDecision,
  QuestionAnswers,
  SessionCatalogResource,
  SessionResource,
} from "../../../../packages/sdk/index.d.ts";
import { FlagQaiApiError } from "../../../../packages/sdk/index.mjs";
import { harnessClient, workspaceAgentConfig } from "../api/harness";
import { applyAgentRecord, emptyAgentView } from "../state/agent-view";
const KEY = "fq-agent-session-v1";
type Reference = Pick<
  SessionResource,
  "id" | "backendId" | "sessionId" | "cwd"
>;
function remember(session: SessionResource) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        id: session.id,
        backendId: session.backendId,
        sessionId: session.sessionId,
        cwd: session.cwd,
      }),
    );
  } catch {
    /* Native history remains authoritative. */
  }
}
function stored(): Reference | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Agent request failed.";
export function useAgentConversation() {
  const [view, setView] = useState(emptyAgentView),
    [session, setSession] = useState<SessionResource | null>(null),
    [backends, setBackends] = useState<BackendResource[]>([]),
    [catalog, setCatalog] = useState<SessionCatalogResource[]>([]),
    [cwd, setCwd] = useState(""),
    [backend, setBackend] = useState("dsh");
  const [phase, setPhase] = useState<
      "offline" | "connecting" | "connected" | "reconnecting" | "ready"
    >("offline"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [answering, setAnswering] = useState<string | null>(null),
    [compacting, setCompacting] = useState(false),
    [compactionNotice, setCompactionNotice] = useState("");
  const stream = useRef<AbortController | null>(null),
    active = useRef<SessionResource | null>(null),
    cursor = useRef(0),
    generation = useRef(0),
    mounted = useRef(true),
    operation = useRef(false);
  const outbound = useRef<{
    session: string;
    clientMessageId: string;
    text: string;
  } | null>(null);
  const attach = useCallback((resource: SessionResource) => {
    stream.current?.abort();
    const controller = new AbortController();
    stream.current = controller;
    active.current = resource;
    cursor.current = 0;
    setView(emptyAgentView());
    setCompactionNotice("");
    setSession(resource);
    remember(resource);
    setPhase("connecting");
    void (async () => {
      let retries = 0;
      while (!controller.signal.aborted) {
        try {
          for await (const record of harnessClient.events(resource.id, {
            signal: controller.signal,
            lastEventId: cursor.current,
            onOpen: () => {
              if (!controller.signal.aborted) {
                setPhase("connected");
                setError("");
              }
            },
          })) {
            if (controller.signal.aborted || active.current?.id !== resource.id)
              return;
            cursor.current = Math.max(cursor.current, record.id);
            setView((previous) => applyAgentRecord(previous, record));
            retries = 0;
          }
          throw new Error(
            "Agent stream closed. Reconnecting to native session history…",
          );
        } catch (problem) {
          if (controller.signal.aborted) return;
          if (
            problem instanceof FlagQaiApiError &&
            [403, 404].includes(problem.status)
          ) {
            setError(message(problem));
            setPhase("ready");
            return;
          }
          setPhase("reconnecting");
          setError(message(problem));
          const delay = Math.min(1000 * 2 ** retries++, 10000);
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, delay);
            controller.signal.addEventListener("abort", finish, { once: true });
          });
        }
      }
    })();
  }, []);
  const connect = useCallback(
    async (create = true, quiet = false) => {
      if (operation.current) return;
      operation.current = true;
      const ticket = ++generation.current;
      setBusy(true);
      if (!quiet) setError("");
      try {
        const config = await workspaceAgentConfig();
        const [health, available, sessions] = await Promise.all([
          harnessClient.health(),
          harnessClient.listBackends(),
          harnessClient.listSessions(),
        ]);
        if (!mounted.current || ticket !== generation.current) return;
        setCwd(config.cwd);
        setBackends(available);
        setCatalog(sessions);
        if (!health.backendCount || !available.length)
          throw new Error("FlagQAI is running without an Agent backend.");
        const selected = available.some((item) => item.id === backend)
          ? backend
          : available[0]?.id;
        setBackend(selected);
        setPhase("ready");
        const reference = stored();
        if (reference?.cwd === config.cwd) {
          try {
            const existing = await harnessClient.getSession(reference.id);
            if (mounted.current && ticket === generation.current)
              attach(existing);
            return;
          } catch (problem) {
            if (!(problem instanceof FlagQaiApiError) || problem.status !== 404)
              throw problem;
          }
          const resumed = await harnessClient.openSession({
            backendId: reference.backendId,
            cwd: config.cwd,
            sessionId: reference.sessionId,
          });
          if (mounted.current && ticket === generation.current) attach(resumed);
          return;
        }
        if (create) {
          const opened = await harnessClient.openSession({
            backendId: selected,
            cwd: config.cwd,
          });
          if (mounted.current && ticket === generation.current) attach(opened);
        }
      } catch (problem) {
        if (mounted.current && ticket === generation.current) {
          setPhase("offline");
          if (!quiet) setError(message(problem));
        }
      } finally {
        operation.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [attach, backend],
  );
  useEffect(() => {
    mounted.current = true;
    let live = true;
    queueMicrotask(() => {
      if (live) void connect(false, true);
    });
    return () => {
      live = false;
      mounted.current = false;
      generation.current++;
      stream.current?.abort();
    };
  }, []);
  const choose = async (item?: SessionCatalogResource) => {
    if (
      operation.current ||
      view.working ||
      sending ||
      Object.keys(view.permissions).length ||
      Object.keys(view.questions).length
    )
      return false;
    if (!cwd) {
      setError("Connect to FlagQAI before creating or resuming a session.");
      return false;
    }
    if (item?.availability === "occupied") {
      setError("This session is open in another client. Close it there first.");
      return false;
    }
    operation.current = true;
    setBusy(true);
    setError("");
    const ticket = ++generation.current;
    try {
      const opened = item?.resourceId
        ? await harnessClient.getSession(item.resourceId)
        : await harnessClient.openSession({
            backendId: item?.backendId || backend,
            cwd,
            ...(item ? { sessionId: item.sessionId } : {}),
          });
      if (!mounted.current || ticket !== generation.current) return false;
      // A delivery retry belongs to its original conversation, not a newly chosen one.
      if (
        active.current?.sessionId !== opened.sessionId ||
        active.current?.backendId !== opened.backendId
      )
        outbound.current = null;
      attach(opened);
      // A metadata refresh failure must not undo an already successful adoption.
      try {
        const list = await harnessClient.listSessions();
        if (mounted.current && ticket === generation.current) setCatalog(list);
      } catch {
        /* Native session remains available. */
      }
      return true;
    } catch (problem) {
      if (mounted.current) setError(message(problem));
      return false;
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const send = async (text: string) => {
    const current = active.current;
    if (
      !current ||
      phase !== "connected" ||
      !view.projected ||
      view.working ||
      sending ||
      Object.keys(view.permissions).length ||
      Object.keys(view.questions).length
    )
      return false;
    if (
      outbound.current &&
      (outbound.current.session !== current.id ||
        outbound.current.text !== text)
    ) {
      setError(
        "An earlier message delivery is unresolved. Inspect its native transcript before sending different input.",
      );
      return false;
    }
    const input = outbound.current || {
      session: current.id,
      clientMessageId: crypto.randomUUID(),
      text,
    };
    outbound.current = input;
    setSending(true);
    setCompactionNotice("");
    setError("");
    try {
      const receipt = await harnessClient.submitMessage(current.id, {
        clientMessageId: input.clientMessageId,
        text: input.text,
        placement: "turn",
      });
      outbound.current = null;
      if (!receipt.accepted)
        throw new Error(
          receipt.reason || "The Agent did not accept this message.",
        );
      return true;
    } catch (problem) {
      if (
        problem instanceof FlagQaiApiError &&
        [400, 403, 404].includes(problem.status)
      )
        outbound.current = null;
      setError(
        message(problem) +
          " Your draft is retained. Retrying identical input uses the same delivery ID.",
      );
      return false;
    } finally {
      if (mounted.current) setSending(false);
    }
  };
  const setCompactionPolicy = async (
    input: Pick<AutoCompactionPolicy, "enabled" | "thresholdRatio">,
  ) => {
    const current = active.current;
    if (
      !current ||
      operation.current ||
      busy ||
      sending ||
      phase !== "connected" ||
      view.working ||
      view.context?.compaction ||
      Object.keys(view.permissions).length ||
      Object.keys(view.questions).length
    )
      return null;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await harnessClient.setCompactionPolicy(current.id, input);
      return mounted.current && active.current?.id === current.id
        ? result.policy
        : null;
    } catch (problem) {
      if (mounted.current && active.current?.id === current.id)
        setError(message(problem));
      return null;
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const compact = async () => {
    const current = active.current;
    if (
      !current ||
      operation.current ||
      busy ||
      sending ||
      phase !== "connected" ||
      !view.context?.compactSupported ||
      view.context.compaction ||
      view.working ||
      Object.keys(view.permissions).length ||
      Object.keys(view.questions).length
    )
      return false;
    operation.current = true;
    setBusy(true);
    setCompacting(true);
    setCompactionNotice("");
    setError("");
    try {
      const result = await harnessClient.compactSession(current.id);
      if (!mounted.current || active.current?.id !== current.id) return false;
      setCompactionNotice(
        result.outcome === "unchanged"
          ? "No context needed compaction."
          : result.outcome === "requested"
            ? "Native compaction requested."
            : "Context compacted.",
      );
      return true;
    } catch (problem) {
      if (mounted.current && active.current?.id === current.id)
        setError(message(problem));
      return false;
    } finally {
      operation.current = false;
      if (mounted.current) {
        setBusy(false);
        setCompacting(false);
      }
    }
  };
  const stop = async () => {
    if (!active.current) return;
    setBusy(true);
    setError("");
    try {
      await harnessClient.cancelSession(active.current.id, { cause: "user" });
    } catch (problem) {
      setError(message(problem));
    } finally {
      setBusy(false);
    }
  };
  const answer = async (
    id: string,
    decision: PermissionDecision | QuestionAnswers | "cancel-question",
  ) => {
    if (!active.current || answering) return;
    setAnswering(id);
    setError("");
    try {
      if (decision === "cancel-question")
        await harnessClient.cancelQuestion(active.current.id, id);
      else if ("answers" in decision)
        await harnessClient.answerQuestion(active.current.id, id, decision);
      else
        await harnessClient.answerPermission(active.current.id, id, decision);
    } catch (problem) {
      setError(message(problem));
    } finally {
      setAnswering(null);
    }
  };
  const switchModel = async (selection: {
    provider?: string;
    model: string;
  }) => {
    const current = active.current;
    if (
      !current ||
      operation.current ||
      sending ||
      view.working ||
      Object.keys(view.permissions).length ||
      Object.keys(view.questions).length
    )
      return false;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const replacement = await harnessClient.switchSessionModel(
        current.id,
        selection,
      );
      if (!mounted.current || active.current?.id !== current.id) return false;
      attach(replacement);
      try {
        const list = await harnessClient.listSessions();
        if (mounted.current) setCatalog(list);
      } catch {
        /* Model switch already succeeded. */
      }
      return true;
    } catch (problem) {
      if (mounted.current) setError(message(problem));
      return false;
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return {
    view,
    session,
    backends,
    catalog,
    cwd,
    backend,
    setBackend,
    phase,
    error,
    clearError: () => setError(""),
    busy,
    sending,
    answering,
    compacting,
    compactionNotice,
    compact,
    setCompactionPolicy,
    connect: () => connect(true),
    refresh: () => connect(false),
    choose,
    send,
    stop,
    answer,
    switchModel,
  };
}
export type AgentConversation = ReturnType<typeof useAgentConversation>;
