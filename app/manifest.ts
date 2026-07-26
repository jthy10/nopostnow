import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NoPostNow",
    short_name: "NoPostNow",
    description: "A chronological, members-only photo feed",
    start_url: "/feed",
    display: "standalone",
    // Locks Android PWAs to portrait. iOS ignores this — OrientationLock
    // covers it with a rotate-back overlay instead.
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android masks icons into circles/squircles — this one keeps the
      // wordmark inside the safe zone so it never gets clipped.
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
