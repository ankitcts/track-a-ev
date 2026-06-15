"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar, { type AvatarState } from "@/components/Avatar";
import { getRecognition, speak } from "@/lib/speech";
import {
  MODEL_LABELS,
  type MatchRecord,
  type NotifyChannel,
  type ParsedCriteria,
  type TrackedSearch,
} from "@/lib/types";

const EXAMPLES = [
  "I want a Model 3 or Y on lease, $0 down, under $300/mo for the 3 and under $400 for the Y.",
  "New Model Y Long Range under $48,000 near 95134.",
  "Used Model S, cash, under $60k.",
];

const ALL_CHANNELS: { id: NotifyChannel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "browser", label: "Browser" },
];

export default function AssistantPage() {
  const [text, setText] = useState("");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [criteria, setCriteria] = useState<ParsedCriteria | null>(null);
  const [channels, setChannels] = useState<NotifyChannel[]>(["email", "browser"]);
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(true);
  const [result, setResult] = useState<TrackedSearch | null>(null);
  const recRef = useRef<ReturnType<typeof getRecognition>>(null);

  useEffect(() => {
    setMicSupported(!!getRecognition());
  }, []);

  function toggleListening() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setMicSupported(false);
      return;
    }
    recRef.current = rec;
    let finalText = text ? text + " " : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        interim += e.results[i][0].transcript;
      }
      setText((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      setAvatarState("idle");
    };
    setListening(true);
    setAvatarState("listening");
    rec.start();
  }

  async function handleParse() {
    const value = text.trim();
    if (!value) return;
    setParsing(true);
    setError(null);
    setCriteria(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not understand that");
      setCriteria(data as ParsedCriteria);
      speak(
        data.summary,
        () => setAvatarState("speaking"),
        () => setAvatarState("idle")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!criteria) return;
    setSaving(true);
    setError(null);
    try {
      // Creating the search also runs an immediate evaluation, so the response
      // already carries the best available result.
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...criteria, rawText: text.trim(), channels }),
      });
      const data = (await res.json()) as TrackedSearch & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save");
      setResult(data);
      setCriteria(null);
      speak(
        spokenResult(data),
        () => setAvatarState("speaking"),
        () => setAvatarState("idle")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function approve(searchId: string, vin: string) {
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchId, vin }),
    });
    const data = await res.json();
    if (res.ok && data.orderUrl) window.open(data.orderUrl, "_blank", "noopener");
  }

  function reset() {
    setResult(null);
    setCriteria(null);
    setText("");
  }

  function toggleChannel(c: NotifyChannel) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar state={avatarState} onClick={toggleListening} />
        <h1 className="text-2xl font-semibold">Tell me what Tesla you want</h1>
        <p className="max-w-xl text-sm text-white/60">
          Tap the avatar (or the mic) and talk, or type your criteria. I&apos;ll
          find the best match now and keep checking inventory every hour.
        </p>
      </div>

      {!result && (
      <div className="card w-full max-w-2xl p-5">
        <div className="flex items-start gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Model 3 or Y on lease, $0 down, under $300/mo for the 3, under $400 for the Y…"
            rows={3}
            className="flex-1 resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/60"
          />
          <button
            onClick={toggleListening}
            disabled={!micSupported}
            title={micSupported ? "Speak your criteria" : "Voice input not supported in this browser"}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition ${
              listening
                ? "border-sky-400 bg-sky-500/30 text-sky-200"
                : "border-white/15 hover:bg-white/10"
            } disabled:opacity-40`}
          >
            {listening ? "■" : "🎙"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            className="btn-primary"
          >
            {parsing ? "Understanding…" : "Understand my request"}
          </button>
          {!micSupported && (
            <span className="text-xs text-amber-300/80">
              Voice not supported here — type instead.
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:bg-white/10"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
      )}

      {result && (
        <ResultCard search={result} onApprove={approve} onReset={reset} />
      )}

      {error && (
        <div className="w-full max-w-2xl rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {criteria && (
        <div className="card w-full max-w-2xl p-5">
          <h2 className="mb-1 text-lg font-semibold">Here&apos;s what I understood</h2>
          <p className="mb-4 text-sm text-white/60">{criteria.summary}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Financing" value={criteria.financing} />
            <Detail label="Condition" value={criteria.condition} />
            <Detail
              label="Down payment"
              value={
                criteria.maxDownPayment === 0
                  ? "$0 down"
                  : criteria.maxDownPayment
                  ? `≤ $${criteria.maxDownPayment.toLocaleString()}`
                  : "Any"
              }
            />
            <Detail label="Location" value={criteria.zip ? `near ${criteria.zip}` : "Anywhere (US)"} />
          </div>

          <div className="mt-4 space-y-2">
            {criteria.models.map((m, i) => (
              <div
                key={`${m.model}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
              >
                <span className="font-medium">{MODEL_LABELS[m.model]}</span>
                <span className="text-white/60">
                  {m.maxMonthly ? `≤ $${m.maxMonthly}/mo` : ""}
                  {m.maxPrice ? `${m.maxMonthly ? " · " : ""}≤ $${m.maxPrice.toLocaleString()}` : ""}
                  {!m.maxMonthly && !m.maxPrice ? "Any price" : ""}
                  {m.trim ? ` · ${m.trim}` : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wider text-white/50">
              Notify me via
            </div>
            <div className="flex gap-2">
              {ALL_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleChannel(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    channels.includes(c.id)
                      ? "border-sky-400 bg-sky-500/20 text-sky-100"
                      : "border-white/15 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={handleSave} disabled={saving || channels.length === 0} className="btn-primary">
              {saving ? "Saving…" : "Track this & start checking hourly"}
            </button>
            <button onClick={() => setCriteria(null)} className="btn-ghost">
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-sm capitalize">{value}</div>
    </div>
  );
}

// What the avatar says aloud after a search runs.
function spokenResult(search: TrackedSearch): string {
  const m = search.closestMatch;
  if (!m) {
    if (search.lastStatus === "error")
      return "I saved your search, but couldn't reach Tesla inventory right now. I'll keep checking every hour and alert you when something matches.";
    return "I saved your search. Nothing matches in inventory yet, but I'll keep checking every hour and alert you the moment one shows up.";
  }
  if (m.isMatch)
    return `Good news — I found a match: a ${MODEL_LABELS[m.model]} for $${m.price.toLocaleString()}. Review it below and approve to buy. I'll keep checking for more.`;
  return `The closest I found right now is a ${MODEL_LABELS[m.model]} at $${m.price.toLocaleString()}, but it ${m.reason.toLowerCase()}. I'll keep checking every hour and alert you when one fully matches.`;
}

function ResultCard({
  search,
  onApprove,
  onReset,
}: {
  search: TrackedSearch;
  onApprove: (searchId: string, vin: string) => void;
  onReset: () => void;
}) {
  const m: MatchRecord | undefined = search.closestMatch;
  return (
    <div className="card w-full max-w-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-200">
          Saved · checking hourly
        </span>
        <span className="text-xs text-white/40">
          {search.lastInventoryCount ?? 0} vehicles scanned just now
        </span>
      </div>

      <h2 className="text-lg font-semibold">
        {m ? (m.isMatch ? "Best match right now" : "Closest right now") : "No results yet"}
      </h2>

      {m ? (
        <div
          className={`mt-3 rounded-xl border p-4 ${
            m.isMatch
              ? "border-emerald-400/30 bg-emerald-500/5"
              : "border-white/10 bg-black/20"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-medium">
                {MODEL_LABELS[m.model]} {m.trimName}
              </div>
              <div className="mt-1 text-sm text-white/60">
                ${m.price.toLocaleString()}
                {m.estimatedMonthly != null && <> · ~${m.estimatedMonthly}/mo (est.)</>}
              </div>
              <div className="mt-1 text-xs text-white/40">{m.reason}</div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={m.orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost px-3 py-1.5 text-sm"
              >
                View on Tesla
              </a>
              {m.isMatch && (
                <button
                  onClick={() => onApprove(search.id, m.vin)}
                  className="btn-primary px-3 py-1.5 text-sm"
                >
                  Approve &amp; buy
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-white/60">
          {search.lastStatus === "error"
            ? "Couldn't reach Tesla inventory just now — I'll keep retrying every hour."
            : "Nothing in inventory matches yet. I'll keep checking every hour."}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <Link href="/dashboard" className="btn-primary">
          View dashboard
        </Link>
        <button onClick={onReset} className="btn-ghost">
          New search
        </button>
      </div>
    </div>
  );
}
