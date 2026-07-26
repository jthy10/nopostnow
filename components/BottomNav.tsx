"use client";

import { useRef, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export default function BottomNav({
  onCapture,
  scrollRef,
}: {
  onCapture: (file: File) => void;
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const pathname = usePathname();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  return (
    <nav className="pwa-bottom-nav relative z-40 shrink-0 border-t-[0.5px] border-line bg-panel pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[46px] items-center justify-around px-5">
        <Link
          href="/feed"
          onClick={(e) => {
            // Already on the feed: jump back to the top instead of re-navigating.
            if (pathname === "/feed") {
              e.preventDefault();
              const scroller = scrollRef?.current;
              if (scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
              else window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          className={`flex h-full min-w-16 flex-col items-center justify-center gap-0.5 transition-opacity ${
            pathname === "/feed" ? "opacity-100" : "opacity-40"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" {...icon}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="text-[8px] font-bold uppercase tracking-[0.8px]">Feed</span>
        </Link>

        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex h-full min-w-16 flex-col items-center justify-center gap-0.5"
          aria-label="Post a photo"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-transform active:scale-90">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...icon} strokeWidth={2}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[0.8px]">Post</span>
        </button>
        {/* Feed posts are camera-only by design — in-the-moment photos, no library uploads. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onCapture(f);
          }}
          className="hidden"
        />

        <Link
          href="/profile"
          className={`flex h-full min-w-16 flex-col items-center justify-center gap-0.5 transition-opacity ${
            pathname === "/profile" ? "opacity-100" : "opacity-40"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" {...icon}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="text-[8px] font-bold uppercase tracking-[0.8px]">Profile</span>
        </Link>
      </div>
    </nav>
  );
}
