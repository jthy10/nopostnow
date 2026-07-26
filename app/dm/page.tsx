"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useThreads, useStandalone, isThreadUnread, peerUidOf } from "@/lib/dms";
import { useBlockSets } from "@/lib/blocks";
import { useNamesByUid } from "@/lib/users";
import { timeAgo } from "@/lib/notifications";
import Avatar from "@/components/Avatar";
import PageHeader from "@/components/PageHeader";
import DmInstallPitch from "@/components/DmInstallPitch";
import UserSearchSheet from "@/components/UserSearchSheet";
import ViewportShell from "@/components/ViewportShell";

const composeIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-[22px] w-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const standalone = useStandalone();
  const allThreads = useThreads(user?.uid);
  const { hidden } = useBlockSets(user?.uid);
  const names = useNamesByUid();
  const [searching, setSearching] = useState(false);

  // Threads with someone blocked (either direction) disappear from the list;
  // unblocking brings them back with their history intact.
  const threads =
    allThreads && user
      ? allThreads.filter((t) => {
          const peer = peerUidOf(t.id, user.uid);
          return !peer || !hidden.has(peer);
        })
      : allThreads;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user || standalone === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-sm font-semibold uppercase tracking-[2px] text-mut">
        Loading
      </div>
    );
  }

  if (!standalone) return <DmInstallPitch />;

  return (
    <>
      <ViewportShell>
      <PageHeader
        backHref="/notifications"
        title="Messages"
        right={
          <button
            onClick={() => setSearching(true)}
            aria-label="New message"
            className="p-1.5 text-white transition-opacity active:opacity-60"
          >
            {composeIcon}
          </button>
        }
      />

      <main className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto overscroll-contain pb-6 pt-[calc(52px+env(safe-area-inset-top))]">
        {threads === null && (
          <p className="py-10 text-center text-[11px] font-semibold uppercase tracking-[2px] text-dim">
            Loading
          </p>
        )}

        {threads?.length === 0 && (
          <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
            <p className="text-sm text-mut">No messages yet.</p>
            <button
              onClick={() => setSearching(true)}
              className="rounded-lg bg-white px-6 py-2.5 text-xs font-extrabold text-black transition-opacity active:opacity-75"
            >
              New Message
            </button>
          </div>
        )}

        {threads?.map((t) => {
          const peerUid = peerUidOf(t.id, user.uid);
          // Prefer the peer's current name (resolves renames instantly), fall
          // back to the name cached on the thread, then to a placeholder.
          const name =
            (peerUid && (names.get(peerUid) ?? t.names?.[peerUid])) || "Someone";
          const unread = isThreadUnread(t, user.uid);
          return (
            <Link
              key={t.id}
              href={`/dm/${t.id}`}
              className="flex items-center gap-3 border-b-[0.5px] border-field px-4 py-3 transition-colors active:bg-card"
            >
              <Avatar username={name} className="h-12 w-12 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[14px] font-bold">{name}</p>
                  <span className="shrink-0 text-[11px] text-meta">{timeAgo(t.lastAt)}</span>
                </div>
                <p
                  className={`truncate text-[13px] ${
                    unread ? "font-semibold text-white" : "text-mut"
                  }`}
                >
                  {t.lastFrom === user.uid ? `You: ${t.lastText}` : t.lastText}
                </p>
              </div>
              {unread && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-heart" aria-label="Unread" />
              )}
            </Link>
          );
        })}
      </main>
      </ViewportShell>

      {searching && <UserSearchSheet myUid={user.uid} onClose={() => setSearching(false)} />}
    </>
  );
}
