import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { inQuietHours } from "./quiet-hours";

export type RecipientPrefs = {
  types: Record<string, boolean>;
  quietStart: number | null;
  quietEnd: number | null;
  tz: string | null;
};

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export async function fetchPrefsByUid(
  db: Firestore,
  recipientUids?: string[],
): Promise<Map<string, RecipientPrefs>> {
  const uniqueUids = [...new Set(recipientUids?.filter(Boolean) ?? [])];
  const docs = uniqueUids.length
    ? await db.getAll(...uniqueUids.map((uid) => db.doc(`notifPrefs/${uid}`)))
    : (await db.collection("notifPrefs").get()).docs;

  const prefs = new Map<string, RecipientPrefs>();
  for (const doc of docs) {
    if (!doc.exists) continue;
    const value = doc.data();
    const uid = typeof value?.uid === "string" ? value.uid : doc.id;
    prefs.set(uid, {
      types: {
        post: value?.posts !== false,
        comment: value?.comments !== false,
        like: value?.likes !== false,
        dm: value?.dms !== false,
        dailyPrompt: value?.dailyPrompt !== false,
      },
      quietStart: intOrNull(value?.quietStart),
      quietEnd: intOrNull(value?.quietEnd),
      tz: typeof value?.tz === "string" ? value.tz : null,
    });
  }
  return prefs;
}

export function wantsPush(
  prefs: Map<string, RecipientPrefs>,
  uid: string,
  type: string,
): boolean {
  const value = prefs.get(uid);
  if (!value) return true;
  if (value.types[type] === false) return false;
  return !inQuietHours(value.quietStart, value.quietEnd, value.tz);
}
