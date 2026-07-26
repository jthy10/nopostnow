import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";

const root = process.cwd();
const firebaseRc = JSON.parse(readFileSync(path.join(root, ".firebaserc"), "utf8"));
const projectId = process.argv[2] || firebaseRc.projects?.default;
const origin = (process.argv[3] || "https://example.com").replace(/\/+$/, "");
if (!projectId) throw new Error("Pass a Firebase project ID or configure .firebaserc.");

const firebaseCli = path.join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
function firebaseJson(args) {
  const result = spawnSync(
    process.execPath,
    [firebaseCli, ...args, "--project", projectId, "--json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    return JSON.parse(result.stdout || "");
  } catch {
    if (result.stderr) process.stderr.write(result.stderr);
    throw result.error || new Error(`Firebase CLI failed with status ${result.status}.`);
  }
}

const apps = firebaseJson(["apps:list", "web"]).result;
const webApp = Array.isArray(apps) ? apps.find((app) => app.state === "ACTIVE") : null;
if (!webApp?.appId) {
  throw new Error(`No active Firebase web app exists in ${projectId}.`);
}
const sdk = firebaseJson(["apps:sdkconfig", "web", webApp.appId]).result.sdkConfig;

const envPath = path.join(root, ".env.local");
let current = {};
try {
  current = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
} catch {
  // The file does not exist yet.
}

const vapid =
  current.NEXT_PUBLIC_VAPID_PUBLIC_KEY && current.VAPID_PRIVATE_KEY
    ? {
        publicKey: current.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: current.VAPID_PRIVATE_KEY,
      }
    : webpush.generateVAPIDKeys();

const values = {
  NEXT_PUBLIC_FIREBASE_API_KEY: sdk.apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: sdk.authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: sdk.projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: sdk.storageBucket,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: sdk.messagingSenderId,
  NEXT_PUBLIC_FIREBASE_APP_ID: sdk.appId,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: origin,
  FIREBASE_PROJECT_ID: sdk.projectId,
  FIREBASE_SERVICE_ACCOUNT_JSON: current.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  CRON_SECRET: current.CRON_SECRET || randomBytes(32).toString("base64url"),
  DAILY_PROMPT_TIME: current.DAILY_PROMPT_TIME || "19:00",
  DAILY_PROMPT_TIME_ZONE: current.DAILY_PROMPT_TIME_ZONE || "America/New_York",
  REQUIRE_ADMIN_MFA: current.REQUIRE_ADMIN_MFA || "true",
};

writeFileSync(
  envPath,
  `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`,
  { encoding: "utf8", mode: 0o600 },
);
console.log(`Linked .env.local to ${projectId}; generated missing local secrets.`);
