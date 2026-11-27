/** The site's public origin for absolute links (sitemap, robots). On Vercel this comes from the
 *  production domain the platform reports at build time; locally it falls back to localhost. */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Pages anyone may find through a search engine. Everything else is behind sign-in. */
export const PUBLIC_PATHS = ["/", "/login", "/signup", "/terms", "/privacy"] as const;
