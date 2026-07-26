import { ImageResponse } from "next/og";
import { loadOgFonts, OG_SIZE } from "@/lib/og";

export const alt = "NoPostNow — a private photo feed";
export const size = OG_SIZE;
export const contentType = "image/png";

const heart = (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="#ff3b5c">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

const corner = {
  position: "absolute" as const,
  display: "flex",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 6,
  color: "#555555",
};

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          backgroundImage: "radial-gradient(circle at 50% 42%, #1c1c1c 0%, #0a0a0a 62%)",
          fontFamily: "Inter",
        }}
      >
        {/* hairline frame */}
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 28,
            right: 28,
            bottom: 28,
            display: "flex",
            border: "1px solid #2a2a2a",
            borderRadius: 28,
          }}
        />

        {/* corner marks */}
        <div style={{ ...corner, top: 56, left: 64 }}>PRIVATE BY DESIGN</div>
        <div style={{ position: "absolute", top: 52, right: 64, display: "flex" }}>{heart}</div>
        <div style={{ ...corner, bottom: 56, right: 64, color: "#8a8a8a" }}>NOPOSTNOW.COM</div>

        {/* wordmark */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: -14,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 126,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 0.95,
              letterSpacing: -7,
            }}
          >
            NoPostNow
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              fontWeight: 400,
              color: "#8a8a8a",
              marginTop: 40,
            }}
          >
            A private photo feed.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await loadOgFonts() }
  );
}
