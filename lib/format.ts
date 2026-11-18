const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "No date";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatDateLong(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatMonth(year: number, month: number): string {
  return `${MONTHS[((month % 12) + 12) % 12]} ${year}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(iso);
}

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

export function dueMeta(value: string | null | undefined): { label: string; tone: DueTone } {
  const date = parseDate(value);
  if (!date) return { label: "No due date", tone: "none" };
  const today = parseDate(todayIso())!;
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, tone: "overdue" };
  }
  if (days === 0) return { label: "Due today", tone: "today" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  if (days <= 6) return { label: `Due in ${days}d`, tone: "soon" };
  return { label: formatDate(value), tone: "later" };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
