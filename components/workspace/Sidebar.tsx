"use client";

import {
  CalendarDays,
  ChartColumn,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  Columns3,
  History,
  LayoutDashboard,
  Plus,
  Sun,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { initials } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import type { AppPage } from "@/lib/interface/types";
import type { WorkspaceUser } from "./types";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "columns-3": Columns3,
  "calendar-days": CalendarDays,
  "chart-column": ChartColumn,
  sun: Sun,
  circle: Circle,
};

function PageIcon({ name, active }: { name: string; active: boolean }) {
  const Icon = ICONS[name] ?? Circle;
  return (
    <Icon
      size={14}
      aria-hidden
      className={active ? "text-[#c4baff]" : "text-[#6b6f7a] group-hover:text-[#c8cad2]"}
    />
  );
}

export function Sidebar({
  appName,
  workspaceName,
  user,
  role,
  pages,
  activePage,
  onSelectPage,
  collapsed,
  onToggleCollapse,
  onOpenHistory,
  onOpenMembers,
  onNewTask,
  canEdit,
}: {
  appName: string;
  workspaceName: string;
  user: WorkspaceUser;
  role: Role;
  pages: AppPage[];
  activePage: string;
  onSelectPage: (key: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenHistory: () => void;
  onOpenMembers: () => void;
  onNewTask: () => void;
  canEdit: boolean;
}) {
  return (
    <aside
      className="flex h-full min-h-0 flex-col border-r border-[#16191e] bg-[#0a0b0e] transition-[width] duration-150"
      style={{ width: collapsed ? 56 : 244 }}
      aria-label="Workspace navigation"
    >
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#16191e] px-3">
        <Brand compact={collapsed} />
        <button
          type="button"
          onClick={onToggleCollapse}
          className="btn btn-ghost btn-icon hidden lg:grid"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronsRight size={14} aria-hidden /> : <ChevronsLeft size={14} aria-hidden />}
        </button>
      </div>

      <div className="px-2 py-2.5">
        {!collapsed ? (
          <div className="rounded-[8px] border border-[#1c1f25] bg-[#0d0f13] px-2.5 py-2">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#4f525b]">
              {workspaceName}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] font-medium text-[#e8e9ee]" title={appName}>
              {appName}
            </p>
            <p className="mt-0.5 text-[10px] text-[#6b6f7a]">{ROLE_LABEL[role]} access</p>
          </div>
        ) : (
          <div
            className="mx-auto grid h-7 w-7 place-items-center rounded-[6px] border border-[#1c1f25] bg-[#0d0f13] text-[10px] font-semibold text-[#a496ff]"
            title={`${appName} — ${ROLE_LABEL[role]}`}
          >
            {appName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="Application pages">
        {!collapsed && (
          <p className="px-2 pb-1 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[#4f525b]">
            Pages
          </p>
        )}
        <ul className="space-y-0.5">
          {pages.map((page) => {
            const active = page.key === activePage;
            return (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => onSelectPage(page.key)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? page.title : undefined}
                  className={`group flex w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-left text-[12.5px] transition-colors ${
                    active
                      ? "bg-[#171a20] text-[#e8e9ee]"
                      : "text-[#9a9da8] hover:bg-[#12141a] hover:text-[#e8e9ee]"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <PageIcon name={page.icon} active={active} />
                  {!collapsed && <span className="truncate">{page.title}</span>}
                  {!collapsed && active && (
                    <span aria-hidden className="ml-auto h-1 w-1 rounded-full bg-[#8b7cf8]" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="my-2 h-px bg-[#16191e]" />
        <ul className="space-y-0.5">
          {canEdit && (
            <li>
              <button
                type="button"
                onClick={onNewTask}
                title={collapsed ? "New task" : undefined}
                className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-[12.5px] text-[#9a9da8] transition-colors hover:bg-[#12141a] hover:text-[#e8e9ee] ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <Plus size={14} aria-hidden className="text-[#6b6f7a]" />
                {!collapsed && "New task"}
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              onClick={onOpenHistory}
              title={collapsed ? "Version history" : undefined}
              className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-[12.5px] text-[#9a9da8] transition-colors hover:bg-[#12141a] hover:text-[#e8e9ee] ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <History size={14} aria-hidden className="text-[#6b6f7a]" />
              {!collapsed && "Version history"}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={onOpenMembers}
              title={collapsed ? "Members" : undefined}
              className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-[12.5px] text-[#9a9da8] transition-colors hover:bg-[#12141a] hover:text-[#e8e9ee] ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <Users size={14} aria-hidden className="text-[#6b6f7a]" />
              {!collapsed && "Members"}
            </button>
          </li>
        </ul>
      </nav>

      <div className="shrink-0 border-t border-[#16191e] p-2">
        <div
          className={`flex items-center gap-2 rounded-[7px] px-1.5 py-1.5 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1b1e24] text-[9.5px] font-semibold text-[#c8cad2]"
          >
            {initials(user.name)}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-medium text-[#e8e9ee]" data-testid="guest-name">
                {user.name}
              </p>
              <p className="truncate text-[10px] text-[#5f626b]">This browser</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
