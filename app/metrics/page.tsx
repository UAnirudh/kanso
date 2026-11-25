import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { loadAiMetrics } from "@/lib/ai/metrics-query";
import { providerInfo } from "@/lib/ai/provider";
import { initials } from "@/lib/format";
import { requireGuest } from "@/lib/identity";

export const dynamic = "force-dynamic";

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function millis(value: number | null): string {
  return value === null ? "—" : `${count(value)} ms`;
}

/**
 * A read-only rendering of `/api/metrics`, for the same numbers without curl.
 * The server component reads the repo directly rather than fetching its own API;
 * `loadAiMetrics` is the shared definition of the window and the scope.
 */
export default async function MetricsPage() {
  const guest = await requireGuest();
  const metrics = loadAiMetrics(guest.id);
  const provider = providerInfo();
  const { spend, proposals, latencyMs, tokens } = metrics;

  const since = new Date(metrics.window.since).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const outcomes = [
    { label: "Applied", count: proposals.applied, hint: "accepted and versioned" },
    { label: "Pending", count: proposals.pending, hint: "previewed, not decided" },
    { label: "Discarded", count: proposals.discarded, hint: "previewed, rejected" },
    { label: "Failed", count: proposals.failed, hint: "validation or provider error" },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[#1c1f25] bg-[#08090b]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
          <Brand />
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-full border border-[#1c1f25] bg-[#0d0f13] px-2.5 py-1 text-[11.5px] text-[#82858f] transition-colors hover:border-[#353a45] hover:text-[#c8cad2]"
            >
              <ArrowLeft size={12} aria-hidden />
              Dashboard
            </Link>
            <span className="hidden items-center gap-1.5 text-[11px] text-[#5f626b] sm:flex">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  provider.kind === "model" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {provider.kind === "model" ? `Groq · ${provider.model}` : "Local planner (no API key)"}
            </span>
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-full bg-[#1b1e24] text-[10px] font-semibold text-[#c8cad2]"
            >
              {initials(guest.name)}
            </span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-5 py-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f626b]">
          AI operations
        </p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">
          What the assistant costs, and how often it lands.
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#82858f]">
          Proposals from the last {metrics.window.days} days in the workspaces this browser belongs
          to. Spend is global, because the daily cap is the budget that decides whether new
          requests run at all.
        </p>
        <p className="mt-2 text-[11.5px] text-[#5f626b]">
          Since {since} · read-only · same numbers as{" "}
          <code className="rounded-[4px] border border-[#1c1f25] bg-[#0b0c0f] px-1 py-0.5 text-[10.5px] text-[#a2a5b0]">
            /api/metrics
          </code>
        </p>

        <dl className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
              Spend today
            </dt>
            <dd className="mt-2">
              <span className="block text-[22px] font-semibold tracking-[-0.02em] text-[#e8e9ee]">
                {count(spend.today)}
                <span className="ml-1.5 text-[11px] font-normal text-[#82858f]">tokens</span>
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#6b6f7a]">
                {spend.cap === null
                  ? "No daily cap is set."
                  : `${Math.round((spend.today / spend.cap) * 100)}% of ${count(spend.cap)} · ${count(
                      spend.remaining ?? 0,
                    )} left today`}
              </span>
            </dd>
          </div>

          <div className="rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
              Acceptance rate
            </dt>
            <dd className="mt-2">
              <span className="block text-[22px] font-semibold tracking-[-0.02em] text-[#e8e9ee]">
                {percent(proposals.acceptanceRate)}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#6b6f7a]">
                {count(proposals.applied)} applied of {count(proposals.total)} generated
              </span>
            </dd>
          </div>

          <div className="rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
              Proposals
            </dt>
            <dd className="mt-2">
              <span className="block text-[22px] font-semibold tracking-[-0.02em] text-[#e8e9ee]">
                {count(proposals.total)}
                <span className="ml-1.5 text-[11px] font-normal text-[#82858f]">
                  in {metrics.window.days} days
                </span>
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#6b6f7a]">
                {count(proposals.pending)} pending a decision
              </span>
            </dd>
          </div>

          <div className="rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
              p50 latency
            </dt>
            <dd className="mt-2">
              <span className="block text-[22px] font-semibold tracking-[-0.02em] text-[#e8e9ee]">
                {millis(latencyMs.p50)}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#6b6f7a]">
                median over {count(latencyMs.samples)}{" "}
                {latencyMs.samples === 1 ? "sample" : "samples"}
              </span>
            </dd>
          </div>

          <div className="rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
              p95 latency
            </dt>
            <dd className="mt-2">
              <span className="block text-[22px] font-semibold tracking-[-0.02em] text-[#e8e9ee]">
                {millis(latencyMs.p95)}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#6b6f7a]">
                slow tail, same {count(latencyMs.samples)}{" "}
                {latencyMs.samples === 1 ? "sample" : "samples"}
              </span>
            </dd>
          </div>

          <div className="rounded-[11px] border border-[#1c1f25] bg-[#0b0c0f] p-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
              Tokens per applied change
            </dt>
            <dd className="mt-2">
              <span className="block text-[22px] font-semibold tracking-[-0.02em] text-[#e8e9ee]">
                {tokens.perAppliedChange === null ? "—" : count(tokens.perAppliedChange)}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#6b6f7a]">
                {count(tokens.total)} tokens over the window
              </span>
            </dd>
          </div>
        </dl>

        <section className="mt-8 rounded-[12px] border border-[#1c1f25] bg-[#0b0c0f] p-5">
          <h2 className="text-[13px] font-semibold text-[#c8cad2]">Proposal outcomes</h2>
          <p className="mt-1 text-[12px] text-[#6b6f7a]">
            Every proposal the assistant generated, by what happened to it. Acceptance counts
            applied over generated — a discarded preview still counts as generated.
          </p>

          <table className="mt-3 w-full text-[12.5px]">
            <caption className="sr-only">
              Proposals by outcome in the last {metrics.window.days} days
            </caption>
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-[#5f626b]">
                <th scope="col" className="pb-2 font-semibold">
                  Outcome
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Proposals
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Share
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#16191e]">
              {outcomes.map((outcome) => (
                <tr key={outcome.label}>
                  <th scope="row" className="py-2.5 text-left font-normal">
                    <span className="block text-[#c8cad2]">{outcome.label}</span>
                    <span className="block text-[10.5px] text-[#5f626b]">{outcome.hint}</span>
                  </th>
                  <td className="py-2.5 text-right tabular-nums text-[#e8e9ee]">
                    {count(outcome.count)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-[#82858f]">
                    {proposals.total === 0
                      ? "—"
                      : `${Math.round((outcome.count / proposals.total) * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#262a32] text-[#c8cad2]">
                <th scope="row" className="py-2.5 text-left font-medium">
                  Total generated
                </th>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {count(proposals.total)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-[#82858f]">
                  {proposals.total === 0 ? "—" : "100%"}
                </td>
              </tr>
            </tfoot>
          </table>

          {proposals.total === 0 && (
            <p className="mt-4 rounded-[10px] border border-dashed border-[#262a32] px-4 py-3 text-[12px] leading-relaxed text-[#6b6f7a]">
              Nothing in this window yet. Ask the assistant for a change on any application and its
              outcome will appear here —{" "}
              <Link
                href="/dashboard"
                className="text-[#a496ff] underline-offset-2 hover:underline"
              >
                go to your applications
              </Link>
              .
            </p>
          )}
        </section>

        <p className="mt-6 text-[11px] leading-relaxed text-[#5f626b]">
          The local planner records no tokens, so a run without a model key shows real acceptance
          and latency with zero spend. Percentiles are nearest-rank.
        </p>
      </main>
    </div>
  );
}
