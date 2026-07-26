"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useBlockSets } from "@/lib/blocks";
import { postDate, type Post } from "@/lib/posts";
import PhotoCard from "@/components/PhotoCard";
import CommentSheet from "@/components/CommentSheet";
import PageHeader from "@/components/PageHeader";
import ViewportShell from "@/components/ViewportShell";

// The archive: the same feed you already know, just with filter controls on
// top — pick a member or change the sort order. All
// metadata loads in one query (the whole feed is a few hundred docs); the
// cards themselves page in on scroll so we never mount hundreds at once.

const PAGE = 8;

// The sort control cycles through these in order; label + icon come along.
type SortMode = "new" | "old" | "liked";
const SORT_ORDER: SortMode[] = ["new", "old", "liked"];
const SORT_LABEL: Record<SortMode, string> = {
  new: "Newest",
  old: "Oldest",
  liked: "Most liked",
};

export default function BrowsePage() {
  const { user, username, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [who, setWho] = useState<string | null>(null); // username filter
  const [sort, setSort] = useState<SortMode>("new");
  const [shown, setShown] = useState(PAGE); // client-side windowing
  const [activeComments, setActiveComments] = useState<Post | null>(null);
  const [commentBumps, setCommentBumps] = useState<Record<string, number>>({});
  const { hidden } = useBlockSets(user?.uid);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDocs(collection(db, "photos")).then((snap) => {
      if (cancelled) return;
      setPosts(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Post))
          .filter((p) => p.timestamp && p.deleted !== true)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Member chips, busiest posters first. Username (not uid) is the filter
  // key so legacy Anonymous posts stay browsable too.
  const members = useMemo(() => {
    if (!posts) return [];
    const counts = new Map<string, number>();
    for (const p of posts) {
      if (p.userUUID && hidden.has(p.userUUID)) continue;
      const name = p.username || "Anonymous";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [posts, hidden]);

  // One flat, sorted list — newest/oldest flips the whole feed by time, most-
  // liked ranks by like count (ties fall back to newest so the order is stable).
  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    const filtered = posts.filter(
      (p) =>
        (!p.userUUID || !hidden.has(p.userUUID)) &&
        (!who || (p.username || "Anonymous") === who)
    );
    const time = (p: Post) => postDate(p)?.getTime() ?? 0;
    if (sort === "liked") {
      return [...filtered].sort(
        (a, b) => (b.likedBy?.length ?? 0) - (a.likedBy?.length ?? 0) || time(b) - time(a)
      );
    }
    const dir = sort === "old" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * (time(a) - time(b)));
  }, [posts, who, sort, hidden]);

  // Grow the window as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setShown((s) => s + PAGE);
      },
      { root: scrollRef.current }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visiblePosts]);

  if (loading || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-sm font-semibold uppercase tracking-[2px] text-mut">
        Loading
      </div>
    );
  }

  // Any filter/sort change re-windows from the top.
  const resetWindow = () => {
    setShown(PAGE);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const chipCls = (active: boolean) =>
    `shrink-0 rounded-full border-[0.5px] px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
      active
        ? "border-white bg-white text-black"
        : "border-edge text-mut hover:border-mut hover:text-white"
    }`;

  const shownPosts = visiblePosts.slice(0, shown);

  return (
    <>
      <ViewportShell>
        <PageHeader
          backHref="/"
          title="Browse"
          right={
            <button
              onClick={() => {
                setSort(
                  (s) => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]
                );
                resetWindow();
              }}
              aria-label={`Sorting by ${SORT_LABEL[sort].toLowerCase()} — tap to change`}
              className="flex items-center gap-1.5 rounded-full border-[0.5px] border-edge px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-mut transition-colors hover:border-mut hover:text-white"
            >
              {sort === "liked" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M11 5h10M11 9h7M11 13h4" />
                  <path d="M3 17l3 3 3-3M6 18V4" />
                </svg>
              )}
              {SORT_LABEL[sort]}
            </button>
          }
        />

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <main className="mx-auto w-full max-w-lg pb-10 pt-[calc(52px+env(safe-area-inset-top))]">
            {/* Member filter — scrolls horizontally, busiest posters first. */}
            <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
              <button
                onClick={() => {
                  setWho(null);
                  resetWindow();
                }}
                className={chipCls(who === null)}
              >
                Everyone
              </button>
              {members.map(([name, count]) => (
                <button
                  key={name}
                  onClick={() => {
                    setWho((w) => (w === name ? null : name));
                    resetWindow();
                  }}
                  className={chipCls(who === name)}
                >
                  {name}
                  <span className={who === name ? "ml-1 opacity-60" : "ml-1 text-dim"}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {posts === null && (
              <p className="py-10 text-center text-[11px] font-semibold uppercase tracking-[2px] text-dim">
                Loading
              </p>
            )}

            {posts !== null && visiblePosts.length === 0 && (
              <p className="py-10 text-center text-sm text-mut">Nothing here yet.</p>
            )}

            {shownPosts.map((post) => (
              <PhotoCard
                key={post.id}
                post={post}
                uid={user.uid}
                username={username || "Anonymous"}
                commentsVersion={commentBumps[post.id] ?? 0}
                onOpenComments={setActiveComments}
                onDeleted={(id) =>
                  setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
                }
              />
            ))}

            <div ref={sentinelRef} className="h-10" />
          </main>
        </div>
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
    </>
  );
}
