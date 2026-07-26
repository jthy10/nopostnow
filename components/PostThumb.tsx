"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthedImage } from "@/lib/use-authed-image";

// Small square preview of a post's photo, used inline on notification rows
// ("X liked your photo" shows which photo). Resolves postId -> imagePath once
// per session; deleted posts resolve to null and render nothing.
const pathCache = new Map<string, Promise<string | null>>();

function imagePathFor(postId: string): Promise<string | null> {
  let hit = pathCache.get(postId);
  if (!hit) {
    hit = getDoc(doc(db, "photos", postId))
      .then((snap) =>
        snap.exists() && snap.data().deleted !== true
          ? (snap.data().imagePath as string) ?? null
          : null
      )
      .catch(() => null);
    pathCache.set(postId, hit);
  }
  return hit;
}

export default function PostThumb({
  postId,
  className = "h-10 w-10",
}: {
  postId: string;
  className?: string;
}) {
  const [path, setPath] = useState<string | null>(null);
  const src = useAuthedImage(path, true); // compressed display copy

  useEffect(() => {
    let cancelled = false;
    imagePathFor(postId).then((p) => {
      if (!cancelled) setPath(p);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`shrink-0 rounded-md border-[0.5px] border-edge object-cover ${className}`}
    />
  );
}
