import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getCountFromServer,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import { invalidateFeedCache } from "./feed-cache";

// Compressed feed copies live under photos/display/** (same top-level folder
// so the existing storage rules cover them). Originals are never modified —
// the download button and full-quality use cases always read imagePath.
export function displayVariantPath(imagePath: string) {
  return imagePath.replace(/^photos\//, "photos/display/");
}

const DISPLAY_MAX_WIDTH = 1600;
const DISPLAY_JPEG_QUALITY = 0.85;

export type Post = {
  id: string;
  userUUID: string;
  username: string;
  imagePath: string;
  caption: string;
  timestamp: { toDate: () => Date } | null;
  likedBy: string[];
  imageWidth?: number;
  imageHeight?: number;
  // Soft delete: flagged posts stay on the server (admin can recover them)
  // but never render anywhere in the app.
  deleted?: boolean;
  // Migrated from the Hostinger site — see postDate() for the timestamp caveat.
  legacy?: boolean;
};

// Legacy posts were imported with their New York wall-clock time stored as if
// it were UTC (see scripts/migrate-legacy.js), so reading them back directly
// renders hours early. Reinterpret the stored UTC fields as America/New_York
// wall time to recover the real instant — DST-correct per post.
function newYorkOffsetMs(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return wallAsUtc - at.getTime();
}

export function postDate(post: Pick<Post, "timestamp" | "legacy">): Date | null {
  if (!post.timestamp) return null;
  const d = post.timestamp.toDate();
  if (!post.legacy) return d;
  // First guess assumes the offset at the stored instant; a second pass
  // corrects guesses that land on the other side of a DST switch.
  let real = d.getTime() - newYorkOffsetMs(d);
  real = d.getTime() - newYorkOffsetMs(new Date(real));
  return new Date(real);
}

export type Comment = {
  id: string;
  userUUID: string;
  username: string;
  text: string;
  timestamp: { toDate: () => Date } | null;
  // uids who liked this comment (mirrors a post's likedBy). Absent on comments
  // written before likes existed — treat missing as [].
  likedBy?: string[];
};

const PAGE_SIZE = 6;

// Downscale to feed resolution on-device. Returns null when re-encoding
// wouldn't help (tiny image) or the browser can't do it — callers treat
// null as "just use the original".
async function renderDisplayVariant(bmp: ImageBitmap): Promise<Blob | null> {
  try {
    const scale = Math.min(1, DISPLAY_MAX_WIDTH / bmp.width);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", DISPLAY_JPEG_QUALITY)
    );
  } catch {
    return null;
  }
}

export async function fetchPosts(
  cursor?: QueryDocumentSnapshot<DocumentData>
): Promise<{ posts: Post[]; nextCursor?: QueryDocumentSnapshot<DocumentData> }> {
  const base = query(
    collection(db, "photos"),
    orderBy("timestamp", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(PAGE_SIZE)
  );
  const snap = await getDocs(base);
  // Soft-deleted posts are filtered here (not in the query) so no composite
  // index is needed; a short page just means the feed fetches the next one.
  const posts = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Post))
    .filter((p) => p.deleted !== true);
  return {
    posts,
    nextCursor: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : undefined,
  };
}

export async function createPost(opts: {
  file: File;
  caption: string;
  uid: string;
  username: string;
  onProgress?: (fraction: number) => void;
}) {
  // Dimensions let the feed reserve the exact space before the image loads.
  // createImageBitmap applies EXIF orientation, so width/height match display.
  // The same bitmap renders the compressed display variant the feed serves;
  // the untouched original is what gets stored at imagePath.
  let dims: { width: number; height: number } | null = null;
  let display: Blob | null = null;
  try {
    const bmp = await createImageBitmap(opts.file);
    dims = { width: bmp.width, height: bmp.height };
    display = await renderDisplayVariant(bmp);
    bmp.close();
  } catch {
    // Non-decodable in this browser (e.g. HEIC on desktop) — post without dims.
  }

  const imagePath = `photos/${opts.uid}/${Date.now()}-${opts.file.name}`;
  const task = uploadBytesResumable(ref(storage, imagePath), opts.file, {
    contentType: opts.file.type,
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => opts.onProgress?.(snap.bytesTransferred / snap.totalBytes),
      reject,
      resolve
    );
  });

  // Variant failure must never block a post — the feed falls back to the
  // original whenever the display copy is missing.
  if (display && display.size < opts.file.size) {
    try {
      await uploadBytes(ref(storage, displayVariantPath(imagePath)), display, {
        contentType: "image/jpeg",
      });
    } catch {
      /* fall back to original in the feed */
    }
  }

  const docRef = await addDoc(collection(db, "photos"), {
    userUUID: opts.uid,
    username: opts.username,
    imagePath,
    caption: opts.caption,
    timestamp: serverTimestamp(),
    likedBy: [],
    ...(dims ? { imageWidth: dims.width, imageHeight: dims.height } : {}),
  });
  // Callers pass this to the notification fan-out so pushes and the bell
  // feed can deep-link to /p/{id}.
  return docRef.id;
}

