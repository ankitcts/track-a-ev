// Core polling logic, shared by the cron route (/api/poll), the CLI script, and
// the "search now" path used right after a user creates a search.
// For a search: fetch + evaluate inventory, persist telemetry + closest match,
// and notify on newly-found matches.

import { getSearch, listSearches, updateSearch } from "./store";
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

// Evaluate a single search: fetch inventory, notify on fresh matches, persist
// telemetry, and return the updated search.
export async function pollSearch(
  search: TrackedSearch,
  baseUrl: string
): Promise<{ search: TrackedSearch; summary: PollSummary }> {
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

  const updated =
    (await updateSearch(search.id, {
      lastFetchedAt: new Date().toISOString(),
      lastStatus: result.status,
      lastError: result.error,
      lastInventoryCount: result.inventoryCount,
      closestMatch: result.closest,
      matches: mergedMatches,
      notifiedVins,
    } satisfies Partial<TrackedSearch>)) ?? search;

  return {
    search: updated,
    summary: {
      searchId: search.id,
      status: result.status,
      inventoryCount: result.inventoryCount,
      newMatches: fresh.length,
      closestVin: result.closest?.vin,
    },
  };
}

// Evaluate every active search (used by the hourly cron + CLI).
export async function runPoll(baseUrl: string): Promise<PollSummary[]> {
  const searches = await listSearches();
  const summaries: PollSummary[] = [];
  for (const search of searches) {
    if (!search.active) continue;
    const { summary } = await pollSearch(search, baseUrl);
    summaries.push(summary);
  }
  return summaries;
}

// Evaluate a single search by id (used by the "search now" path).
export async function pollSearchById(
  id: string,
  baseUrl: string
): Promise<TrackedSearch | undefined> {
  const search = await getSearch(id);
  if (!search) return undefined;
  const { search: updated } = await pollSearch(search, baseUrl);
  return updated;
}

function dedupeMatches(matches: MatchRecord[]): MatchRecord[] {
  const byVin = new Map<string, MatchRecord>();
  for (const m of matches) byVin.set(m.vin, m);
  return Array.from(byVin.values()).sort((a, b) => a.price - b.price);
}
