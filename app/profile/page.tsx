"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useAuthedImage } from "@/lib/use-authed-image";
import { invalidateAvatarMap } from "@/lib/users";
import { initials } from "@/components/Avatar";
import type { Post } from "@/lib/posts";
import PhotoCard from "@/components/PhotoCard";
import CommentSheet from "@/components/CommentSheet";
import UploadSheet from "@/components/UploadSheet";
import AvatarCropModal from "@/components/AvatarCropModal";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import ViewportShell from "@/components/ViewportShell";

const PAGE = 6;

export default function ProfilePage() {
  const { user, username, avatarPath, isAdmin, loading, setAvatarPath } = useAuth();
  const router = useRouter();
  const scrollRef = useRef<HTMLElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [myPosts, setMyPosts] = useState<Post[] | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [activeComments, setActiveComments] = useState<Post | null>(null);
  const [commentBumps, setCommentBumps] = useState<Record<string, number>>({});
  const avatarSrc = useAuthedImage(avatarPath);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Equality-only query (no orderBy) so no composite index is needed;
    // a friend group's post count is small enough to sort client-side.
    getDocs(query(collection(db, "photos"), where("userUUID", "==", user.uid))).then(
      (snap) => {
        if (cancelled) return;
        const posts = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Post))
          .filter((p) => p.timestamp && p.deleted !== true)
          .sort((a, b) => b.timestamp!.toDate().getTime() - a.timestamp!.toDate().getTime());
        setMyPosts(posts);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Picking a file opens the crop modal; the upload happens on crop confirm.
  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }

  function handleAvatarButton() {
    if (avatarSrc) setShowAvatarMenu(true);
    else libraryInputRef.current?.click();
  }

  async function handleCropped(blob: Blob) {
    if (!user) return;
    setCropSrc(null);
    setBusy(true);
    try {
      const path = `avatars/${user.uid}/${Date.now()}-avatar.jpg`;
      await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
      await setDoc(doc(db, "users", user.email!), { avatarPath: path }, { merge: true });
      setAvatarPath(path);
      invalidateAvatarMap();
    } finally {
      setBusy(false);
    }
  }

  function handleAvatarAction(action: string) {
    setShowAvatarMenu(false);
    if (action === "Take Photo") cameraInputRef.current?.click();
    else if (action === "Photo Library") libraryInputRef.current?.click();
    else if (action === "Edit Crop" && avatarSrc) setCropSrc(avatarSrc);
  }

  if (loading || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-sm font-semibold uppercase tracking-[2px] text-mut">
        Loading
      </div>
    );
  }

  return (
    <>
      <ViewportShell>
      <TopNav scrollRef={scrollRef} />

      <main ref={scrollRef} className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto overscroll-contain pt-[calc(52px+env(safe-area-inset-top))]">
        <div className="flex flex-col items-center border-b-[0.5px] border-field px-5 pb-5 pt-7">
          <div className="relative mb-3.5">
            <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-2 border-edge bg-field text-3xl font-extrabold text-dim">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                initials(username || "?")
              )}
            </div>
            <button
              onClick={handleAvatarButton}
              disabled={busy}
              aria-label="Change profile photo"
              className="absolute bottom-0 right-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-canvas bg-white text-black transition-transform active:scale-90 disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[13px] w-[13px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleAvatarPick}
            className="hidden"
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarPick}
            className="hidden"
          />

          <h1 className="text-xl font-extrabold tracking-[-0.3px]">{username}</h1>
          <p className="mt-1 text-xs text-mut">{user.email}</p>
          {user.metadata.creationTime && (
            <p className="mt-1 text-xs text-mut">
              JOINED{" "}
              {new Date(user.metadata.creationTime)
                .toLocaleDateString(undefined, { month: "long", year: "numeric" })
                .toUpperCase()}
            </p>
          )}
          {myPosts !== null && (
            <p className="mt-1 text-xs font-semibold tracking-[0.5px] text-mut">
              {myPosts.length} POST{myPosts.length === 1 ? "" : "S"}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="rounded-lg border-[0.5px] border-edge px-5 py-2 text-[11px] font-bold uppercase tracking-[1.5px] text-mut transition-colors hover:border-mut hover:text-white"
              >
                Admin
              </button>
            )}
            <button
              onClick={() => signOut(auth)}
              className="rounded-lg border-[0.5px] border-edge px-5 py-2 text-[11px] font-bold uppercase tracking-[1.5px] text-mut transition-colors hover:border-mut hover:text-white"
            >
              Sign Out
            </button>
            <button
              onClick={() => router.push("/settings")}
              aria-label="Settings"
              className="flex items-center rounded-lg border-[0.5px] border-edge px-3 py-2 text-mut transition-colors hover:border-mut hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {myPosts === null && (
          <p className="py-10 text-center text-[11px] font-semibold uppercase tracking-[2px] text-dim">
            Loading
          </p>
        )}

        {myPosts !== null && myPosts.length === 0 && (
          <p className="py-10 text-center text-sm text-mut">
            No posts yet — hit the camera button to share your first photo.
          </p>
        )}

        {myPosts?.slice(0, visible).map((post) => (
          <PhotoCard
            key={post.id}
            post={post}
            uid={user.uid}
            username={username || "Anonymous"}
            commentsVersion={commentBumps[post.id] ?? 0}
            onOpenComments={setActiveComments}
            onDeleted={(id) =>
              setMyPosts((prev) => prev?.filter((p) => p.id !== id) ?? null)
            }
          />
        ))}

        {myPosts !== null && visible < myPosts.length && (
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="mx-auto my-6 block rounded-lg border-[0.5px] border-edge px-6 py-2.5 text-[11px] font-bold uppercase tracking-[1.5px] text-mut transition-colors hover:border-mut hover:text-white"
          >
            Load More
          </button>
        )}
      </main>

      <BottomNav onCapture={setCapturedFile} />
      </ViewportShell>

      {activeComments && (
        <CommentSheet
          post={activeComments}
          uid={user.uid}
          username={username || "Anonymous"}
          onClose={() => setActiveComments(null)}
          onChanged={() =>
            setCommentBumps((m) => ({
              ...m,
              [activeComments.id]: (m[activeComments.id] ?? 0) + 1,
            }))
          }
        />
      )}

      {capturedFile && (
        <UploadSheet
          file={capturedFile}
          uid={user.uid}
          username={username || "Anonymous"}
          onClose={() => setCapturedFile(null)}
          onPosted={() => {
            setCapturedFile(null);
            router.push("/");
          }}
        />
      )}

      {showAvatarMenu && (
        <div
          className="fixed inset-0 z-50 flex animate-[fade-in_0.2s_ease-out] flex-col justify-end bg-black/60"
          onClick={() => setShowAvatarMenu(false)}
        >
          <div
            className="animate-[sheet-up_0.25s_ease-out] rounded-t-[14px] bg-[#1c1c1e] pb-[calc(32px+env(safe-area-inset-bottom))] pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            {["Take Photo", "Photo Library", "Edit Crop"].map((label) => (
              <button
                key={label}
                onClick={() => handleAvatarAction(label)}
                className="block w-full border-t-[0.5px] border-[#2c2c2e] px-5 py-4 text-left text-[17px] font-semibold text-white transition-colors active:bg-[#28282a]"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setShowAvatarMenu(false)}
              className="block w-full border-t-[0.5px] border-[#2c2c2e] px-5 py-4 text-left text-[17px] text-[#888]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onCropped={handleCropped}
        />
      )}
    </>
  );
}
