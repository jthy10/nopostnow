"use client";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { invalidateAvatarMap } from "./users";
import { invalidateFeedCache } from "./feed-cache";

export const MAX_USERNAME_LENGTH = 24;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_FEEDBACK_LENGTH = 2000;

// Display names double as usernames, so they must be unique. Firestore can't
// enforce that in rules — the check is client-side, which is fine for a
// friend group (no adversarial racing over "Sal").
export async function isUsernameTaken(name: string, myUid: string) {
  const users = await getDocs(collection(db, "publicProfiles"));
  const needle = name.trim().toLowerCase();
  return users.docs.some(
    (d) => d.id !== myUid && (d.data().username ?? "").toLowerCase() === needle
  );
}

export function validateUsername(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Username must be at least 2 characters.";
  if (n.length > MAX_USERNAME_LENGTH)
    return `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`;
  if (n.toLowerCase() === "anonymous") return "That name is reserved.";
  if (n.includes("_")) return "Usernames can't contain underscores.";
  return null;
}

// Rename order matters: rules verify the username stamped onto posts,
// comments, and notifications against the users doc, so that doc must change
// first. Everything carrying the old name then gets restamped so the whole
// app reflects the new one — posts, comments, DM thread names, and bell items
// dropped into friends' feeds.
export async function renameUser(opts: {
  uid: string;
  email: string;
  newName: string;
}) {
  const newName = opts.newName.trim();
  await setDoc(doc(db, "users", opts.email), { username: newName }, { merge: true });
  await setDoc(
    doc(db, "publicProfiles", opts.uid),
    { uid: opts.uid, username: newName },
    { merge: true }
  );
  await Promise.allSettled([
    propagateUsername(opts.uid, newName),
    propagateDmNames(opts.uid, newName),
    propagateNotificationNames(opts.uid, newName),
  ]);
  invalidateAvatarMap();
  // Cached feed posts still carry the old stamped username — refetch.
  invalidateFeedCache();
}

// DM thread docs cache each participant's display name (names.{uid}) so the
// inbox renders without N user lookups. Restamp mine on every thread I'm in;
// rules allow participants to update anything except the membership list.
async function propagateDmNames(uid: string, newName: string) {
  const snap = await getDocs(
    query(collection(db, "dms"), where("uids", "array-contains", uid))
  );
  await Promise.allSettled(
    snap.docs.map((d) => updateDoc(d.ref, { [`names.${uid}`]: newName }))
  );
}

// Bell items I dropped into friends' feeds carry actorName. Rules let the
// actor restamp exactly that field (verified against the users doc).
async function propagateNotificationNames(uid: string, newName: string) {
  const snap = await getDocs(
    query(collectionGroup(db, "items"), where("actorUid", "==", uid))
  );
  await Promise.allSettled(
    snap.docs.map((d) => updateDoc(d.ref, { actorName: newName }))
  );
}

// Restamp username onto every post and comment this uid authored. Shared by
// self-serve rename and (with their own rules path) the admin rename.
export async function propagateUsername(uid: string, newName: string) {
  const [photos, comments] = await Promise.all([
    getDocs(query(collection(db, "photos"), where("userUUID", "==", uid))),
    getDocs(query(collectionGroup(db, "comments"), where("userUUID", "==", uid))),
  ]);
  const results = await Promise.allSettled([
    ...photos.docs.map((d) => updateDoc(d.ref, { username: newName })),
    ...comments.docs.map((d) => updateDoc(d.ref, { username: newName })),
  ]);
  const failed = results.filter((r) => r.status === "rejected").length;
  return { updated: results.length - failed, failed };
}

// Reauth is required by Firebase for email/password changes; we collect the
// current password anyway so the errors are predictable.
async function reauth(user: User, currentPassword: string) {
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email!, currentPassword)
  );
}

export async function changePassword(user: User, currentPassword: string, newPassword: string) {
  await reauth(user, currentPassword);
  await updatePassword(user, newPassword);
}

