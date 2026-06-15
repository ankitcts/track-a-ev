// Core polling cycle, shared by the cron route (/api/poll) and the CLI script.
// For each active search: fetch + evaluate inventory, persist telemetry +
// closest match, and notify on newly-found matches.

import { listSearches, updateSearch } from "./store";
import { evaluateSearch } from "./tesla";
import { notifyMatch } from "./notify";
import type { MatchRecord, TrackedSearch } from "./types";

export interface PollSummary {
  searchId: string;
  status: string;
  inventoryCount: number;
  newMatches: number;
  closestVin?: string;
}

export async function runPoll(baseUrl: string): Promise<PollSummary[]> {
  const searches = await listSearches();
  const summaries: PollSummary[] = [];

  for (const search of searches) {
    if (!search.active) continue;
    const result = await evaluateSearch(search);

    // Notify only for matches we haven't alerted on yet.
    const fresh = result.matches.filter(
      (m) => !search.notifiedVins.includes(m.vin)
    );
    for (const match of fresh) {
      await notifyMatch(search, match, baseUrl);
    }

    const mergedMatches = dedupeMatches([...search.matches, ...result.matches]);
    const notifiedVins = Array.from(
      new Set([...search.notifiedVins, ...fresh.map((m) => m.vin)])
    );

    await updateSearch(search.id, {
      lastFetchedAt: new Date().toISOString(),
      lastStatus: result.status,
      lastError: result.error,
      lastInventoryCount: result.inventoryCount,
      closestMatch: result.closest,
      matches: mergedMatches,
      notifiedVins,
    } satisfies Partial<TrackedSearch>);

    summaries.push({
      searchId: search.id,
      status: result.status,
      inventoryCount: result.inventoryCount,
      newMatches: fresh.length,
      closestVin: result.closest?.vin,
    });
  }

  return summaries;
}

function dedupeMatches(matches: MatchRecord[]): MatchRecord[] {
  const byVin = new Map<string, MatchRecord>();
  for (const m of matches) byVin.set(m.vin, m);
  return Array.from(byVin.values()).sort((a, b) => a.price - b.price);
}
