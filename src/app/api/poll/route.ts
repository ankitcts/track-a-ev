import { NextResponse } from "next/server";
import { runPoll } from "@/lib/runPoll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 60s on Vercel for the inventory round-trips.
export const maxDuration = 60;

function baseUrlFrom(req: Request): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
  if (env) return env.startsWith("http") ? env : `https://${env}`;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// GET /api/poll — invoked hourly by Vercel cron (see vercel.json).
// Protected by CRON_SECRET when set: Vercel sends `Authorization: Bearer <secret>`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const summaries = await runPoll(baseUrlFrom(req));
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    searches: summaries.length,
    results: summaries,
  });
}

// Allow manual triggering from the dashboard ("Check now") without the secret,
// so users can force a refresh on demand.
export async function POST(req: Request) {
  const summaries = await runPoll(baseUrlFrom(req));
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    searches: summaries.length,
    results: summaries,
  });
}