// Change the login email. users docs are keyed by email, so the profile doc
// migrates with it: create users/{newEmail} (allowed once the token carries
// the new address), then delete the orphaned users/{oldEmail} (allowed by
// the uid stored inside it). Returns "verify" when Firebase insists on a
// confirmation link first — the doc migration then happens on next sign-in.
export async function changeEmail(
  user: User,
  currentPassword: string,
  newEmail: string
): Promise<"done" | "verify"> {
  const oldEmail = user.email!;
  const existing = await getDoc(doc(db, "users", newEmail)).catch(() => null);
  if (existing?.exists()) throw new Error("That email is already used by another member.");

  await reauth(user, currentPassword);
  try {
    await updateEmail(user, newEmail);
  } catch (e) {
    if (e instanceof FirebaseError && e.code === "auth/operation-not-allowed") {
      // Email-enumeration protection: Firebase wants the new address verified
      // before it switches. migrateUserDoc() in auth-context finishes the
      // move on the next sign-in.
      await verifyBeforeUpdateEmail(user, newEmail);
      return "verify";
    }
    throw e;
  }

  // Token must carry the new email before rules let us write the new doc.
  await user.getIdToken(true);
  const oldDoc = await getDoc(doc(db, "users", oldEmail)).catch(() => null);
  if (oldDoc?.exists()) {
    await setDoc(doc(db, "users", newEmail), oldDoc.data(), { merge: true });
    await deleteDoc(doc(db, "users", oldEmail)).catch(() => {});
  }
  invalidateAvatarMap();
  return "done";
}

// Soft delete: posts get flagged, never removed — images and comments stay
// on the server, the feed just skips them, and the admin can recover them.
export async function softDeleteAllMyPosts(uid: string) {
  const snap = await getDocs(query(collection(db, "photos"), where("userUUID", "==", uid)));
  const live = snap.docs.filter((d) => d.data().deleted !== true);
  const results = await Promise.allSettled(
    live.map((d) => updateDoc(d.ref, { deleted: true, deletedAt: serverTimestamp() }))
  );
  invalidateFeedCache();
  const failed = results.filter((r) => r.status === "rejected").length;
  return { deleted: results.length - failed, failed };
}

// Full self-serve account deletion. Requires the password (Firebase insists
// on a recent sign-in to delete a user). Order matters: every Firestore/
// Storage cleanup runs while the account still has a valid token; the auth
// user itself goes last. Posts are soft-deleted (recoverable by an admin,
// same as "delete all my posts"); comments on friends' posts stay, stamped
// with the old username. DM threads are shared property and stay readable
// for the other person.
export async function deleteMyAccount(user: User, currentPassword: string) {
  await reauth(user, currentPassword);
  const uid = user.uid;
  const email = user.email!;

  await softDeleteAllMyPosts(uid);

  // This device's (and every other device's) push subscriptions.
  const subs = await getDocs(
    query(collection(db, "pushSubscriptions"), where("uid", "==", uid))
  ).catch(() => null);

  // The bell feed lives under the account — clear items, then the seen doc.
  const bellItems = await getDocs(collection(db, "notifications", uid, "items")).catch(
    () => null
  );

  await Promise.allSettled([
    ...(subs?.docs.map((d) => deleteDoc(d.ref)) ?? []),
    ...(bellItems?.docs.map((d) => deleteDoc(d.ref)) ?? []),
    deleteDoc(doc(db, "notifications", uid)),
    deleteDoc(doc(db, "notifPrefs", uid)),
    deleteDoc(doc(db, "blocks", uid)),
    deleteDoc(doc(db, "unique_users", uid)),
    deleteDoc(doc(db, "users", email)),
    deleteDoc(doc(db, "publicProfiles", uid)),
  ]);

  invalidateAvatarMap();
  invalidateFeedCache();
  await user.delete();
}

// A note to the developers — lands in the admin panel.
export async function sendFeedback(opts: {
  uid: string;
  username: string;
  email: string;
  text: string;
}) {
  await addDoc(collection(db, "feedback"), {
    uid: opts.uid,
    username: opts.username,
    email: opts.email,
    text: opts.text.trim().slice(0, MAX_FEEDBACK_LENGTH),
    at: serverTimestamp(),
  });
}

// After a verify-first email change, the old users/{oldEmail} doc is
// stranded (see changeEmail). Called from auth-context when a sign-in finds
// no users doc: adopt the old profile keyed to this uid instead of starting
// over as Anonymous.
export async function findOrphanProfile(uid: string, currentEmail: string) {
  const snap = await getDocs(query(collection(db, "users"), where("uid", "==", uid)));
  return snap.docs.find((d) => d.id !== currentEmail) ?? null;
}
