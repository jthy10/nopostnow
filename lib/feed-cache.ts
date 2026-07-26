"use client";

import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import type { Post } from "./posts";

// The feed page unmounts on every navigation (notifications, a profile, a
// post permalink), and refetching from the top would dump the reader back at
// the newest post. This module-level snapshot survives navigations within
// the session so the feed can restore exactly what was on screen — posts,
// pagination cursor, and scroll offset.
//
// Anything that changes what the feed should show (new post, rename, block)
// must call invalidateFeedCache() so the next visit refetches.

export type FeedSnapshot = {
  posts: Post[];
  cursor?: QueryDocumentSnapshot<DocumentData>;
  hasMore: boolean;
  scrollTop: number;
  uid: string; // owner — a different account signing in must not inherit it
};

let snapshot: FeedSnapshot | null = null;

export function saveFeedSnapshot(next: FeedSnapshot) {
  snapshot = next;
}

export function readFeedSnapshot(uid: string): FeedSnapshot | null {
  return snapshot && snapshot.uid === uid ? snapshot : null;
}

export function invalidateFeedCache() {
  snapshot = null;
}
