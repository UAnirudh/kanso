"use client";

import { useMemo } from "react";
import {
  computeStats,
  priorityBreakdown,
  statusBreakdown,
  weeklyCompletions,
  type SeriesPoint,
} from "@/lib/analytics";
import type { InterfaceNode } from "@/lib/interface/types";
import { relativeTime } from "@/lib/format";
import { useSurface } from "./context";
import { EmptyHint, SurfaceCard } from "./SurfaceCard";

const METRIC_META: Record<
  string,
  { label: string; value: (stats: ReturnType<typeof computeStats>) => string; warn?: boolean }
> = {
  total: { label: "Total tasks", value: (stats) => String(stats.total) },
  open: { label: "To do", value: (stats) => String(stats.open) },
  inProgress: { label: "In progress", value: (stats) => String(stats.inProgress) },
  done: { label: "Done", value: (stats) => String(stats.done) },
  overdue: { label: "Overdue", value: (stats) => String(stats.overdue), warn: true },
  completion: { label: "Complete", value: (stats) => `${stats.completion}%` },
};

export function StatSummaryView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const stats = useMemo(() => computeStats(api.tasks), [api.tasks]);
  const metrics = Array.isArray(node.props.metrics)
    ? (node.props.metrics as string[])
    : ["total", "open", "inProgress", "done", "completion"];
  const showLabels = node.props.showLabels !== false;

  return (
    <SurfaceCard title={node.title} flush label="Overview">
      <dl className="flex flex-wrap">
        {metrics.map((metric) => {
          const meta = METRIC_META[metric];
          if (!meta) return null;
          const value = meta.value(stats);
          const alarming = meta.warn && stats.overdue > 0;
          return (
            <div
              key={metric}
              className="min-w-[112px] flex-1 border-b border-r border-[var(--s-border)] px-3.5 py-3"
            >
              <dd
                className={`text-[19px] font-semibold leading-none tracking-[-0.02em] ${
                  alarming ? "text-red-500" : "text-[var(--s-text)]"
                }`}
              >
                {value}
                {metric === "completion" && (
                  <span
                    aria-hidden
                    className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-[var(--s-panel-alt)]"
                  >
                    <span
                      className="block h-full rounded-full bg-[var(--s-accent)]"
                      style={{ width: `${stats.completion}%` }}
                    />
                  </span>
                )}
              </dd>
              {showLabels && (
                <dt className="mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-[var(--s-faint)]">
                  {meta.label}
                </dt>
              )}
            </div>
          );
        })}
      </dl>
    </SurfaceCard>
  );
}

function seriesFor(node: InterfaceNode, tasks: ReturnType<typeof useSurface>["tasks"]): SeriesPoint[] {
  const metric = String(node.props.metric ?? "weekly-completions");
  const weeks = typeof node.props.weeks === "number" ? node.props.weeks : 8;
  if (metric === "status-breakdown") return statusBreakdown(tasks);
  if (metric === "priority-breakdown") return priorityBreakdown(tasks);
  return weeklyCompletions(tasks, weeks);
}

function BarChart({ data, label }: { data: SeriesPoint[]; label: string }) {
  const max = Math.max(1, ...data.map((point) => point.value));
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-[104px] items-end gap-1.5" aria-hidden>
        {data.map((point, index) => (
          <div key={`${point.label}-${index}`} className="relative flex h-full flex-1 items-end">
            <div
              className="relative w-full rounded-t-[3px] transition-[height] duration-300"
              style={{
                height: `${Math.max(3, (point.value / max) * 88)}%`,
                background: "var(--s-accent)",
                opacity: Math.max(0.28, 1 - index * 0.06),
              }}
            >
              {point.value > 0 && (
                <span className="absolute inset-x-0 -top-3.5 text-center text-[9px] font-medium leading-none text-[var(--s-faint)]">
                  {point.value}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden>
        {data.map((point, index) => (
          <span
            key={`${point.label}-label-${index}`}
            className="min-w-0 flex-1 truncate text-center text-[8.5px] leading-none text-[var(--s-faint)]"
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, label }: { data: SeriesPoint[]; label: string }) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const points = data.map((point, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 92 - (point.value / max) * 80;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <div role="img" aria-label={label}>
      <div className="relative h-[118px]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden
        >
          {[20, 45, 70].map((y) => (
            <line
              key={y}
              x1="0"
              x2="100"
              y1={y}
              y2={y}
              stroke="var(--s-border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="var(--s-accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-1.5 flex justify-between text-[8.5px] text-[var(--s-faint)]" aria-hidden>
        {data.map((point, index) => (
          <span key={`${point.label}-${index}`} className="flex-1 text-center">
            {index % Math.max(1, Math.ceil(data.length / 6)) === 0 ? point.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProgressChartView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const data = useMemo(() => seriesFor(node, api.tasks), [api.tasks, node]);
  const variant = String(node.props.variant ?? "bar");
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const label =
    String(node.props.metric ?? "weekly-completions") === "weekly-completions"
      ? `Tasks completed per week, ${data.length} weeks, ${total} total`
      : `${node.title}: ${data.map((point) => `${point.label} ${point.value}`).join(", ")}`;

  return (
    <SurfaceCard
      title={node.title}
      badge={<span className="pill pill-low">{total} total</span>}
    >
      {data.length === 0 ? (
        <EmptyHint>No data yet.</EmptyHint>
      ) : (
        <>
          {variant === "line" ? (
            <LineChart data={data} label={label} />
          ) : (
            <BarChart data={data} label={label} />
          )}
          <table className="sr-only">
            <caption>{label}</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.label}>
                  <th scope="row">{point.label}</th>
                  <td>{point.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </SurfaceCard>
  );
}

const ACTION_TEXT: Record<string, string> = {
  created: "created",
  completed: "completed",
  reopened: "reopened",
  updated: "updated",
};

export function ActivityFeedView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const limit = typeof node.props.limit === "number" ? node.props.limit : 6;
  const items = api.activity.slice(0, limit);

  return (
    <SurfaceCard title={node.title} badge={<span className="pill pill-low">live</span>}>
      {items.length === 0 ? (
        <EmptyHint>No activity yet. Updates land here as the team works.</EmptyHint>
      ) : (
        <ol className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <span
                aria-hidden
                className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--s-accent)]"
                style={{ opacity: item.action === "completed" ? 1 : 0.45 }}
              />
              <div className="min-w-0">
                <p className="truncate text-[12px] text-[var(--s-text)]">
                  <span className="font-medium">{item.actorName}</span>{" "}
                  <span className="text-[var(--s-muted)]">
                    {ACTION_TEXT[item.action] ?? "updated"}
                  </span>{" "}
                  {item.title}
                </p>
                <time
                  dateTime={item.at}
                  className="text-[10px] text-[var(--s-faint)]"
                >
                  {relativeTime(item.at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SurfaceCard>
  );
}
