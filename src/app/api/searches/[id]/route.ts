import { NextResponse } from "next/server";
import { deleteSearch, getSearch, updateSearch } from "@/lib/store";
import type { TrackedSearch } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const search = await getSearch(params.id);
  if (!search) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(search);
}

// PATCH -> toggle active / update channels, etc.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const patch = (await req.json()) as Partial<TrackedSearch>;
  const updated = await updateSearch(params.id, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ok = await deleteSearch(params.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
