// Persistent store for tracked searches.
//
// Two backends, chosen automatically:
//   1. Vercel KV / Upstash Redis (REST) — used when KV_REST_API_URL and
//      KV_REST_API_TOKEN are set. This survives across serverless invocations,
//      so saved searches persist on refresh in production.
//   2. Local JSON file — the zero-config default for dev. NOTE: Vercel's
//      serverless filesystem is ephemeral, so this does NOT persist there;
//      connect a KV store (one click in the Vercel dashboard) for production.
//
// The rest of the app only depends on the exported functions below, so the
// backend is fully encapsulated here.

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { TrackedSearch } from "./types";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_KEY = process.env.KV_STORE_KEY || "track-a-ev:searches";
const useKv = !!(KV_URL && KV_TOKEN);

// Resolve a WRITABLE path for the file fallback. Vercel's app dir (/var/task)
// is read-only, so on serverless we must use the OS temp dir. This fallback is
// ephemeral — configure KV for real persistence.
function resolveDataFile(): string {
  if (process.env.DATA_FILE) return path.resolve(process.cwd(), process.env.DATA_FILE);
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), "track-a-ev-searches.json");
  }
  return path.resolve(process.cwd(), ".data/searches.json");
}

const DATA_FILE = resolveDataFile();

// --- Upstash/Vercel KV REST helpers ---
async function kvCommand<T>(command: unknown[]): Promise<T> {
  const res = await fetch(KV_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV ${command[0]} failed: ${res.status}`);
  const data = (await res.json()) as { result: T };
  return data.result;
}

async function read(): Promise<TrackedSearch[]> {
  if (useKv) {
    const raw = await kvCommand<string | null>(["GET", KV_KEY]);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TrackedSearch[]) : [];
    } catch {
      return [];
    }
  }
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
  if (useKv) {
    await kvCommand(["SET", KV_KEY, JSON.stringify(searches)]);
    return;
  }
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(searches, null, 2), "utf8");
  } catch (err) {
    // Never crash a request because the ephemeral file store couldn't persist.
    // (Configure KV_REST_API_* for durable, writable storage.)
    console.warn(`[store] file write failed (${DATA_FILE}); data not persisted:`, err);
  }
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
