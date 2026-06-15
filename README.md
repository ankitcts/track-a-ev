# Track-a-EV ⚡

A conversational Tesla inventory tracker. **Tell the assistant what you want**
(by voice or text), it **watches Tesla inventory every hour**, and the moment a
vehicle matches your criteria it **notifies you and lets you approve the buy** —
opening that exact VIN's Tesla order page for checkout.

> Example: _"I want a Model 3 or Y on lease, $0 down, under $300/mo for the 3
> and under $400 for the Y."_

## Features

- 🎙 **Voice + text assistant** with an animated avatar (Web Speech API for
  speech-to-text and read-back; text fallback everywhere).
- 🧠 **Natural-language parsing** via Claude (`claude-haiku-4-5`) into structured
  criteria — per-model monthly caps, financing, down payment, condition, location.
  Falls back to a built-in heuristic parser when no API key is set, so the demo
  always works.
- ⏱ **Hourly polling** of Tesla's inventory API (Vercel Cron), with graceful
  failure handling.
- 📊 **Dashboard** showing each search's **last fetch time**, **status**,
  inventory seen, and the **closest match so far** (not just exact matches).
- 🔔 **Notifications** via **email (Resend)**, **SMS (Twilio)**, and
  **browser** alerts. Unconfigured channels log to the console.
- ✅ **Approve-to-buy**: matches deep-link to the Tesla order page for that VIN.
  We never place an order automatically.

## Architecture

```
src/
  app/
    page.tsx              Assistant screen — avatar + voice/text → parsed criteria
    dashboard/page.tsx    Tracked searches, last-fetch telemetry, closest match, approve
    api/
      parse/route.ts      NL → structured criteria (Claude, with heuristic fallback)
      searches/route.ts   List / create tracked searches
      searches/[id]/...   Get / patch (pause) / delete
      poll/route.ts       Hourly cron entry (CRON_SECRET-protected); POST = "check now"
      approve/route.ts    Records approval, returns Tesla order deep link
  components/Avatar.tsx   Dependency-free animated avatar (idle/listening/speaking)
  lib/
    types.ts              Domain types
    claude.ts             Claude parser + deterministic fallback
    tesla.ts              Inventory client + criteria matching/scoring
    lease.ts              Lease/loan monthly payment estimation
    notify.ts             Email/SMS/browser fan-out
    store.ts              File-backed JSON store (swap for KV/Postgres in prod)
    runPoll.ts            One polling cycle (used by cron + CLI)
```

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys (all optional for a local demo)
npm run dev                  # http://localhost:3000
```

Trigger a polling cycle manually:

```bash
npm run poll                 # or click "Check now" in the dashboard
```

## Configuration

All env vars are **optional** — each unset integration degrades gracefully
(see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude NL parsing (else heuristic fallback) |
| `CRON_SECRET` | Authorizes the hourly `/api/poll` cron on Vercel |
| `RESEND_API_KEY`, `NOTIFY_EMAIL_TO`, `NOTIFY_EMAIL_FROM` | Email alerts |
| `TWILIO_*`, `NOTIFY_SMS_TO` | SMS alerts |
| `DATA_FILE` | Path for the file-backed store |

## Deployment (Vercel)

`vercel.json` registers a **daily** cron hitting `/api/poll`. Set `CRON_SECRET`
(and any notification keys) in the Vercel project settings.

### Polling frequency

The Vercel cron is **daily** because Vercel's **Hobby plan only allows
once-per-day crons**. To check **hourly** (the product's intent), either:

1. **Upgrade the Vercel project to Pro** and change the schedule in
   `vercel.json` to `0 * * * *`, or
2. **Point a free external scheduler** (e.g. [cron-job.org](https://cron-job.org),
   UptimeRobot) at `https://<your-app>/api/poll` every hour. Send
   `Authorization: Bearer <CRON_SECRET>` if you set `CRON_SECRET`.

The polling logic is identical regardless of what triggers it; the dashboard
"Check now" button (POST `/api/poll`) also runs a cycle on demand.

### Persistence

Tracked searches are saved so they're still there when you refresh. The store
(`src/lib/store.ts`) picks a backend automatically:

- **Vercel KV / Upstash Redis** when `KV_REST_API_URL` + `KV_REST_API_TOKEN`
  are set — **this is what makes searches persist in production.** Connect a KV
  store from the Vercel dashboard (Storage tab) and redeploy; Vercel injects
  those env vars for you.
- **Local JSON file** otherwise (great for dev). ⚠️ Vercel's filesystem is
  **ephemeral**, so without a KV store, searches won't survive on the deployed
  app — connect KV for production.

## Notes & limitations

- The Tesla inventory endpoint is **unofficial/undocumented** and may change,
  rate-limit, or geo-block. The poller treats failures gracefully and records
  them on the dashboard.
- Tesla **403s datacenter/cloud IPs** (so on Vercel you'll see labeled *sample
  data* by default). To get **live** data there, set **`TESLA_PROXY_URL`** to a
  residential scraping-proxy endpoint (see `.env.example`); requests are routed
  through it. The query already matches Tesla's real shape, including
  `PaymentType` + server-side `paymentRange`, so lease-payment filtering happens
  on Tesla's side when reachable.
- **Lease/loan monthly figures are estimates** (Tesla's API doesn't expose a
  reliable quote). The real number is confirmed on the Tesla order page at
  approval time.
- We **never auto-purchase**. The "buy" action records your approval and opens
  Tesla's checkout for that exact VIN for you to confirm.
