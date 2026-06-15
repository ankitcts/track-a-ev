import { NextResponse } from "next/server";
import { createSearch, listSearches } from "@/lib/store";
import type { NotifyChannel, TrackedSearch } from "@/lib/types";

export const runtime = "nodejs";

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
    return NextResponse.json(search, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "create failed" },
      { status: 500 }
    );
  }
}
