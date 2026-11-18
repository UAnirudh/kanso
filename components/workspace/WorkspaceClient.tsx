"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Eye,
  Sparkles,
  X,
} from "lucide-react";
import type { InterfaceDocument, InterfaceNode } from "@/lib/interface/types";
import type { InterfaceOperation } from "@/lib/interface/operations";
import type { AppRecord } from "@/lib/interface/types";
import type { ActivityItem } from "@/lib/repo/records";
import type { Role } from "@/lib/roles";
import type { AppPage } from "@/lib/interface/types";
import { Surface, type SurfaceDiff } from "./render/Surface";
import { SurfaceContext, EMPTY_FILTERS, filterTasks, type SurfaceApi, type SurfaceFilters } from "./render/context";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AiPanel } from "./AiPanel";
import { HistoryDrawer } from "./HistoryDrawer";
import { ComponentSettingsDialog, MembersDialog, TaskDialog } from "./dialogs";
import type {
  AiInfo,
  AiProposalView,
  MemberView,
  NodeSettingsRequest,
  RevisionView,
  TaskDialogState,
  ToastState,
  WorkspaceAppInfo,
  WorkspaceUser,
} from "./types";
import { CATALOG } from "@/lib/interface/catalog";

interface WorkspaceProps {
  user: WorkspaceUser;
  app: WorkspaceAppInfo;
  workspace: { id: string; name: string };
  role: Role;
  canEdit: boolean;
  canManage: boolean;
  pages: AppPage[];
  initialDocument: InterfaceDocument;
  initialTasks: AppRecord[];
  initialNotes: AppRecord[];
  activity: ActivityItem[];
  initialHistory: RevisionView[];
  members: MemberView[];
  ai: AiInfo;
}

class ApiError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      typeof payload.error === "string" ? payload.error : "The request failed.",
      Array.isArray(payload.details) ? payload.details.map(String) : [],
    );
  }
  return payload as T;
}

const STATUS_STEPS = [
  "Reading your interface…",
  "Planning the change…",
  "Validating against the component schema…",
];

