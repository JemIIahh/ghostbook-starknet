import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://ghostbook.flare");

  const paths = [
    "",
    "/privacy",
    "/orders",
    "/pools",
    "/liquidity",
    "/vault",
    "/admin",
  ];

  const now = new Date();

  return paths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/privacy" || path === "/orders" ? 0.9 : 0.7,
  }));
}
