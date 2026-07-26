import "server-only";

import webpush from "web-push";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebase-admin";
import { fetchPrefsByUid, wantsPush } from "./push-prefs";

type Subscription = {
  uid?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

function pushKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.replace(
    /[^A-Za-z0-9_-]/g,
    "",
  );
  const privateKey = process.env.VAPID_PRIVATE_KEY?.replace(/[^A-Za-z0-9_-]/g, "");
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || "https://nopostnow.com",
  };
}

async function subscriptionDocs(targetUids?: string[]) {
  const db = getAdminFirestore();
  const uniqueUids = [...new Set(targetUids?.filter(Boolean) ?? [])];
  if (!uniqueUids.length) {
    return (await db.collection("pushSubscriptions").get()).docs;
  }

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueUids.length; i += 30) {
    chunks.push(uniqueUids.slice(i, i + 30));
  }
  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      db.collection("pushSubscriptions").where("uid", "in", chunk).get(),
    ),
  );
  return snapshots.flatMap((snapshot) => snapshot.docs);
}

export async function sendPush(options: {
  payload: PushPayload;
  targetUids?: string[];
  excludeUid?: string;
  preference: "post" | "comment" | "like" | "dm" | "dailyPrompt";
}) {
  const keys = pushKeys();
  if (!keys) return { sent: 0, stale: 0, configured: false };

  const db = getAdminFirestore();
  const docs = await subscriptionDocs(options.targetUids);
  const recipientUids = docs
    .map((doc) => doc.data().uid)
    .filter((uid): uid is string => typeof uid === "string");
  const prefs = await fetchPrefsByUid(db, recipientUids);

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  const payload = JSON.stringify(options.payload);
  let sent = 0;
  let stale = 0;

  await Promise.allSettled(
    docs.map(async (doc: QueryDocumentSnapshot) => {
      const subscription = doc.data() as Subscription;
      if (
        !subscription.uid ||
        subscription.uid === options.excludeUid ||
        !subscription.endpoint ||
        !subscription.p256dh ||
        !subscription.auth ||
        !wantsPush(prefs, subscription.uid, options.preference)
      ) {
        return;
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale++;
          await doc.ref.delete();
        }
      }
    }),
  );

  return { sent, stale, configured: true };
}
