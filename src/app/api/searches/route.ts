import { NextResponse } from "next/server";
import { createSearch, listSearches } from "@/lib/store";
import { pollSearchById } from "@/lib/runPoll";
import type { NotifyChannel, TrackedSearch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function baseUrlFrom(req: Request): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
  if (env) return env.startsWith("http") ? env : `https://${env}`;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// GET /api/searches -> TrackedSearch[]
export async function GET() {
  const searches = await listSearches();
  return NextResponse.json(searches);
}

// POST /api/searches -> create a tracked search from parsed criteria.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<TrackedSearch>;
    if (!body.models || body.models.length === 0) {
      return NextResponse.json(
        { error: "at least one model target is required" },
        { status: 400 }
      );
    }
    const channels: NotifyChannel[] =
      body.channels && body.channels.length
        ? body.channels
        : ["email", "browser"];

    const search = await createSearch({
      rawText: body.rawText || "",
      models: body.models,
      financing: body.financing || "lease",
      maxDownPayment: body.maxDownPayment,
      condition: body.condition || "new",
      zip: body.zip,
      radius: body.radius,
      channels,
    });

    // Run an immediate evaluation so the user sees the best available result
    // right away ("show best result now"); the hourly cron keeps checking after.
    const evaluated = await pollSearchById(search.id, baseUrlFrom(req));
    return NextResponse.json(evaluated ?? search, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "create failed" },
      { status: 500 }
    );
  }
}
