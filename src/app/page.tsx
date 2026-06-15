"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar, { type AvatarState } from "@/components/Avatar";
import { getRecognition, speak } from "@/lib/speech";
import {
  MODEL_LABELS,
  type NotifyChannel,
  type ParsedCriteria,
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
  const router = useRouter();
  const [text, setText] = useState("");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [criteria, setCriteria] = useState<ParsedCriteria | null>(null);
  const [channels, setChannels] = useState<NotifyChannel[]>(["email", "browser"]);
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(true);
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
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...criteria, rawText: text.trim(), channels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  function toggleChannel(c: NotifyChannel) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar state={avatarState} />
        <h1 className="text-2xl font-semibold">Tell me what Tesla you want</h1>
        <p className="max-w-xl text-sm text-white/60">
          Talk or type your criteria. I&apos;ll check Tesla inventory every hour
          and ping you to approve the buy the moment a match shows up.
        </p>
      </div>

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
