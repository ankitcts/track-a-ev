import { NextResponse } from "next/server";
import { getSearch, updateSearch } from "@/lib/store";

export const runtime = "nodejs";

// POST /api/approve { searchId, vin } -> records approval, returns the Tesla
// order deep link. This is intentionally the only "buy" action: we never place
// an order automatically — we hand the user straight to Tesla's checkout for
// that exact VIN to confirm.
export async function POST(req: Request) {
  const { searchId, vin } = (await req.json()) as {
    searchId?: string;
    vin?: string;
  };
  if (!searchId || !vin) {
    return NextResponse.json(
      { error: "searchId and vin are required" },
      { status: 400 }
    );
  }
  const search = await getSearch(searchId);
  if (!search) return NextResponse.json({ error: "not found" }, { status: 404 });

  const match =
    search.matches.find((m) => m.vin === vin) ||
    (search.closestMatch?.vin === vin ? search.closestMatch : undefined);
  if (!match) {
    return NextResponse.json(
      { error: "vin not found for this search" },
      { status: 404 }
    );
  }

  const approvedVins = Array.from(new Set([...search.approvedVins, vin]));
  await updateSearch(searchId, { approvedVins });

  return NextResponse.json({ ok: true, orderUrl: match.orderUrl });
}
