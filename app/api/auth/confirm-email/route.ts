import { createHash, timingSafeEqual } from "node:crypto";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";

const TOKEN_PATTERN = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/;

function timestampMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  return 0;
}

function equalHash(secret: string, expected: string) {
  const actualBuffer = Buffer.from(
    createHash("sha256").update(secret).digest("base64url"),
  );
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function confirmEmail(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 4096) {
    return Response.json({ error: "request too large" }, { status: 413 });
  }

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const match = TOKEN_PATTERN.exec(token);
  if (!match) {
    return Response.json({ error: "invalid confirmation link" }, { status: 400 });
  }

  const [, actionId, secret] = match;
  const db = getAdminFirestore();
  const actionRef = db.doc(`_serverEmailActions/${actionId}`);
  const snapshot = await actionRef.get();
  const data = snapshot.data() as
    | {
        uid?: string;
        oobCode?: string;
        tokenHash?: string;
        expiresAt?: unknown;
      }
    | undefined;

  if (
    !snapshot.exists ||
    typeof data?.uid !== "string" ||
    typeof data.oobCode !== "string" ||
    typeof data.tokenHash !== "string" ||
    !equalHash(secret, data.tokenHash)
  ) {
    return Response.json(
      { error: "confirmation link is invalid or has already been used" },
      { status: 404 },
    );
  }
  if (timestampMillis(data.expiresAt) <= Date.now()) {
    await actionRef.delete().catch(() => {});
    return Response.json(
      { error: "confirmation link has expired" },
      { status: 410 },
    );
  }

  const account = await getAdminAuth().getUser(data.uid).catch(() => null);
  if (!account || account.disabled) {
    await actionRef.delete().catch(() => {});
    return Response.json({ error: "account is unavailable" }, { status: 404 });
  }
  if (account.emailVerified) {
    await actionRef.delete().catch(() => {});
    return Response.json({ verified: true });
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    console.error("NEXT_PUBLIC_FIREBASE_API_KEY is missing on the server.");
    return Response.json({ error: "server configuration error" }, { status: 500 });
  }

  const firebaseResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode: data.oobCode }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!firebaseResponse.ok) {
    const result = (await firebaseResponse.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const code = result?.error?.message || "";
    if (/EXPIRED_OOB_CODE|INVALID_OOB_CODE/.test(code)) {
      await actionRef.delete().catch(() => {});
      return Response.json(
        { error: "confirmation link is invalid or has expired" },
        { status: 410 },
      );
    }
    console.error("Firebase rejected an email confirmation action.", {
      status: firebaseResponse.status,
      code,
    });
    return Response.json({ error: "unable to confirm email" }, { status: 502 });
  }

  await actionRef.delete().catch(() => {});
  return Response.json({ verified: true });
}

export async function POST(req: Request) {
  try {
    return await confirmEmail(req);
  } catch (error) {
    console.error("Email confirmation endpoint failed.", error);
    return Response.json({ error: "server configuration error" }, { status: 500 });
  }
}
