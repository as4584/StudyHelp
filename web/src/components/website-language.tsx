"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { saveWebsiteLanguage } from "@/app/language/actions";
import { WEBSITE_LANGUAGES, type WebsiteLocale } from "@/lib/locale";

const LocaleContext = createContext<{ locale: WebsiteLocale; saved: WebsiteLocale | null }>({
  locale: "en",
  saved: null,
});

export function WebsiteLanguageProvider({
  locale,
  saved,
  children,
}: {
  locale: WebsiteLocale;
  saved: WebsiteLocale | null;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={{ locale, saved }}>{children}</LocaleContext.Provider>;
}

export function WebsiteLanguagePicker() {
  const { locale, saved } = useContext(LocaleContext);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="text-[13px] text-muted">
      <label className="flex flex-wrap items-center gap-2">
        <span>Website language</span>
        <select
          aria-label="Website language"
          className="min-h-11 rounded-[6px] border border-rule bg-paper px-2 text-ink"
          value={saved ?? "auto"}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value;
            setError("");
            startTransition(async () => {
              try {
                await saveWebsiteLanguage(value);
              } catch {
                setError("Could not save your language. Please try again.");
              }
            });
          }}
        >
          <option value="auto">Automatic ({WEBSITE_LANGUAGES.find(({ code }) => code === locale)?.label})</option>
          {WEBSITE_LANGUAGES.map(({ code, label }) => (
            <option key={code} value={code} lang={code}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1">English is available at launch. Your choice is saved on this browser.</p>
      {pending && <p role="status">Saving language…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
