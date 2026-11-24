import Link from "next/link";
import { ArrowUpRight, LayoutGrid, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { AppCardActions, NewAppForm, NewWorkspaceForm } from "@/components/dashboard/Forms";
import { providerInfo } from "@/lib/ai/provider";
import { requireGuest } from "@/lib/identity";
import { initials } from "@/lib/format";
import { listAppsForUser } from "@/lib/repo/apps";
import { ROLE_LABEL, listWorkspacesForUser } from "@/lib/repo/workspaces";

export default async function DashboardPage() {
  const guest = await requireGuest();
  const workspaces = listWorkspacesForUser(guest.id);
  const apps = listAppsForUser(guest.id);
  const provider = providerInfo();
  const firstName = guest.name.split(/\s+/)[0] ?? guest.name;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[#1c1f25] bg-[#08090b]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Brand />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[11px] text-[#5f626b] sm:flex">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  provider.kind === "model" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {provider.kind === "model"
                ? `Groq · ${provider.model}`
                : "Local planner (no API key)"}
            </span>
            <div className="flex items-center gap-2 rounded-full border border-[#1c1f25] bg-[#0d0f13] py-1 pl-1 pr-2.5">
              <span
                aria-hidden
                className="grid h-6 w-6 place-items-center rounded-full bg-[#1b1e24] text-[10px] font-semibold text-[#c8cad2]"
              >
                {initials(guest.name)}
              </span>
              <span
                data-testid="guest-name"
                className="max-w-[140px] truncate text-[12px] text-[#c8cad2]"
              >
                {guest.name}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-5 py-9">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f626b]">
              Workspace
            </p>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">
              {firstName}, here is what you can shape.
            </h1>
            <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-[#82858f]">
              Generate an application, then ask the assistant to reorganise it. Every change is
              validated, previewed and versioned — and only applies to your own interface.
            </p>
            <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-[#6b6f7a]">
              No account needed: this browser holds a private guest identity. Workspace data is
              shared with everyone here; the interface is yours alone.
            </p>

            <div className="mt-7 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-[#c8cad2]">
                Your applications{" "}
                <span className="ml-1 rounded-full border border-[#262a32] px-1.5 py-0.5 text-[10px] text-[#82858f]">
                  {apps.length}
                </span>
              </h2>
            </div>

            {apps.length === 0 ? (
              <div className="mt-3 rounded-[12px] border border-dashed border-[#262a32] bg-[#0b0c0f] px-6 py-12 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-[10px] border border-[#262a32] bg-[#101216]">
                  <LayoutGrid size={17} className="text-[#8b7cf8]" aria-hidden />
                </span>
                <p className="mt-4 text-sm font-medium text-[#c8cad2]">No applications yet</p>
                <p className="mx-auto mt-1 max-w-xs text-[12.5px] leading-relaxed text-[#6b6f7a]">
                  Describe one on the right. You get a working project workspace with pages,
                  tasks and analytics.
                </p>
              </div>
            ) : (
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {apps.map((app) => (
                  <li
                    key={app.id}
                    className="flex h-full flex-col justify-between overflow-hidden rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] transition-colors hover:border-[#353a45]"
                  >
                    <Link
                      href={`/apps/${app.id}`}
                      className="group flex flex-1 flex-col justify-between p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-[#e8e9ee]">
                            {app.name}
                          </p>
                          <p className="mt-0.5 truncate text-[11.5px] text-[#6b6f7a]">
                            {app.workspaceName} · {ROLE_LABEL[app.role]}
                          </p>
                        </div>
                        <ArrowUpRight
                          size={15}
                          aria-hidden
                          className="mt-0.5 shrink-0 text-[#3a3f4a] transition-colors group-hover:text-[#a496ff]"
                        />
                      </div>
                      <div className="mt-5 flex items-center gap-3 text-[11px] text-[#82858f]">
                        <span>{app.taskCount} tasks</span>
                        <span aria-hidden className="h-1 w-1 rounded-full bg-[#3a3f4a]" />
                        <span>{app.openCount} open</span>
                      </div>
                    </Link>
                    <AppCardActions
                      appId={app.id}
                      appName={app.name}
                      canManage={app.role === "admin" || app.role === "owner"}
                    />
                  </li>
                ))}
              </ul>
            )}

            <section className="mt-8 rounded-[12px] border border-[#1c1f25] bg-[#0b0c0f] p-5">
              <h2 className="text-[13px] font-semibold text-[#c8cad2]">Workspaces</h2>
              <p className="mt-1 text-[12px] text-[#6b6f7a]">
                Applications live in a workspace. Members share the data; interfaces stay personal.
              </p>
              <ul className="mt-3 divide-y divide-[#16191e]">
                {workspaces.map((workspace) => (
                  <li key={workspace.id} className="flex items-center justify-between py-2.5">
                    <span className="text-[12.5px] text-[#c8cad2]">{workspace.name}</span>
                    <span className="rounded-full border border-[#262a32] px-2 py-0.5 text-[10.5px] text-[#82858f]">
                      {ROLE_LABEL[workspace.role]}
                    </span>
                  </li>
                ))}
              </ul>
              <NewWorkspaceForm />
            </section>
          </div>

          <aside className="lg:sticky lg:top-[72px] lg:self-start">
            <section className="rounded-[12px] border border-[#262a32] bg-gradient-to-b from-[#101216] to-[#0b0c0f] p-5 shadow-[0_24px_50px_-40px_rgba(139,124,248,0.6)]">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#8b7cf8]/14">
                  <Sparkles size={13} className="text-[#a496ff]" aria-hidden />
                </span>
                <h2 className="text-[13.5px] font-semibold text-[#e8e9ee]">
                  Generate an application
                </h2>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#82858f]">
                Pick a starting point in words. You can rebuild any page of it afterwards with the
                assistant.
              </p>
              <NewAppForm workspaces={workspaces.map(({ id, name }) => ({ id, name }))} />
            </section>

            <section className="mt-4 rounded-[12px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5f626b]">
                Interface assistant
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    provider.kind === "model" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <p className="text-[12.5px] text-[#c8cad2]">
                  {provider.kind === "model" ? "Groq connected" : "Local planner"}
                </p>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#6b6f7a]">
                {provider.kind === "model"
                  ? `Model ${provider.model}. Requests are validated server-side and never reach the browser with a key.`
                  : "No GROQ_API_KEY is configured, so interface requests use a deterministic rule planner. Add the key in .env.local for model-driven changes."}
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
