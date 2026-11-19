/** Only publish locales with a complete, reviewed website translation. Chat languages are separate. */
export const WEBSITE_LANGUAGES = [{ code: "en", label: "English", direction: "ltr" }] as const;
export type WebsiteLocale = (typeof WEBSITE_LANGUAGES)[number]["code"];
export const LANGUAGE_COOKIE = "studyhelp_language";
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Country is deliberately a last resort, never an override of someone's language preferences.
const COUNTRY_LANGUAGE: Record<string, string> = {
  US: "en",
  GB: "en",
  AU: "en",
  NZ: "en",
  IE: "en",
  ES: "es",
  MX: "es",
  AR: "es",
  CL: "es",
  CO: "es",
  PE: "es",
  FR: "fr",
  PT: "pt",
  BR: "pt",
  IN: "hi",
  SA: "ar",
  EG: "ar",
  AE: "ar",
  CN: "zh-Hans",
  TW: "zh-Hant",
  HK: "zh-Hant",
};

function match(language: string | undefined, supported: readonly string[]): string | undefined {
  const tag = language?.trim().toLowerCase();
  if (!tag || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return;
  // Remove regional subtags progressively (zh-Hant-TW -> zh-Hant -> zh), never add/guess a script.
  let candidate = tag;
  while (candidate) {
    const exact = supported.find((locale) => locale.toLowerCase() === candidate);
    if (exact) return exact;
    const separator = candidate.lastIndexOf("-");
    if (separator < 0) break;
    candidate = candidate.slice(0, separator);
  }
}

export function isWebsiteLocale(value: unknown): value is WebsiteLocale {
  return WEBSITE_LANGUAGES.some(({ code }) => code === value);
}

export type LocaleSignals = { saved?: string; acceptLanguage?: string | null; country?: string | null };

/** Pure negotiation, also tested against future catalogs without enabling untranslated UI. */
export function negotiateLocale(signals: LocaleSignals, supported: readonly string[]): string {
  if (!supported.includes("en")) throw new Error("The English fallback must be supported");
  const saved = match(signals.saved, supported);
  if (saved) return saved;
  const preferences = (signals.acceptLanguage ?? "").split(",").map((entry, index) => {
    const [language, ...parameters] = entry.trim().split(";");
    const quality = parameters
      .find((p) => p.trim().startsWith("q="))
      ?.trim()
      .slice(2);
    const q = quality === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality) ? Number(quality) : 0;
    return { language, q, index };
  });
  preferences.sort((a, b) => b.q - a.q || a.index - b.index);
  for (const preference of preferences) {
    if (preference.q <= 0) continue;
    const locale = match(preference.language, supported);
    if (locale) return locale;
  }
  const countryLocale = match(COUNTRY_LANGUAGE[(signals.country ?? "").toUpperCase()], supported);
  const rejected = preferences.some(({ language, q }) => {
    const range = language.toLowerCase();
    const candidate = countryLocale?.toLowerCase();
    return q === 0 && (range === "*" || candidate === range || candidate?.startsWith(`${range}-`));
  });
  return countryLocale && !rejected ? countryLocale : "en";
}

export function resolveWebsiteLocale(signals: LocaleSignals): WebsiteLocale {
  return negotiateLocale(
    signals,
    WEBSITE_LANGUAGES.map(({ code }) => code),
  ) as WebsiteLocale;
}
