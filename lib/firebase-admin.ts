import "server-only";

import { Firestore } from "@google-cloud/firestore";
import { getVercelOidcToken } from "@vercel/oidc";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  ExternalAccountClient,
  GoogleAuth,
  type BaseExternalAccountClient,
} from "google-auth-library";

let cachedOidcClient: BaseExternalAccountClient | null | undefined;
let cachedOidcFirestore: Firestore | undefined;

function serviceAccountFromEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  const parsed = JSON.parse(raw) as ServiceAccount & { private_key?: string };
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function vercelOidcAuthClient(): BaseExternalAccountClient | null {
  if (cachedOidcClient !== undefined) return cachedOidcClient;

  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  if (!projectNumber || !serviceAccountEmail || !poolId || !providerId) {
    cachedOidcClient = null;
    return null;
  }

  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience:
      `//iam.googleapis.com/projects/${projectNumber}` +
      `/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken(),
    },
  });
  if (!authClient) {
    throw new Error("Unable to initialize Vercel OIDC credentials.");
  }

  cachedOidcClient = authClient;
  return authClient;
}

function vercelOidcCredential(): Credential | null {
  const authClient = vercelOidcAuthClient();
  if (!authClient) return null;

  return {
    async getAccessToken() {
      const response = await authClient.getAccessToken();
      if (!response.token) {
        throw new Error("Google Cloud did not return an OIDC access token.");
      }

      const expiry = authClient.credentials.expiry_date;
      const expiresIn = expiry
        ? Math.max(60, Math.floor((expiry - Date.now()) / 1000))
        : 3000;
      return { access_token: response.token, expires_in: expiresIn };
    },
  };
}

export function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required for Firebase Admin.");
  }

  const serviceAccount = serviceAccountFromEnv();
  const oidcCredential = vercelOidcCredential();
  return initializeApp({
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    credential: serviceAccount
      ? cert(serviceAccount)
      : oidcCredential || applicationDefault(),
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  const oidcClient = vercelOidcAuthClient();
  if (oidcClient && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    if (!cachedOidcFirestore) {
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      if (!projectId) {
        throw new Error("FIREBASE_PROJECT_ID is required for Firestore.");
      }

      cachedOidcFirestore = new Firestore({
        projectId,
        auth: new GoogleAuth({ authClient: oidcClient }),
      });
    }
    return cachedOidcFirestore;
  }

  return getFirestore(getAdminApp());
}
