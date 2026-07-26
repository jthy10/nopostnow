"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export type UserMeta = {
  username: string;
  avatarPath: string | null;
  uid: string | null;
  joinedAt: Date | null;
  appAt: Date | null; // first launch from the Home Screen — "has the PWA"
  // Most recent post time (from the photos scan in fetchMessageableUsers) —
  // the "recently active" signal the @mention picker ranks by. Null when they
  // haven't posted; only set on the merged messageable list.
  lastActiveAt?: Date | null;
};

// One fetch of the (small) users collection per session, shared by every
// avatar in the feed, comment sheets, and profile pages.
let mapPromise: Promise<UserMeta[]> | null = null;

function allUsers(): Promise<UserMeta[]> {
  mapPromise ??= getDocs(collection(db, "users")).then((snap) => {
    const list: UserMeta[] = [];
    snap.forEach((d) => {
      const { username, avatarPath, uid, joinedAt, appAt } = d.data();
      if (!username) return;
      list.push({
        username,
        avatarPath: avatarPath ?? null,
        uid: uid ?? null,
        joinedAt: joinedAt?.toDate?.() ?? null,
        appAt: appAt?.toDate?.() ?? null,
      });
    });
    return list;
  });
  return mapPromise;
}

// After the signed-in user changes their own avatar or username (or their
// doc self-heals). Clears the derived DM-search list too — it's built from
// the same user docs, so a rename must not leave the old name in search.
export function invalidateAvatarMap() {
  mapPromise = null;
  messageablePromise = null;
}

// The full member list (session-cached) — DM search and new-post
// notification fan-out both need everyone, not one lookup.
export function fetchAllUsers(): Promise<UserMeta[]> {
  return allUsers();
}

// The users collection alone under-counts: uid only self-heals into a user
// doc when that person signs in, so friends who haven't been back lately
// have uid: null (or no doc with a username at all). Their posts carry
// userUUID though — merge the two so DM search really lists everyone.
let messageablePromise: Promise<UserMeta[]> | null = null;

export function fetchMessageableUsers(): Promise<UserMeta[]> {
  messageablePromise ??= (async () => {
    const [users, photos] = await Promise.all([
      allUsers(),
      getDocs(collection(db, "photos")).catch(() => null),
    ]);

    // username -> uid as recorded on their posts (first hit wins — posts
    // may carry pre-rename usernames, so only trust this as a fallback).
    // Same pass captures each uid's most recent post time, so the @mention
    // picker can order by "recently active" with no extra reads.
    const postUid = new Map<string, string>();
    const lastPostAt = new Map<string, number>();
    photos?.forEach((d) => {
      const { username, userUUID, timestamp } = d.data();
      if (typeof username === "string" && typeof userUUID === "string" && !postUid.has(username)) {
        postUid.set(username, userUUID);
      }
      const ms = timestamp?.toMillis?.();
      if (typeof userUUID === "string" && typeof ms === "number" && ms > (lastPostAt.get(userUUID) ?? 0)) {
        lastPostAt.set(userUUID, ms);
      }
    });

    const activeAt = (uid: string | null) => {
      const ms = uid ? lastPostAt.get(uid) : undefined;
      return ms ? new Date(ms) : null;
    };

    const list = users.map((u) => {
      const uid = u.uid ?? postUid.get(u.username) ?? null;
      return { ...u, uid, lastActiveAt: activeAt(uid) };
    });

    // People who post but have no usable users doc still deserve a row.
    const knownUids = new Set(list.map((u) => u.uid).filter(Boolean));
    const knownNames = new Set(list.map((u) => u.username));
    for (const [username, uid] of postUid) {
      if (!knownUids.has(uid) && !knownNames.has(username)) {
        list.push({ username, avatarPath: null, uid, joinedAt: null, appAt: null, lastActiveAt: activeAt(uid) });
        knownUids.add(uid);
      }
    }
    return list;
  })();
  return messageablePromise;
}

// Live uid -> current display name, from the session users cache. Views that
// stored a name snapshot at write time (bell items carry actorName, DM threads
// cache names.{uid}) resolve through this so a rename — whether the member did
// it in settings or an admin did it from the panel — shows up everywhere at
// once, with no need to restamp every old record. Falls back to the snapshot
// for anyone the cache can't resolve (e.g. a friend with no users doc yet).
export function useNamesByUid(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchMessageableUsers().then((users) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const u of users) if (u.uid) map.set(u.uid, u.username);
      setNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return names;
}

// Members selectable as @mentions, most recently active first. Ranked by last
// post time, falling back to when they got the app / joined so newcomers who
// haven't posted still sort sensibly. Everyone with a uid is included (the
// signed-in user too, so their own name still highlights when mentioned) —
// the composer filters itself and blocked users out of the picker.
export type MentionCandidate = { uid: string; username: string; avatarPath: string | null };

export function useMentionUsers(): MentionCandidate[] {
  const [list, setList] = useState<MentionCandidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMessageableUsers().then((users) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const ranked = users
        .filter((u) => Boolean(u.uid) && Boolean(u.username))
        .map((u) => ({
          uid: u.uid as string,
          username: u.username,
          avatarPath: u.avatarPath,
          score: (u.lastActiveAt ?? u.appAt ?? u.joinedAt)?.getTime() ?? 0,
        }))
        .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
        .filter((u) => (seen.has(u.uid) ? false : (seen.add(u.uid), true)))
        .map(({ uid, username, avatarPath }) => ({ uid, username, avatarPath }));
      setList(ranked);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return list;
}

export function useAvatarPath(username: string | null | undefined) {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    allUsers().then((users) => {
      if (cancelled) return;
      setPath(users.find((u) => u.username === username)?.avatarPath ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return path;
}

// Profile lookup by uid. `uid` fields self-heal into user docs on sign-in,
// so a friend who hasn't opened the app since the update resolves to null —
// callers fall back to what their posts say.
export function useUserByUid(uid: string | null | undefined) {
  const [meta, setMeta] = useState<UserMeta | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    allUsers().then((users) => {
      if (!cancelled) setMeta(users.find((u) => u.uid === uid) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return meta;
}