// Admin legacy cleanup: attach an Anonymous post to the member who really
// posted it. Server-side only freshAdmin() may make this update, so it works
// within 15 minutes of unlocking /admin. Deliberately no notification — the
// member already knows they posted it.
export async function assignPost(postId: string, uid: string, username: string) {
  await updateDoc(doc(db, "photos", postId), { userUUID: uid, username });
  // Fire-and-forget audit entry, same as the admin panel's log().
  void addDoc(collection(db, "adminLog"), {
    action: "assign-post",
    detail: `${postId} → ${username} (${uid})`,
    email: auth.currentUser?.email || "",
    at: serverTimestamp(),
  }).catch(() => {});
  invalidateFeedCache();
}

export const MAX_CAPTION_LENGTH = 70;

// Owner-only caption edit (rules verify ownership and the length cap).
export async function updateCaption(postId: string, caption: string) {
  await updateDoc(doc(db, "photos", postId), {
    caption: caption.trim().slice(0, MAX_CAPTION_LENGTH),
  });
  invalidateFeedCache();
}

export async function toggleLike(postId: string, uid: string, currentlyLiked: boolean) {
  await updateDoc(doc(db, "photos", postId), {
    likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function deletePost(postId: string) {
  await deleteDoc(doc(db, "photos", postId));
  // Deleting from a profile or permalink must not leave the ghost in the
  // cached feed.
  invalidateFeedCache();
}

export type CommentPreview = { count: number; latest: Comment[] };

// Count + the two most recent comments, shown under each feed card.
export async function fetchCommentPreview(postId: string): Promise<CommentPreview> {
  const col = collection(db, "photos", postId, "comments");
  const [countSnap, latestSnap] = await Promise.all([
    getCountFromServer(col),
    getDocs(query(col, orderBy("timestamp", "desc"), limit(2))),
  ]);
  return {
    count: countSnap.data().count,
    latest: latestSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)).reverse(),
  };
}

// Who currently likes a post — read fresh from the doc (not the possibly-stale
// snapshot the sheet was opened with) so the Likes tab reflects likes added
// after opening. Returns the uids; the caller resolves names/avatars.
export async function fetchPostLikers(postId: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "photos", postId));
  const likedBy = snap.exists() ? snap.data().likedBy : null;
  return Array.isArray(likedBy)
    ? likedBy.filter((u): u is string => typeof u === "string")
    : [];
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const q = query(
    collection(db, "photos", postId, "comments"),
    orderBy("timestamp", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment));
}

export async function addComment(postId: string, uid: string, username: string, text: string) {
  const comment = await addDoc(collection(db, "photos", postId, "comments"), {
    userUUID: uid,
    username,
    text,
    timestamp: serverTimestamp(),
    likedBy: [],
  });
  return comment.id;
}

// Toggle the caller's like on a comment. Same self-only arrayUnion/arrayRemove
// shape as toggleLike on a post, so the security rule can verify only the
// caller's own uid entered or left likedBy.
export async function toggleCommentLike(
  postId: string,
  commentId: string,
  uid: string,
  currentlyLiked: boolean
) {
  await updateDoc(doc(db, "photos", postId, "comments", commentId), {
    likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function deleteComment(postId: string, commentId: string) {
  await deleteDoc(doc(db, "photos", postId, "comments", commentId));
}

export async function getUsername(email: string): Promise<string> {
  const snap = await getDoc(doc(db, "users", email));
  return snap.exists() ? snap.data().username || "Anonymous" : "Anonymous";
}
