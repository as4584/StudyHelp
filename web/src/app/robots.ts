import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/site";

// Signed-in areas and one-off payment pages have nothing for a search engine and should never
// show up in results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/assistant",
        "/checkout",
        "/dashboard",
        "/onboard",
        "/payments",
        "/student",
        "/tasks",
        "/tutor",
        "/tutors",
      ],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
