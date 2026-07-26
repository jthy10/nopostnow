"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { fetchPosts, type Post } from "@/lib/posts";
import { useBlockSets } from "@/lib/blocks";
import { readFeedSnapshot, saveFeedSnapshot } from "@/lib/feed-cache";
import PhotoCard from "@/components/PhotoCard";
import CommentSheet from "@/components/CommentSheet";
import UploadSheet from "@/components/UploadSheet";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import InstallBanner from "@/components/InstallBanner";
import DmInviteBanner from "@/components/DmInviteBanner";
import FeedPromo from "@/components/FeedPromo";
import NotificationsCard from "@/components/NotificationsCard";
import AnnouncementCard from "@/components/AnnouncementCard";
import PullToRefresh from "@/components/PullToRefresh";
import ViewportShell from "@/components/ViewportShell";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";

export default function FeedPage() {
  const { user, username, loading } = useAuth();
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [activeComments, setActiveComments] = useState<Post | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [commentBumps, setCommentBumps] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Set once the feed holds real data (restored or fetched) — before that,
  // the empty initial state must not clobber a good session snapshot.
  const seeded = useRef(false);
  // Scroll offset waiting to be applied — only after the restored posts have
  // actually committed; scrolling the still-empty list would clamp to 0.
  const pendingScroll = useRef<number | null>(null);
  // Live copies for the unmount save — saving from an effect on every state
  // change would race StrictMode's double-mount and clobber a good snapshot
  // with the initial empty state.
  const lastScrollTop = useRef(0);
  const latest = useRef({ posts, cursor, hasMore });
  useEffect(() => {
    latest.current = { posts, cursor, hasMore };
  });
  const { blocked, hidden } = useBlockSets(user?.uid);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  const loadMore = useCallback(async () => {
    if (fetching || !hasMore) return;
    setFetching(true);
    const { posts: next, nextCursor } = await fetchPosts(cursor);
    seeded.current = true;
    // Dedupe on append: StrictMode's double-mount (and any rapid sentinel
    // re-trigger) can land two overlapping fetches before `fetching` commits.
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...next.filter((p) => !seen.has(p.id))];
    });
    setCursor(nextCursor);
    setHasMore(Boolean(nextCursor));
    setFetching(false);
  }, [cursor, fetching, hasMore]);

  // Reload from the top (after posting a new photo, or pull-to-refresh).
  const refresh = useCallback(async () => {
    setFetching(true);
    const { posts: next, nextCursor } = await fetchPosts();
    seeded.current = true;
    setPosts(next);
    setCursor(nextCursor);
    setHasMore(Boolean(nextCursor));
    setFetching(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  // First load: restore the session snapshot (posts + scroll offset) so
  // coming back from notifications/profiles doesn't dump you at the top;
  // fetch fresh only when there's nothing to restore.
  useEffect(() => {
    if (!user) return;
    const snap = readFeedSnapshot(user.uid);
    if (snap) {
      seeded.current = true;
      pendingScroll.current = snap.scrollTop;
      lastScrollTop.current = snap.scrollTop;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time session-cache restore
      setPosts(snap.posts);
      setCursor(snap.cursor);
      setHasMore(snap.hasMore);
    } else {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Apply the restored offset in the same frame the posts paint (dimensions
  // are reserved via aspect-ratio boxes, so the position lands exactly).
  useLayoutEffect(() => {
    if (pendingScroll.current === null || posts.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = pendingScroll.current;
    pendingScroll.current = null;
  }, [posts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      lastScrollTop.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [user]);

  // Snapshot on unmount — whatever was on screen is what the next visit
  // restores.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return () => {
      if (!seeded.current) return;
      saveFeedSnapshot({ ...latest.current, scrollTop: lastScrollTop.current, uid });
    };
  }, [user]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollRef.current }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Blocking is mutual invisibility — filter at render so the cached list
  // stays intact and an unblock brings posts back instantly.
  const visiblePosts = useMemo(
    () => posts.filter((p) => !p.userUUID || !hidden.has(p.userUUID)),
    [posts, hidden]
  );

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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <PullToRefresh onRefresh={refresh} scrollRef={scrollRef}>
      <main className="mx-auto w-full max-w-lg pt-[calc(52px+env(safe-area-inset-top))]">
        <DmInviteBanner uid={user.uid} />
        <InstallBanner />
        <NotificationsCard uid={user.uid} />
        <AnnouncementCard />

        {visiblePosts.map((post, i) => (
          <div key={post.id}>
            <PhotoCard
              post={post}
              uid={user.uid}
              username={username || "Anonymous"}
              commentsVersion={commentBumps[post.id] ?? 0}
              onOpenComments={setActiveComments}
              onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            />
            {/* Install nudges between every 4th post for browser users */}
            {(i + 1) % 4 === 0 && (
              <FeedPromo
                index={(i + 1) / 4 - 1}
                onScrollToTop={() =>
                  scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                }
              />
            )}
          </div>
        ))}

        <div ref={sentinelRef} className="h-10" />

        {fetching && (
          <p className="pb-6 text-center text-[11px] font-semibold uppercase tracking-[2px] text-dim">
            Loading
          </p>
        )}

        {!hasMore && visiblePosts.length > 0 && (
          <p className="pb-8 text-center text-[11px] font-semibold uppercase tracking-[2px] text-dim">
            You&apos;re all caught up
          </p>
        )}

        {!hasMore && visiblePosts.length === 0 && (
          <p className="py-10 text-center text-sm text-mut">
            {blocked.size > 0 ? "No posts to show." : "No posts yet."}
          </p>
        )}
      </main>
      </PullToRefresh>
      </div>

      <BottomNav onCapture={setCapturedFile} scrollRef={scrollRef} />
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
            refresh();
          }}
        />
      )}
    </>
  );
}
