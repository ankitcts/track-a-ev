// Notification fan-out: email (Resend), SMS (Twilio), and a record for
// browser/in-app alerts (the client polls and raises a Notification).
//
// Any channel without configured credentials degrades to a console log, so the
// poller works end-to-end in development without external accounts.

import { MODEL_LABELS, type MatchRecord, type TrackedSearch } from "./types";

interface NotifyResult {
  channel: string;
  delivered: boolean;
  detail: string;
}

function subjectLine(search: TrackedSearch, match: MatchRecord): string {
  return `🚗 Match found: ${MODEL_LABELS[match.model]} ${match.trimName}`.trim();
}

function bodyText(
  search: TrackedSearch,
  match: MatchRecord,
  approveUrl: string
): string {
  const monthly =
    match.estimatedMonthly != null
      ? `~$${match.estimatedMonthly}/mo (estimated ${search.financing})`
      : "see order page";
  return [
    `A vehicle matching your tracked search just appeared in Tesla inventory.`,
    ``,
    `${MODEL_LABELS[match.model]} — ${match.trimName}`,
    `Price: $${match.price.toLocaleString()}`,
    `Estimated payment: ${monthly}`,
    `VIN: ${match.vin}`,
    ``,
    `Approve & open the order page: ${approveUrl}`,
    ``,
    `(You tracked: "${search.rawText}")`,
  ].join("\n");
}

async function sendEmail(
  subject: string,
  body: string
): Promise<NotifyResult> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || "alerts@track-a-ev.app";
  if (!key || !to) {
    console.log(`[notify:email:log] ${subject}\n${body}`);
    return { channel: "email", delivered: false, detail: "logged (no RESEND_API_KEY/NOTIFY_EMAIL_TO)" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
    return {
      channel: "email",
      delivered: res.ok,
      detail: res.ok ? `sent to ${to}` : `resend error ${res.status}`,
    };
  } catch (err) {
    return { channel: "email", delivered: false, detail: String(err) };
  }
}

async function sendSms(body: string): Promise<NotifyResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.NOTIFY_SMS_TO;
  if (!sid || !token || !from || !to) {
    console.log(`[notify:sms:log] ${body}`);
    return { channel: "sms", delivered: false, detail: "logged (Twilio not configured)" };
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
      }
    );
    return {
      channel: "sms",
      delivered: res.ok,
      detail: res.ok ? `sent to ${to}` : `twilio error ${res.status}`,
    };
  } catch (err) {
    return { channel: "sms", delivered: false, detail: String(err) };
  }
}

export async function notifyMatch(
  search: TrackedSearch,
  match: MatchRecord,
  baseUrl: string
): Promise<NotifyResult[]> {
  const approveUrl = `${baseUrl}/dashboard?approve=${match.vin}&search=${search.id}`;
  const subject = subjectLine(search, match);
  const body = bodyText(search, match, approveUrl);

  const jobs: Promise<NotifyResult>[] = [];
  if (search.channels.includes("email")) jobs.push(sendEmail(subject, body));
  if (search.channels.includes("sms")) jobs.push(sendSms(body));
  // "browser" is delivered client-side; record it as queued so the UI shows it.
  const results = await Promise.all(jobs);
  if (search.channels.includes("browser")) {
    results.push({ channel: "browser", delivered: true, detail: "queued for in-app alert" });
  }
  return results;
}
