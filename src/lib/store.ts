// File-backed JSON store for tracked searches.
//
// This is deliberately simple so the app runs with zero external services.
// NOTE: Vercel's serverless filesystem is ephemeral and not shared between
// invocations — for production, replace the read()/write() bodies with Vercel
// KV, Postgres, Redis, etc. The rest of the app only depends on the exported
// functions below, so swapping the backend is a localized change.

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { TrackedSearch } from "./types";

const DATA_FILE = path.resolve(
  process.cwd(),
  process.env.DATA_FILE || ".data/searches.json"
);

async function read(): Promise<TrackedSearch[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedSearch[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function write(searches: TrackedSearch[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(searches, null, 2), "utf8");
}

export async function listSearches(): Promise<TrackedSearch[]> {
  return read();
}

export async function getSearch(id: string): Promise<TrackedSearch | undefined> {
  return (await read()).find((s) => s.id === id);
}

export async function createSearch(
  data: Omit<
    TrackedSearch,
    "id" | "createdAt" | "matches" | "notifiedVins" | "approvedVins" | "active"
  > & { active?: boolean }
): Promise<TrackedSearch> {
  const searches = await read();
  const search: TrackedSearch = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    active: data.active ?? true,
    matches: [],
    notifiedVins: [],
    approvedVins: [],
    ...data,
  };
  searches.push(search);
  await write(searches);
  return search;
}

export async function updateSearch(
  id: string,
  patch: Partial<TrackedSearch>
): Promise<TrackedSearch | undefined> {
  const searches = await read();
  const idx = searches.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  searches[idx] = { ...searches[idx], ...patch, id };
  await write(searches);
  return searches[idx];
}

export async function deleteSearch(id: string): Promise<boolean> {
  const searches = await read();
  const next = searches.filter((s) => s.id !== id);
  if (next.length === searches.length) return false;
  await write(next);
  return true;
}
