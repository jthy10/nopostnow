import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// A member's request to be credited as the real owner of an Anonymous post.
// The write mirrors the feedback collection's shape so the security rules can
// verify it the same way (uid/username/email must match the caller).
export async function createClaim(opts: {
  postId: string;
  uid: string;
  username: string;
  email: string;
}) {
  await addDoc(collection(db, "claims"), {
    postId: opts.postId,
    uid: opts.uid,
    username: opts.username,
    email: opts.email,
    at: serverTimestamp(),
  });
}

// The feed can mount many Anonymous cards at once, so each one asking "did I
// already claim this?" would be a query apiece. Instead we fetch the caller's
// claimed post ids exactly once and share the promise across every card.
let cache: { uid: string; ids: Promise<Set<string>> } | null = null;

export function fetchMyClaimedPostIds(uid: string): Promise<Set<string>> {
  if (cache?.uid === uid) return cache.ids;
  const ids = getDocs(query(collection(db, "claims"), where("uid", "==", uid)))
    .then((snap) => new Set(snap.docs.map((d) => d.data().postId as string)))
    .catch(() => new Set<string>());
  cache = { uid, ids };
  return ids;
}

// Keep the shared cache honest after a fresh claim so other mounted cards
// reflect it without a refetch.
export function noteClaimed(uid: string, postId: string) {
  if (cache?.uid === uid) {
    cache.ids = cache.ids.then((s) => new Set(s).add(postId));
  }
}
