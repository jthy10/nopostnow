import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/app", "/privacy", "/terms"],
        disallow: [
          "/admin",
          "/auth",
          "/browse",
          "/dm",
          "/feed",
          "/login",
          "/notifications",
          "/profile",
          "/search",
          "/settings",
          "/verify",
        ],
      },
    ],
    sitemap: "https://nopostnow.com/sitemap.xml",
  };
}
