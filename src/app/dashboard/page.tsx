"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MODEL_LABELS,
  type MatchRecord,
  type TrackedSearch,
} from "@/lib/types";

function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

const STATUS_STYLES: Record<string, string> = {
  ok: "text-emerald-300",
  "no-results": "text-amber-300",
  error: "text-red-300",
};

export default function DashboardPage() {
  const [searches, setSearches] = useState<TrackedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/searches", { cache: "no-store" });
    if (res.ok) setSearches(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Ask for browser-notification permission up front for the "browser" channel.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    // Handle deep-linked approval from an email/SMS alert.
    const params = new URLSearchParams(window.location.search);
    const vin = params.get("approve");
    const searchId = params.get("search");
    if (vin && searchId) approve(searchId, vin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function checkNow() {
    setChecking(true);
    await fetch("/api/poll", { method: "POST" });
    setLastCheck(new Date().toISOString());
    await load();
    setChecking(false);
  }

  async function approve(searchId: string, vin: string) {
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchId, vin }),
    });
    const data = await res.json();
    if (res.ok && data.orderUrl) {
      window.open(data.orderUrl, "_blank", "noopener");
      load();
    }
  }

  async function toggleActive(s: TrackedSearch) {
    await fetch(`/api/searches/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    load();
  }

  async function remove(s: TrackedSearch) {
    await fetch(`/api/searches/${s.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-white/60">
            Hourly inventory checks across your tracked searches.
            {lastCheck && ` Last manual check ${timeAgo(lastCheck)}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={checkNow} disabled={checking} className="btn-primary">
            {checking ? "Checking…" : "Check now"}
          </button>
          <Link href="/" className="btn-ghost">
            + New search
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-white/50">Loading…</p>
      ) : searches.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-white/70">No tracked searches yet.</p>
          <Link href="/" className="btn-primary mt-4">
            Tell the assistant what you want
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {searches.map((s) => (
            <SearchCard
              key={s.id}
              search={s}
              onApprove={approve}
              onToggle={toggleActive}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchCard({
  search,
  onApprove,
  onToggle,
  onRemove,
}: {
  search: TrackedSearch;
  onApprove: (searchId: string, vin: string) => void;
  onToggle: (s: TrackedSearch) => void;
  onRemove: (s: TrackedSearch) => void;
}) {
  const matches = search.matches.filter((m) => m.isMatch);
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {search.models.map((m, i) => (
              <span
                key={i}
                className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-sm text-sky-200"
              >
                {MODEL_LABELS[m.model]}
                {m.maxMonthly ? ` ≤ $${m.maxMonthly}/mo` : ""}
                {m.maxPrice ? ` ≤ $${m.maxPrice.toLocaleString()}` : ""}
              </span>
            ))}
            <span className="text-xs uppercase tracking-wide text-white/40">
              {search.financing}
              {search.maxDownPayment === 0 ? " · $0 down" : ""}
              {" · "}
              {search.condition}
            </span>
          </div>
          {search.rawText && (
            <p className="mt-1 max-w-xl truncate text-sm text-white/50">
              “{search.rawText}”
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={search.active}
              onChange={() => onToggle(search)}
              className="accent-sky-500"
            />
            {search.active ? "Active" : "Paused"}
          </label>
          <button onClick={() => onRemove(search)} className="btn-danger px-3 py-1 text-sm">
            Delete
          </button>
        </div>
      </div>

      {/* Telemetry row: last fetch + status + inventory seen */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last fetch" value={timeAgo(search.lastFetchedAt)} />
        <Stat
          label="Status"
          value={search.lastStatus || "—"}
          className={search.lastStatus ? STATUS_STYLES[search.lastStatus] : ""}
        />
        <Stat label="Inventory seen" value={String(search.lastInventoryCount ?? "—")} />
        <Stat label="Matches" value={String(matches.length)} />
      </div>
      {search.lastSample && (
        <p className="mt-2 text-xs text-amber-300/80">
          Showing sample data — Tesla inventory couldn&apos;t be reached from the server (it blocks
          datacenter IPs). Runs from a residential IP or with a configured proxy will use live data.
        </p>
      )}
      {search.lastError && !search.lastSample && (
        <p className="mt-2 text-xs text-red-300/80">Last error: {search.lastError}</p>
      )}

      {/* Closest match (always shown so the user sees how near we got) */}
      {search.closestMatch && (
        <MatchRow
          title={search.closestMatch.isMatch ? "Best match" : "Closest so far"}
          match={search.closestMatch}
          searchId={search.id}
          onApprove={onApprove}
          approved={search.approvedVins.includes(search.closestMatch.vin)}
        />
      )}

      {/* Other confirmed matches */}
      {matches
        .filter((m) => m.vin !== search.closestMatch?.vin)
        .slice(0, 4)
        .map((m) => (
          <MatchRow
            key={m.vin}
            title="Match"
            match={m}
            searchId={search.id}
            onApprove={onApprove}
            approved={search.approvedVins.includes(m.vin)}
          />
        ))}
    </div>
  );
}

function MatchRow({
  title,
  match,
  searchId,
  onApprove,
  approved,
}: {
  title: string;
  match: MatchRecord;
  searchId: string;
  onApprove: (searchId: string, vin: string) => void;
  approved: boolean;
}) {
  return (
    <div
      className={`mt-3 rounded-xl border p-3 ${
        match.isMatch
          ? "border-emerald-400/30 bg-emerald-500/5"
          : "border-white/10 bg-black/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                match.isMatch ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/60"
              }`}
            >
              {title}
            </span>
            <span className="font-medium">
              {MODEL_LABELS[match.model]} {match.trimName}
            </span>
          </div>
          <div className="mt-1 text-sm text-white/60">
            ${match.price.toLocaleString()}
            {match.estimatedMonthly != null && (
              <> · ~${match.estimatedMonthly}/mo (est.)</>
            )}
            <span className="ml-2 text-xs text-white/40">{match.reason}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={match.orderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            View on Tesla
          </a>
          {match.isMatch && (
            <button
              onClick={() => onApprove(searchId, match.vin)}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              {approved ? "Re-open order" : "Approve & buy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-sm capitalize ${className}`}>{value}</div>
    </div>
  );
}
