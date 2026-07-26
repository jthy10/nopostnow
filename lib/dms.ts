"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { fetchAllUsers } from "./users";
import { isStandalone } from "./push";

// Direct messages. One doc per pair of people:
//
//   dms/{threadId}               -> { uids: [a, b], names: {uid: name},
//                                     lastText, lastFrom, lastAt, seenAt: {uid: ts} }
//   dms/{threadId}/messages/{id} -> { from, text, at }
//
// threadId is both uids sorted and joined with "_" — deterministic, so two
// people can never end up with duplicate threads, and security rules can
// check membership from the id alone (uids never contain underscores).

export type Thread = {
  id: string;
  uids: string[];
  names: Record<string, string>;
  lastText: string;
  lastFrom: string;
  lastAt: Timestamp | null;
  seenAt?: Record<string, Timestamp>;
};

export type Message = {
  id: string;
  from: string;
  text: string;
  at: Timestamp | null;
};

export const MAX_DM_LENGTH = 1000;

export function threadIdFor(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join("_");
}

export function peerUidOf(threadId: string, myUid: string) {
  return threadId.split("_").find((u) => u && u !== myUid) ?? null;
}

export function isThreadUnread(t: Thread, myUid: string) {
  if (!t.lastAt || t.lastFrom === myUid) return false;
  const seen = t.seenAt?.[myUid];
  return !seen || t.lastAt.toMillis() > seen.toMillis();
}

// All my threads, live, newest activity first. Sorted client-side so no
// composite index is needed — a friend group has a handful of threads.
export function useThreads(uid: string | undefined) {
  const [threads, setThreads] = useState<Thread[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "dms"), where("uids", "array-contains", uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Thread));
        list.sort((a, b) => (b.lastAt?.toMillis() ?? 0) - (a.lastAt?.toMillis() ?? 0));
        setThreads(list);
      },
      () => setThreads([])
    );
  }, [uid]);

  return threads;
}

// One thread doc, live (null = doesn't exist yet — no messages sent).
export function useThread(threadId: string | undefined) {
  const [thread, setThread] = useState<Thread | null | undefined>(undefined);

  useEffect(() => {
    if (!threadId) return;
    return onSnapshot(
      doc(db, "dms", threadId),
      (snap) => setThread(snap.exists() ? ({ id: snap.id, ...snap.data() } as Thread) : null),
      () => setThread(null)
    );
  }, [threadId]);

  return thread;
}

// Latest messages in a thread, live, oldest-first for rendering.
export function useMessages(threadId: string | undefined, max = 200) {
  const [messages, setMessages] = useState<Message[] | null>(null);

  useEffect(() => {
    if (!threadId) return;
    return onSnapshot(
      query(collection(db, "dms", threadId, "messages"), orderBy("at", "desc"), limit(max)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
        // Oldest-first for rendering. A just-sent message has a pending
        // server timestamp (at == null locally) — treat it as newest so it
        // renders at the bottom instead of jumping to the top.
        list.sort(
          (a, b) => (a.at?.toMillis() ?? Infinity) - (b.at?.toMillis() ?? Infinity)
        );
        setMessages(list);
      },
      () => setMessages([])
    );
  }, [threadId, max]);

  return messages;
}

// Send a message: upsert the thread doc (create carries the exact shape the
// rules validate), then append the message. Names are refreshed on every
// send so renamed friends don't stay stale in the list.
export async function sendMessage(opts: {
  myUid: string;
  myName: string;
  peerUid: string;
  peerName: string;
  text: string;
}) {
  const text = opts.text.trim().slice(0, MAX_DM_LENGTH);
  if (!text) return;
  const id = threadIdFor(opts.myUid, opts.peerUid);
  const uids = [opts.myUid, opts.peerUid].sort();

  await setDoc(
    doc(db, "dms", id),
    {
      uids,
      names: { [opts.myUid]: opts.myName, [opts.peerUid]: opts.peerName },
      lastText: text.slice(0, 120),
      lastFrom: opts.myUid,
      lastAt: serverTimestamp(),
      // Sending is reading: your own seen pointer rides along. Nested map
      // (not a dotted path — setDoc doesn't parse those) deep-merges, so the
      // peer's pointer survives.
      seenAt: { [opts.myUid]: serverTimestamp() },
    },
    { merge: true }
  );
  await addDoc(collection(db, "dms", id, "messages"), {
    from: opts.myUid,
    text,
    at: serverTimestamp(),
  });
}

// Mark a thread read (bell-adjacent badge + unread dots clear instantly).
export async function markThreadSeen(threadId: string, myUid: string) {
  try {
    await updateDoc(doc(db, "dms", threadId), {
      [`seenAt.${myUid}`]: serverTimestamp(),
    });
  } catch {
    // Thread doc doesn't exist yet — nothing to mark.
  }
}

// Count of threads with unread messages — the badge on the chat icon.
export function useUnreadThreadCount(uid: string | undefined) {
  const threads = useThreads(uid);
  if (!uid || !threads) return 0;
  return threads.filter((t) => isThreadUnread(t, uid)).length;
}

// ---- "Who actually has the PWA?" ------------------------------------------
// users/{email}.appAt is stamped on first standalone launch. Subscription
// endpoints stay private to their owners and trusted server routes.
let appUidsPromise: Promise<Set<string>> | null = null;

export function fetchAppUids(): Promise<Set<string>> {
  appUidsPromise ??= (async () => {
    const uids = new Set<string>();
    const users = await fetchAllUsers();
    for (const u of users) if (u.uid && u.appAt) uids.add(u.uid);
    return uids;
  })();
  return appUidsPromise;
}

export function useAppUids() {
  const [uids, setUids] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAppUids().then((set) => {
      if (!cancelled) setUids(set);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return uids;
}

// ---- Standalone gate --------------------------------------------------------
// DMs are an app-only feature. isStandalone() touches window, so resolve it
// after mount: null = still deciding (render nothing, avoids a flash).
export function useStandalone() {
  const [standalone, setStandalone] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time environment sniff on mount
    setStandalone(isStandalone());
  }, []);
  return standalone;
}
