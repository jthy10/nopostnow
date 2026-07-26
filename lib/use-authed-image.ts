"use client";

import { useEffect, useState } from "react";
import { ref, getBlob } from "firebase/storage";
import { storage } from "./firebase";
import { displayVariantPath } from "./posts";

// Firebase's getDownloadURL() embeds a long-lived shareable token that
// bypasses Storage security rules entirely — anyone with the URL can view
// the file whether or not they're signed in. We fetch bytes through the
// authenticated SDK instead so access still depends on the Firebase Auth
// session (and therefore on the deployed storage.rules).
const cache = new Map<string, string>();
// Display variants that 404'd this session — don't re-request them per mount.
const missingVariants = new Set<string>();

// With preferDisplay, tries the compressed photos/display/** copy first and
// falls back to the untouched original (pre-backfill photos, tiny images).
export function useAuthedImage(path: string | null | undefined, preferDisplay = false) {
  const [src, setSrc] = useState<string | null>(() => {
    if (!path) return null;
    return (
      (preferDisplay ? cache.get(displayVariantPath(path)) : undefined) ??
      cache.get(path) ??
      null
    );
  });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    const candidates = preferDisplay ? [displayVariantPath(path), path] : [path];

    (async () => {
      for (const candidate of candidates) {
        if (missingVariants.has(candidate)) continue;
        const hit = cache.get(candidate);
        if (hit) {
          if (!cancelled) setSrc(hit);
          return;
        }
        try {
          const blob = await getBlob(ref(storage, candidate));
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          cache.set(candidate, url);
          setSrc(url);
          return;
        } catch {
          if (candidate !== path) missingVariants.add(candidate);
        }
      }
      if (!cancelled) setSrc(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [path, preferDisplay]);

  return src;
}
