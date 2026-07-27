import { timingSafeEqual } from "node:crypto";
import { sendPush } from "@/lib/push-server";

const MESSAGES = [
  "Share one honest moment from your day.",
  "What does right now look like?",
  "One photo. No pressure. No performance.",
  "Show your circle what you are up to.",
  "Today is worth remembering.",
  "The group camera roll is calling.",
  "A small moment from your day belongs here.",
  "Stop scrolling. Start sharing.",
  "No filters—just right now.",
  "Your future recap needs this photo.",
];

function clean(value?: string) {
  return (value || "").replace(/[\u{FEFF}\u{200B}-\u{200D}\s]/gu, "");
}

function secretsMatch(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function localNow(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    hour: value("hour") % 24,
    minute: value("minute"),
    dayNumber: Math.floor(
      Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000,
    ),
  };
}

export async function POST(req: Request) {
  const expected = clean(process.env.CRON_SECRET);
  const provided = clean(
    req.headers.get("x-cron-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""),
  );
  if (!expected || !provided || !secretsMatch(expected, provided)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const timeZone = process.env.DAILY_PROMPT_TIME_ZONE || "America/New_York";
  const scheduled = process.env.DAILY_PROMPT_TIME || "19:00";
  const match = scheduled.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return Response.json({ error: "invalid DAILY_PROMPT_TIME" }, { status: 500 });
  }

  const now = localNow(timeZone);
  const targetHour = Number(match[1]);
  const targetMinute = Number(match[2]);
  const minuteDelta = Math.abs(now.hour * 60 + now.minute - (targetHour * 60 + targetMinute));
  if (!body.force && minuteDelta > 15) {
    return Response.json({ skipped: "outside the configured reminder window" });
  }

  const result = await sendPush({
    preference: "dailyPrompt",
    payload: {
      title: "NoPostNow",
      body: MESSAGES[now.dayNumber % MESSAGES.length],
      url: "/feed",
      tag: "daily-prompt",
    },
  });
  return Response.json(result);
}
