# Website language selection

- LANG-1: Resolve a supported website language on the server in this order: explicit
  saved browser choice, weighted browser Accept-Language, IP-derived country, English.
- LANG-2: English is the only enabled website language at launch. Never advertise a
  language or set the document language to it while rendering an untranslated English UI.
- LANG-3: A labelled picker is available in the shared footer on public and signed-in
  pages, including mobile. Save an explicit choice for one year in a host-only,
  HttpOnly, SameSite=Lax cookie (Secure in production). Automatic deletes that choice.
  Report write failures and keep the previous selection. No automatic preference cookie.
- LANG-4: Render lang and dir on the initial document. Request-bound rendering must
  not cache one visitor's language for another. Keep URLs and auth flows unchanged.
- LANG-5: Only consume Vercel's country header when running on Vercel. Do not request
  GPS access, send IPs to a third party, or persist country/IP data. Unknown countries
  and unavailable signals fall back safely. Country is an approximation of language.
- LANG-6: Website choice is independent of the existing account preferred_language,
  which controls chat translation. No change to chat, user content, payments or currency.

## Adding translations after the English launch

`web/src/lib/locale.ts` owns the enabled website locale registry, independently from
the chat language list. Before enabling another locale, provide and review complete
translations for all pages, shared controls, validation/error states, metadata and
policies; add appropriate fonts, locale formatting and RTL layouts where applicable.
Then extend the registry and test the real rendered pages in that language. Adding
a language code alone is not a translation implementation. No runtime translation
provider or machine-translated legal content is introduced by this English release.

Saved choice is browser-specific, not account-synced. Resetting to Automatic resumes
detection on subsequent requests. Browser language tags use exact matches followed
by a supported base language; script variants are never guessed. Country mappings
are a curated fallback, not an exhaustive statement about a country's languages.

Implementation references:
- https://nextjs.org/docs/app/api-reference/functions/cookies
- https://vercel.com/docs/headers/request-headers
