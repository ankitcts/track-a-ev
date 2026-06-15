import { NextResponse } from "next/server";
import { parseCriteria } from "@/lib/claude";

export const runtime = "nodejs";

// POST /api/parse  { text: string }  -> ParsedCriteria
export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const criteria = await parseCriteria(text.trim());
    return NextResponse.json(criteria);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "parse failed" },
      { status: 500 }
    );
  }
}