export function WorkspaceClient(props: WorkspaceProps) {
  const router = useRouter();
  const appId = props.app.id;

  const [document, setDocument] = useState(props.initialDocument);
  const [tasks, setTasks] = useState(props.initialTasks);
  const [notes, setNotes] = useState(props.initialNotes);
  const [history, setHistory] = useState(props.initialHistory);
  const [activePage, setActivePage] = useState(() => {
    const home = props.pages.find((page) => page.key === props.initialDocument.homePage);
    return home?.key ?? props.pages[0]?.key ?? "overview";
  });

  const [filters, setFiltersState] = useState<SurfaceFilters>(EMPTY_FILTERS);
  const [editMode, setEditMode] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [aiMobile, setAiMobile] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [settingsRequest, setSettingsRequest] = useState<NodeSettingsRequest | null>(null);
  const [proposal, setProposal] = useState<AiProposalView | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; details?: string[] } | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    setDocument(props.initialDocument);
  }, [props.initialDocument]);

  useEffect(() => {
    setTasks(props.initialTasks);
  }, [props.initialTasks]);

  useEffect(() => {
    setNotes(props.initialNotes);
  }, [props.initialNotes]);

  useEffect(() => {
    setHistory(props.initialHistory);
  }, [props.initialHistory]);

  useEffect(() => {
    if (!aiBusy) {
      setStep(0);
      return;
    }
    const timer = window.setInterval(() => setStep((value) => (value + 1) % STATUS_STEPS.length), 1800);
    return () => window.clearInterval(timer);
  }, [aiBusy]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Mount exactly one assistant panel so ids, labels and focus stay unique.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const pushToast = useCallback((message: string, tone: ToastState["tone"] = "info") => {
    setToast({ message, tone });
  }, []);

  const displayDocument = previewing && proposal ? proposal.proposedDocument : document;
  const currentPageKey = displayDocument.pages[activePage]
    ? activePage
    : (props.pages[0]?.key ?? activePage);
  const pageTitle =
    props.pages.find((page) => page.key === currentPageKey)?.title ?? "Overview";

  const setFilters = useCallback((patch: Partial<SurfaceFilters>) => {
    setFiltersState((current) => ({ ...current, ...patch }));
  }, []);

  const runVisualOps = useCallback(
    async (operations: InterfaceOperation[], label: string) => {
      setBusy(true);
      try {
        const data = await request<{ document: InterfaceDocument; warnings: string[] }>(
          `/api/apps/${appId}/interface`,
          { method: "PATCH", body: JSON.stringify({ operations, label }) },
        );
        setDocument(data.document);
        setPreviewing(false);
        setProposal(null);
        pushToast(label, "success");
        router.refresh();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Could not save that edit.", "error");
      } finally {
        setBusy(false);
      }
    },
    [appId, pushToast, router],
  );

  const createTask = useCallback(
    async (input: {
      title: string;
      priority: string;
      dueDate: string | null;
      status?: string;
      description?: string;
    }) => {
      setBusy(true);
      try {
        const data = await request<{ record: AppRecord }>(`/api/apps/${appId}/records`, {
          method: "POST",
          body: JSON.stringify({
            kind: "task",
            title: input.title,
            description: input.description ?? "",
            priority: input.priority,
            dueDate: input.dueDate,
            status: input.status ?? "todo",
          }),
        });
        setTasks((current) => [...current, data.record]);
        router.refresh();
        return true;
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Could not create the task.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [appId, pushToast, router],
  );

  const updateTask = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      setBusy(true);
      try {
        const data = await request<{ record: AppRecord }>(
          `/api/apps/${appId}/records/${taskId}`,
          { method: "PATCH", body: JSON.stringify(patch) },
        );
        setTasks((current) =>
          current.map((task) => (task.id === taskId ? data.record : task)),
        );
        router.refresh();
        return true;
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Could not update the task.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [appId, pushToast, router],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      setBusy(true);
      try {
        await request(`/api/apps/${appId}/records/${taskId}`, { method: "DELETE" });
        setTasks((current) => current.filter((task) => task.id !== taskId));
        router.refresh();
        pushToast("Task deleted", "success");
        return true;
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Could not delete the task.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [appId, pushToast, router],
  );

  const createNote = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        const data = await request<{ record: AppRecord }>(`/api/apps/${appId}/records`, {
          method: "POST",
          body: JSON.stringify({
            kind: "note",
            title: text.slice(0, 80),
            description: text,
          }),
        });
        setNotes((current) => [...current, data.record]);
        router.refresh();
        return true;
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Could not save the note.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [appId, pushToast, router],
  );

  const toggleTask = useCallback(
    (task: AppRecord) => {
      void updateTask(task.id, { status: task.status === "done" ? "todo" : "done" });
    },
    [updateTask],
  );

  const updateNodeProps = useCallback(
    (nodeId: string, nodeProps: Record<string, unknown>) => {
      const page = displayDocument.pages[currentPageKey];
      if (!page) return;
      void runVisualOps(
        [{ op: "updateProps", page: currentPageKey, id: nodeId, props: nodeProps }],
        `${CATALOG[page.components.find((node) => node.id === nodeId)?.type ?? "TaskList"].label} settings updated`,
      );
    },
    [currentPageKey, displayDocument, runVisualOps],
  );

  const filteredTasks = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);

  const surfaceApi = useMemo<SurfaceApi>(
    () => ({
      tasks: filteredTasks,
      allTasks: tasks,
      notes,
      activity: props.activity,
      filters,
      setFilters,
      canEdit: props.canEdit,
      busy,
      openTask: (task) => {
        setTaskDialog({
          mode: "edit",
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
          },
        });
      },
      toggleTask,
      createTask: async (input) => createTask(input),
      createNote,
      updateNodeProps,
    }),
    [
      filteredTasks,
      tasks,
      notes,
      props.activity,
      props.canEdit,
      filters,
      setFilters,
      busy,
      toggleTask,
      createTask,
      createNote,
      updateNodeProps,
    ],
  );

  const submitPrompt = useCallback(
    async (prompt: string) => {
      setAiBusy(true);
      setAiError(null);
      setProposal(null);
      setPreviewing(false);
      try {
        const data = await request<{ proposal: AiProposalView }>(`/api/apps/${appId}/ai`, {
          method: "POST",
          body: JSON.stringify({ prompt }),
        });
        setProposal(data.proposal);
        setPreviewing(true);
        setEditMode(false);
      } catch (error) {
        setAiError({
          message: error instanceof Error ? error.message : "The assistant could not respond.",
          details: error instanceof ApiError ? error.details : [],
        });
      } finally {
        setAiBusy(false);
      }
    },
    [appId],
  );

  const applyProposal = useCallback(async () => {
    if (!proposal) return;
    setAiBusy(true);
    try {
      const data = await request<{ document: InterfaceDocument }>(
        `/api/apps/${appId}/ai/apply`,
        { method: "POST", body: JSON.stringify({ requestId: proposal.id, action: "apply" }) },
      );
      setDocument(data.document);
      setProposal(null);
      setPreviewing(false);
      setAiError(null);
      pushToast("Applied to your interface", "success");
      router.refresh();
    } catch (error) {
      setAiError({
        message: error instanceof Error ? error.message : "Could not apply the change.",
        details: error instanceof ApiError ? error.details : [],
      });
    } finally {
      setAiBusy(false);
    }
  }, [appId, proposal, pushToast, router]);

  const discardProposal = useCallback(async () => {
    if (!proposal) return;
    setPreviewing(false);
    setProposal(null);
    try {
      await request(`/api/apps/${appId}/ai/apply`, {
        method: "POST",
        body: JSON.stringify({ requestId: proposal.id, action: "discard" }),
      });
    } catch {
      // Discarding is best effort; the interface was never changed either way.
    }
  }, [appId, proposal]);

  const mutateVersion = useCallback(
    async (body: { action: "restore" | "undo"; revisionId?: string }, message: string) => {
      setBusy(true);
      try {
        const data = await request<{ document: InterfaceDocument }>(
          `/api/apps/${appId}/versions`,
          { method: "POST", body: JSON.stringify(body) },
        );
        setDocument(data.document);
        setPreviewing(false);
        setProposal(null);
        setHistoryOpen(false);
        pushToast(message, "success");
        router.refresh();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Could not restore that version.", "error");
      } finally {
        setBusy(false);
      }
    },
    [appId, pushToast, router],
  );

  const addMember = useCallback(
    async (email: string, role: Role): Promise<string | null> => {
      setBusy(true);
      try {
        await request(`/api/apps/${appId}/members`, {
          method: "POST",
          body: JSON.stringify({ email, role }),
        });
        router.refresh();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Could not add that person.";
      } finally {
        setBusy(false);
      }
    },
    [appId, router],
  );

  const changeRole = useCallback(
    async (userId: string, role: Role): Promise<string | null> => {
      setBusy(true);
      try {
        await request(`/api/apps/${appId}/members`, {
          method: "PATCH",
          body: JSON.stringify({ userId, role }),
        });
        router.refresh();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Could not change that role.";
      } finally {
        setBusy(false);
      }
    },
    [appId, router],
  );

  const removeMember = useCallback(
    async (userId: string): Promise<string | null> => {
      setBusy(true);
      try {
        await request(`/api/apps/${appId}/members`, {
          method: "DELETE",
          body: JSON.stringify({ userId }),
        });
        router.refresh();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Could not remove that member.";
      } finally {
        setBusy(false);
      }
    },
    [appId, router],
  );

  const diff = useMemo<SurfaceDiff | null>(() => {
    if (!previewing || !proposal) return null;
    const before = document.pages[currentPageKey];
    const after = proposal.proposedDocument.pages[currentPageKey];
    if (!before || !after) return null;
    const previous = new Map(before.components.map((node) => [node.id, node]));
    const added = new Set<string>();
    const changed = new Set<string>();
    for (const node of after.components) {
      const old = previous.get(node.id);
      if (!old) added.add(node.id);
      else if (JSON.stringify(old) !== JSON.stringify(node)) changed.add(node.id);
    }
    return { added, changed };
  }, [previewing, proposal, document, currentPageKey]);

  const sidebarCollapsed =
    displayDocument.nav.collapsed || displayDocument.nav.width === "compact";

  const toggleSidebar = useCallback(() => {
    if (sidebarCollapsed) {
      void runVisualOps(
        [
          { op: "setNavCollapsed", collapsed: false },
          { op: "setNavWidth", width: "default" },
        ],
        "Expanded navigation",
      );
    } else {
      void runVisualOps([{ op: "setNavCollapsed", collapsed: true }], "Collapsed navigation");
    }
  }, [runVisualOps, sidebarCollapsed]);

  const toggleAi = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    if (desktop) setAiOpen((value) => !value);
    else setAiMobile((value) => !value);
  }, []);

  const aiPanel = (
    <AiPanel
      ai={props.ai}
      proposal={proposal}
      busy={aiBusy}
      statusText={STATUS_STEPS[step] ?? STATUS_STEPS[0]!}
      error={aiError}
      previewing={previewing}
      onSubmit={(prompt) => void submitPrompt(prompt)}
      onApply={() => void applyProposal()}
      onDiscard={() => void discardProposal()}
      onTogglePreview={(next) => setPreviewing(next)}
      onClose={() => {
        setAiOpen(false);
        setAiMobile(false);
      }}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#08090b]">
      <div className="flex min-h-0 flex-1">
        {mobileNav && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/55 lg:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}
        <div
          className={`${
            mobileNav ? "fixed inset-y-0 left-0 z-40 flex lg:relative lg:z-auto" : "hidden lg:flex"
          }`}
        >
          <Sidebar
            appName={props.app.name}
            workspaceName={props.workspace.name}
            user={props.user}
            role={props.role}
            pages={props.pages}
            activePage={currentPageKey}
            onSelectPage={(key) => {
              setActivePage(key);
              setMobileNav(false);
              if (previewing) setPreviewing(false);
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onOpenHistory={() => {
              setHistoryOpen(true);
              setMobileNav(false);
            }}
            onOpenMembers={() => {
              setMembersOpen(true);
              setMobileNav(false);
            }}
            onNewTask={() => {
              setTaskDialog({ mode: "create" });
              setMobileNav(false);
            }}
            canEdit={props.canEdit}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            appName={props.app.name}
            pageTitle={pageTitle}
            editMode={editMode}
            onToggleEdit={() => {
              if (previewing) setPreviewing(false);
              setEditMode((value) => !value);
            }}
            aiOpen={aiOpen || aiMobile}
            onToggleAi={toggleAi}
            onOpenSidebar={() => setMobileNav(true)}
            onNewTask={() => setTaskDialog({ mode: "create" })}
            canEdit={props.canEdit}
            busy={busy}
            appearance={{
              theme: displayDocument.theme,
              accent: displayDocument.accent,
              density: displayDocument.density,
              navWidth: displayDocument.nav.width,
              navCollapsed: displayDocument.nav.collapsed,
            }}
            onAppearance={(operations, label) => void runVisualOps(operations, label)}
          />

          {previewing && proposal && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#8b7cf8]/25 bg-[#8b7cf8]/[0.07] px-3 py-2">
              <span className="flex items-center gap-1.5">
                <span className="preview-dot h-1.5 w-1.5 rounded-full bg-[#a496ff]" aria-hidden />
                <Eye size={12} className="text-[#a496ff]" aria-hidden />
                <span className="text-[11.5px] text-[#c4baff]">
                  Preview · <span className="text-[#e8e9ee]">{proposal.summary}</span>{" "}
                  <span className="text-[#8b7cf8]/70">(not saved)</span>
                </span>
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void applyProposal()}
                  disabled={aiBusy}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void discardProposal()}
                  disabled={aiBusy}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPreviewing(false)}
                >
                  Exit preview
                </button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            <main id="main" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[1180px] px-3 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-[18px] font-semibold tracking-[-0.015em] text-[#e8e9ee]">
                        {pageTitle}
                      </h1>
                      <span className="rounded-full border border-[#262a32] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#82858f]">
                        Your interface
                      </span>
                      {editMode && (
                        <span className="rounded-full border border-[#8b7cf8]/40 bg-[#8b7cf8]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#c4baff]">
                          Editing
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-xl truncate text-[11.5px] text-[#5f626b]">
                      {props.app.description || "Shared workspace data, arranged your way."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href="/dashboard" className="btn btn-ghost btn-sm">
                      <ArrowLeft size={12} aria-hidden />
                      All apps
                    </Link>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="btn btn-ghost btn-sm"
                    >
                      {history.length} version{history.length === 1 ? "" : "s"}
                    </button>
                  </div>
                </div>

                <div
                  className="surface mt-3.5 rounded-[14px] border border-[#1c1f25] p-3 sm:p-4"
                  data-theme={displayDocument.theme}
                  data-accent={displayDocument.accent}
                  data-density={displayDocument.density}
                >
                  <SurfaceContext.Provider value={surfaceApi}>
                    <Surface
                      document={displayDocument}
                      pageKey={currentPageKey}
                      editMode={editMode}
                      busy={busy}
                      diff={diff}
                      onOperate={(operations, label) => void runVisualOps(operations, label)}
                      onSettings={(node: InterfaceNode) =>
                        setSettingsRequest({ node, page: currentPageKey })
                      }
                      onRequestEdit={() => setEditMode(true)}
                    />
                  </SurfaceContext.Provider>
                </div>

                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#4f525b]">
                  <span className="inline-flex items-center gap-1">
                    <LockIcon /> Interface private to you
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={10} aria-hidden /> Validated schema · revisioned
                  </span>
                  <span>Shared data, your layout</span>
                </p>
              </div>
            </main>

            {aiOpen && isDesktop && (
              <div className="hidden w-[350px] shrink-0 lg:block">{aiPanel}</div>
            )}
          </div>
        </div>
      </div>

      {aiMobile && !isDesktop && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close assistant"
            onClick={() => setAiMobile(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[92vw] max-w-[380px] bg-[#0b0c0f]">
            {aiPanel}
          </div>
        </div>
      )}

      <TaskDialog
        open={taskDialog !== null}
        state={taskDialog}
        canEdit={props.canEdit}
        busy={busy}
        onClose={() => setTaskDialog(null)}
        onCreate={async (input) => createTask(input)}
        onUpdate={async (id, patch) => updateTask(id, patch as Record<string, unknown>)}
        onDelete={deleteTask}
      />

      <ComponentSettingsDialog
        request={settingsRequest}
        busy={busy}
        onClose={() => setSettingsRequest(null)}
        onApply={async (page, nodeId, nodeProps) => {
          setBusy(true);
          try {
            const data = await request<{ document: InterfaceDocument }>(
              `/api/apps/${appId}/interface`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  operations: [{ op: "updateProps", page, id: nodeId, props: nodeProps }],
                  label: "Component settings updated",
                }),
              },
            );
            setDocument(data.document);
            pushToast("Component settings updated", "success");
            router.refresh();
            return true;
          } catch (error) {
            pushToast(error instanceof Error ? error.message : "Could not save settings.", "error");
            return false;
          } finally {
            setBusy(false);
          }
        }}
      />

      <MembersDialog
        open={membersOpen}
        members={props.members}
        canManage={props.canManage}
        busy={busy}
        onClose={() => setMembersOpen(false)}
        onAdd={addMember}
        onChangeRole={changeRole}
        onRemove={removeMember}
      />

      <HistoryDrawer
        open={historyOpen}
        history={history}
        busy={busy}
        onClose={() => setHistoryOpen(false)}
        onRestore={(revisionId) =>
          void mutateVersion({ action: "restore", revisionId }, "Previous version restored")
        }
        onUndo={() => void mutateVersion({ action: "undo" }, "Last change undone")}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`rise fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-[9px] border px-3 py-2 text-[12px] shadow-xl ${
            toast.tone === "error"
              ? "border-red-500/30 bg-[#1a0f12] text-red-200"
              : "border-[#2a2e37] bg-[#101216] text-[#d5d7de]"
          }`}
        >
          {toast.tone === "error" ? (
            <CircleAlert size={13} aria-hidden />
          ) : toast.tone === "success" ? (
            <CheckCircle2 size={13} className="text-emerald-400" aria-hidden />
          ) : (
            <Sparkles size={13} className="text-[#a496ff]" aria-hidden />
          )}
          {toast.message}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-1 text-[#6b6f7a] hover:text-[#e8e9ee]"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M4.25 5.5V4a1.75 1.75 0 1 1 3.5 0v1.5" stroke="currentColor" />
    </svg>
  );
}
