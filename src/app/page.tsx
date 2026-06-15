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

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const ALL_CHANNELS: { id: NotifyChannel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "browser", label: "Browser" },
];

const GREETING =
  "Hi! Tell me what Tesla you're after — the model, your budget, and whether you want to lease, finance, or pay cash. I'll ask about anything you leave out.";

// Phrases that mean "I'm finished, go search now".
const DONE_RE =
  /\b(that'?s it|that'?s all|that is all|i'?m done|im done|done|search now|go ahead|find it|let'?s go|start( searching)?|that'?s everything|nothing else|no more)\b/i;

// Decide the next missing parameter to ask about. Returns null when the request
// is complete enough to evaluate.
function nextQuestion(
  transcript: string,
  criteria: ParsedCriteria
): { slot: string; q: string } | null {
  const t = transcript.toLowerCase();

  const hasModel = /(model\s*[3yxs]\b|\bm3\b|\bmy\b|\bmx\b|\bms\b|model\s*(three|why|ex|es))/.test(t);
  if (!hasModel)
    return { slot: "model", q: "Which model are you interested in — Model 3, Model Y, Model S, or Model X?" };

  const hasFinancing = /(lease|loan|financ|cash|apr|buy outright|purchase outright)/.test(t);
  if (!hasFinancing)
    return { slot: "financing", q: "Do you want to lease it, finance it with a loan, or pay cash?" };

  const hasBudget = criteria.models.some((m) => m.maxMonthly || m.maxPrice);
  if (!hasBudget)
    return {
      slot: "budget",
      q:
        criteria.financing === "cash"
          ? "What's the most you'd want to spend in total?"
          : "What's your maximum monthly payment? You can give a different number per model.",
    };

  if (criteria.financing !== "cash") {
    const hasDown = /(down|put down|due at signing|drive[- ]?off)/.test(t);
    if (!hasDown)
      return { slot: "down", q: "How much can you put down — or are you after a zero-down offer?" };
  }

  const hasCondition = /(\bnew\b|\bused\b|pre[- ]?owned|second hand|second-hand)/.test(t);
  if (!hasCondition)
    return { slot: "condition", q: "Should I look at new vehicles, used, or either?" };

  const hasZip = /\b\d{5}\b/.test(t) || /(anywhere|any location|no preference|doesn'?t matter|whole country|nationwide)/.test(t);
  if (!hasZip)
    return { slot: "zip", q: "Any preferred zip code or area, or should I search anywhere in the US?" };

  return null; // complete
}

export default function AssistantPage() {
  const [conversing, setConversing] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [criteria, setCriteria] = useState<ParsedCriteria | null>(null);
  const [channels, setChannels] = useState<NotifyChannel[]>(["email", "browser"]);
  const [result, setResult] = useState<TrackedSearch | null>(null);
  const [text, setText] = useState("");
  const [micSupported, setMicSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const conversingRef = useRef(false);
  const transcriptRef = useRef("");
  const recRef = useRef<ReturnType<typeof getRecognition>>(null);

  useEffect(() => {
    setMicSupported(!!getRecognition());
  }, []);

  // --- speech helpers -----------------------------------------------------

  function say(text: string): Promise<void> {
    return new Promise((resolve) => {
      speak(
        text,
        () => setAvatarState("speaking"),
        () => {
          setAvatarState("idle");
          resolve();
        }
      );
    });
  }

  // Listen for a single utterance, resolving with the finalized transcript.
  function listenOnce(): Promise<string> {
    return new Promise((resolve) => {
      const rec = getRecognition();
      if (!rec) {
        resolve("");
        return;
      }
      recRef.current = rec;
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = "";
      rec.onresult = (e) => {
        let s = "";
        for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
        finalText = s;
        setInterim(s);
      };
      rec.onerror = () => {};
      rec.onend = () => {
        setInterim("");
        setListening(false);
        setAvatarState("idle");
        resolve(finalText.trim());
      };
      setListening(true);
      setAvatarState("listening");
      try {
        rec.start();
      } catch {
        resolve("");
      }
    });
  }

  // --- conversation core --------------------------------------------------

  async function parseRemote(transcript: string): Promise<ParsedCriteria> {
    setThinking(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not understand that");
      return data as ParsedCriteria;
    } finally {
      setThinking(false);
    }
  }

  // Process one user turn. Returns true when the request is complete and we've
  // started the evaluation.
  async function processTurn(userText: string): Promise<boolean> {
    const transcript = `${transcriptRef.current} ${userText}`.trim();
    transcriptRef.current = transcript;
    setMessages((m) => [...m, { role: "user", text: userText }]);

    let parsed: ParsedCriteria;
    try {
      parsed = await parseRemote(transcript);
    } catch (err) {
      const msg = "Sorry, I didn't catch that — could you say it again?";
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
      await say(msg);
      return false;
    }
    setCriteria(parsed);

    const wantsDone = DONE_RE.test(userText);
    const nq = nextQuestion(transcript, parsed);

    if (wantsDone || !nq) {
      const closing = `${parsed.summary} Searching now…`;
      setMessages((m) => [...m, { role: "assistant", text: closing }]);
      await say(closing);
      conversingRef.current = false;
      setConversing(false);
      await evaluate(parsed);
      return true;
    }

    setMessages((m) => [...m, { role: "assistant", text: nq.q }]);
    await say(nq.q);
    return false;
  }

  async function voiceLoop() {
    // Re-prompt at most a couple of times on silence before giving up.
    let silentTurns = 0;
    while (conversingRef.current) {
      const utter = await listenOnce();
      if (!conversingRef.current) break;
      if (!utter) {
        silentTurns += 1;
        if (silentTurns >= 2) {
          await say("I'll stop listening for now. Tap me or type when you're ready.");
          conversingRef.current = false;
          setConversing(false);
          break;
        }
        continue;
      }
      silentTurns = 0;
      const done = await processTurn(utter);
      if (done) break;
    }
  }

  async function startConversation() {
    setResult(null);
    setError(null);
    setMessages([]);
    setCriteria(null);
    transcriptRef.current = "";
    conversingRef.current = true;
    setConversing(true);
    setMessages([{ role: "assistant", text: GREETING }]);
    await say(GREETING);
    if (micSupported) voiceLoop();
  }

  function stopConversation() {
    conversingRef.current = false;
    setConversing(false);
    recRef.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setAvatarState("idle");
  }

  // Typed turn (works with or without a mic).
  async function submitText() {
    const value = text.trim();
    if (!value || thinking) return;
    setText("");
    if (!conversingRef.current) {
      // Start a (text-driven) conversation seeded with this first turn.
      setResult(null);
      setError(null);
      setMessages([]);
      transcriptRef.current = "";
      conversingRef.current = true;
      setConversing(true);
    }
    await processTurn(value);
  }

  function onAvatarClick() {
    if (conversing) stopConversation();
    else startConversation();
  }

  // --- evaluation + approval ---------------------------------------------

  async function evaluate(c: ParsedCriteria) {
    setError(null);
    try {
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, rawText: transcriptRef.current.trim(), channels }),
      });
      const data = (await res.json()) as TrackedSearch & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save");
      setResult(data);
      await say(spokenResult(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
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
    stopConversation();
    setResult(null);
    setCriteria(null);
    setMessages([]);
    transcriptRef.current = "";
    setText("");
  }

  function toggleChannel(c: NotifyChannel) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  const statusLabel = thinking
    ? "Thinking…"
    : listening
    ? "Listening…"
    : avatarState === "speaking"
    ? "Speaking…"
    : conversing
    ? "Ready"
    : "Tap me to talk";

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar state={avatarState} onClick={onAvatarClick} />
        <div className="text-xs uppercase tracking-wider text-sky-300/80">{statusLabel}</div>
        <h1 className="text-2xl font-semibold">Let&apos;s find your Tesla</h1>
        <p className="max-w-xl text-sm text-white/60">
          Tap the avatar and talk. I&apos;ll keep the conversation going, ask
          about anything you skip, and start the search as soon as we&apos;re done.
        </p>
        <div className="mt-1 flex gap-2">
          {!conversing ? (
            <button onClick={startConversation} className="btn-primary">
              {micSupported ? "Start conversation" : "Start (type below)"}
            </button>
          ) : (
            <button onClick={stopConversation} className="btn-ghost">
              Stop
            </button>
          )}
          {(messages.length > 0 || result) && (
            <button onClick={reset} className="btn-ghost">
              Reset
            </button>
          )}
        </div>
        {!micSupported && (
          <span className="text-xs text-amber-300/80">
            Voice input isn&apos;t supported in this browser — type your answers below.
          </span>
        )}
      </div>

      {/* Conversation transcript */}
      {messages.length > 0 && (
        <div className="card w-full max-w-2xl space-y-3 p-5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-sky-500/20 text-sky-50"
                    : "bg-white/5 text-white/80"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {interim && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-sky-500/10 px-3 py-2 text-sm italic text-sky-200/70">
                {interim}…
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live understanding of the criteria as the conversation progresses */}
      {criteria && !result && <CriteriaChips criteria={criteria} />}

      {/* Text input — always available as a fallback / supplement */}
      {!result && (
        <div className="card w-full max-w-2xl p-4">
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitText();
              }}
              placeholder={
                conversing
                  ? "Type your answer…"
                  : "Or type, e.g. Model 3 or Y, lease, $0 down, under $300/mo for the 3…"
              }
              className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-sky-400/60"
            />
            <button onClick={submitText} disabled={thinking || !text.trim()} className="btn-primary">
              Send
            </button>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
              Notify me via
            </div>
            <div className="flex gap-2">
              {ALL_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleChannel(c.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
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
        </div>
      )}

      {error && (
        <div className="w-full max-w-2xl rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && <ResultCard search={result} onApprove={approve} onReset={reset} />}
    </div>
  );
}

function CriteriaChips({ criteria }: { criteria: ParsedCriteria }) {
  return (
    <div className="flex w-full max-w-2xl flex-wrap items-center gap-2 text-xs">
      {criteria.models.map((m, i) => (
        <span key={i} className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-200">
          {MODEL_LABELS[m.model]}
          {m.maxMonthly ? ` ≤ $${m.maxMonthly}/mo` : ""}
          {m.maxPrice ? ` ≤ $${m.maxPrice.toLocaleString()}` : ""}
        </span>
      ))}
      <Chip label={criteria.financing} />
      {criteria.maxDownPayment === 0 && <Chip label="$0 down" />}
      {criteria.maxDownPayment ? <Chip label={`≤ $${criteria.maxDownPayment} down`} /> : null}
      <Chip label={criteria.condition} />
      {criteria.zip && <Chip label={`near ${criteria.zip}`} />}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 capitalize text-white/70">
      {label}
    </span>
  );
}

// What the avatar says aloud after a search runs.
function spokenResult(search: TrackedSearch): string {
  const m = search.closestMatch;
  if (!m) {
    if (search.lastStatus === "error")
      return "I've saved your search, but I couldn't reach Tesla inventory right now. I'll keep checking every hour and alert you when something matches.";
    return "I've saved your search. Nothing matches in inventory yet, but I'll keep checking every hour and alert you the moment one shows up.";
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
