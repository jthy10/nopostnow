"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { invalidateFeedCache } from "./feed-cache";

// Blocking is mutual invisibility: neither side sees the other's posts,
// profile, comments, notifications, DMs, or search rows.
//
//   blocks/{uid} -> { blocked: [uid, ...] }
//
// Both directions matter, so the store watches your own list AND every list
// containing you (array-contains query — rules let any member read blocks,
// which is required for that query and is fine for a friend group).
//
// One shared subscription serves every mounted useBlockSets() — PhotoCard
// alone renders many times per page, so per-mount listeners would multiply.

export type BlockSets = {
  blocked: Set<string>; // people I blocked
  blockedBy: Set<string>; // people who blocked me
  hidden: Set<string>; // union — hide these uids everywhere
};

const EMPTY: BlockSets = {
  blocked: new Set(),
  blockedBy: new Set(),
  hidden: new Set(),
};

let current: BlockSets = EMPTY;
let activeUid: string | null = null;
let stopListeners: (() => void) | null = null;
const subscribers = new Set<(s: BlockSets) => void>();

function publish(blocked: Set<string>, blockedBy: Set<string>) {
  current = { blocked, blockedBy, hidden: new Set([...blocked, ...blockedBy]) };
  subscribers.forEach((fn) => fn(current));
}

function ensureListeners(uid: string) {
  if (activeUid === uid) return;
  stopListeners?.();
  activeUid = uid;
  current = EMPTY;

  let blocked = new Set<string>();
  let blockedBy = new Set<string>();

  const stopMine = onSnapshot(
    doc(db, "blocks", uid),
    (snap) => {
      const list = snap.exists() ? (snap.data().blocked as string[] | undefined) ?? [] : [];
      blocked = new Set(list.filter((x) => typeof x === "string"));
      publish(blocked, blockedBy);
    },
    () => publish((blocked = new Set()), blockedBy)
  );
  const stopTheirs = onSnapshot(
    query(collection(db, "blocks"), where("blocked", "array-contains", uid)),
    (snap) => {
      blockedBy = new Set(snap.docs.map((d) => d.id));
      publish(blocked, blockedBy);
    },
    () => publish(blocked, (blockedBy = new Set()))
  );
  stopListeners = () => {
    stopMine();
    stopTheirs();
    stopListeners = null;
    activeUid = null;
  };
}

// Live block state for the signed-in user. Starts as the empty set so pages
// render immediately and tighten up the moment the listeners land. The
// shared listeners stay alive for the session (a friend group's block lists
// are two tiny reads) and re-target if a different account signs in.
export function useBlockSets(uid: string | undefined): BlockSets {
  const [sets, setSets] = useState<BlockSets>(() =>
    uid && uid === activeUid ? current : EMPTY
  );

  useEffect(() => {
    if (!uid) return;
    ensureListeners(uid);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the shared store on (re)subscribe
    setSets(current);
    const fn = (s: BlockSets) => setSets(s);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, [uid]);

  return sets;
}

export async function blockUser(myUid: string, targetUid: string) {
  await setDoc(doc(db, "blocks", myUid), { blocked: arrayUnion(targetUid) }, { merge: true });
  invalidateFeedCache();
}

export async function unblockUser(myUid: string, targetUid: string) {
  await setDoc(doc(db, "blocks", myUid), { blocked: arrayRemove(targetUid) }, { merge: true });
  invalidateFeedCache();
}
