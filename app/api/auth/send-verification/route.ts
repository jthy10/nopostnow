import { createHash, randomBytes } from "node:crypto";
import { ApiAuthError, authErrorResponse, requireFirebaseUser } from "@/lib/api-auth";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import {
  appOrigin,
  sendTransactionalEmail,
  transactionalEmailConfigured,
  verificationEmail,
} from "@/lib/transactional-email";

const ONE_HOUR = 60 * 60 * 1000;
const LINK_LIFETIME = 24 * ONE_HOUR;
const SEND_COOLDOWN = 60 * 1000;
const SENDS_PER_HOUR = 5;
const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function verificationCodeFromLink(link: string) {
  const code = new URL(link).searchParams.get("oobCode");
  if (!code) throw new Error("Firebase returned an incomplete verification link.");
  return code;
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > 1024) {
      return Response.json({ error: "request too large" }, { status: 413 });
    }

    const decoded = await requireFirebaseUser(req);
    if (!transactionalEmailConfigured()) {
      return Response.json(
        { error: "branded email is not configured" },
        { status: 503 },
      );
    }

    const account = await getAdminAuth().getUser(decoded.uid);
    if (account.disabled || !account.email) {
      throw new ApiAuthError("forbidden", 403);
    }
    if (account.emailVerified) {
      return Response.json({ sent: false, verified: true });
    }

    const actionId = randomBytes(12).toString("base64url");
    if (!ACTION_ID_PATTERN.test(actionId)) {
      throw new Error("Unable to generate an email action identifier.");
    }
    const secret = randomBytes(32).toString("base64url");
    const now = Date.now();
    const db = getAdminFirestore();
    const rateRef = db.doc(`_serverRateLimits/email-verification-${account.uid}`);
    const actionRef = db.doc(`_serverEmailActions/${actionId}`);

    await db.runTransaction(async (transaction) => {
      const rateSnapshot = await transaction.get(rateRef);
      const data = rateSnapshot.data() as
        | {
            windowStartedAt?: number;
            sendCount?: number;
            lastSentAt?: number;
            activeActionId?: string;
          }
        | undefined;
      const lastSentAt = typeof data?.lastSentAt === "number" ? data.lastSentAt : 0;
      if (now - lastSentAt < SEND_COOLDOWN) {
        throw new ApiAuthError("wait before requesting another email", 429);
      }

      const currentWindow =
        typeof data?.windowStartedAt === "number" &&
        now - data.windowStartedAt < ONE_HOUR;
      const sendCount =
        currentWindow && typeof data?.sendCount === "number" ? data.sendCount : 0;
      if (sendCount >= SENDS_PER_HOUR) {
        throw new ApiAuthError("email verification rate limit exceeded", 429);
      }

      if (
        typeof data?.activeActionId === "string" &&
        ACTION_ID_PATTERN.test(data.activeActionId)
      ) {
        transaction.delete(db.doc(`_serverEmailActions/${data.activeActionId}`));
      }
      transaction.set(
        rateRef,
        {
          windowStartedAt: currentWindow ? data?.windowStartedAt : now,
          sendCount: sendCount + 1,
          lastSentAt: now,
          activeActionId: actionId,
        },
        { merge: true },
      );
    });

    const firebaseLink = await getAdminAuth().generateEmailVerificationLink(
      account.email,
      {
        url: `${appOrigin()}/login`,
        handleCodeInApp: false,
      },
    );
    await actionRef.set({
      uid: account.uid,
      oobCode: verificationCodeFromLink(firebaseLink),
      tokenHash: tokenHash(secret),
      createdAt: new Date(now),
      expiresAt: new Date(now + LINK_LIFETIME),
    });

    const confirmationUrl = `${appOrigin()}/verify/${actionId}.${secret}`;
    const message = verificationEmail({
      displayName: account.displayName || null,
      confirmationUrl,
    });

    try {
      await sendTransactionalEmail({
        to: account.email,
        ...message,
        idempotencyKey: `verify-${actionId}`,
      });
    } catch (error) {
      await actionRef.delete().catch(() => {});
      throw error;
    }

    return Response.json({ sent: true });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response.status === 429) {
      response.headers.set("Retry-After", "60");
    }
    return response;
  }
}
