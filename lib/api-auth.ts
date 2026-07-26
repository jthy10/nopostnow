import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "./firebase-admin";

export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function bearerToken(req: Request) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

export async function requireMember(
  req: Request,
  options: { admin?: boolean; freshSeconds?: number; requireMfa?: boolean } = {},
): Promise<DecodedIdToken> {
  const token = bearerToken(req);
  if (!token) throw new ApiAuthError("unauthorized", 401);

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch (error) {
    console.error("Firebase ID token verification failed.", error);
    throw new ApiAuthError("unauthorized", 401);
  }

  if (decoded.email_verified !== true) {
    throw new ApiAuthError("forbidden", 403);
  }
  if (options.admin && decoded.admin !== true) {
    throw new ApiAuthError("forbidden", 403);
  }
  if (
    options.freshSeconds &&
    Math.floor(Date.now() / 1000) - decoded.auth_time >= options.freshSeconds
  ) {
    throw new ApiAuthError("recent sign-in required", 401);
  }
  if (
    options.requireMfa &&
    decoded.firebase?.sign_in_second_factor !== "totp"
  ) {
    throw new ApiAuthError("multi-factor authentication required", 403);
  }

  return decoded;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof ApiAuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("API authentication failed", error);
  return Response.json({ error: "server configuration error" }, { status: 500 });
}
