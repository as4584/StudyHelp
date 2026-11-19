# ruff: noqa: RUF001  (script ranges are written as the characters themselves)
"""Every chat language the self-hosted translator is tested on.

`name` is what the model is told; `native` is what people pick from; `script` is the writing
system a translation into the language must use (None = Latin). `enabled` languages passed the
round-trip eval (scripts/translation_eval.py --mode roundtrip); see evals/RESULTS.md.
"""

import re
from dataclasses import dataclass

SCRIPTS = {
    "devanagari": r"[ऀ-ॿ]",
    "arabic": r"[؀-ۿݐ-ݿ]",
    "han": r"[一-鿿]",
    "kana": r"[぀-ヿ]",
    "japanese": r"[぀-ヿ一-鿿]",
    "hangul": r"[가-힯]",
    "cyrillic": r"[Ѐ-ӿ]",
    "greek": r"[Ͱ-Ͽ]",
    "hebrew": r"[֐-׿]",
    "bengali": r"[ঀ-৿]",
    "gurmukhi": r"[਀-੿]",
    "gujarati": r"[઀-૿]",
    "tamil": r"[஀-௿]",
    "telugu": r"[ఀ-౿]",
    "kannada": r"[ಀ-೿]",
    "malayalam": r"[ഀ-ൿ]",
    "thai": r"[฀-๿]",
    "ethiopic": r"[ሀ-፿]",
    "georgian": r"[Ⴀ-ჿ]",
    "armenian": r"[԰-֏]",
    "khmer": r"[ក-៿]",
    "myanmar": r"[က-႟]",
    "sinhala": r"[඀-෿]",
}
SCRIPT_RE = {k: re.compile(v) for k, v in SCRIPTS.items()}
ANY_NON_LATIN = re.compile("|".join(SCRIPTS.values()))


@dataclass(frozen=True)
class Language:
    code: str
    name: str
    native: str
    script: str | None = None
    enabled: bool = False  # off = scored too low in evals/RESULTS.md


LANGUAGES: dict[str, Language] = {
    lang.code: lang
    for lang in [
        Language("en", "English", "English", enabled=True),
        Language("es", "Spanish", "Español", enabled=True),
        Language("fr", "French", "Français", enabled=True),
        Language("pt", "Portuguese", "Português", enabled=True),
        Language("hi", "Hindi", "हिन्दी", "devanagari", enabled=True),
        Language("ar", "Arabic", "العربية", "arabic", enabled=True),
        Language("zh", "Simplified Chinese", "中文", "han", enabled=True),
        Language("de", "German", "Deutsch", enabled=True),
        Language("it", "Italian", "Italiano", enabled=True),
        Language("nl", "Dutch", "Nederlands", enabled=True),
        Language("pl", "Polish", "Polski", enabled=True),
        Language("ro", "Romanian", "Română", enabled=True),
        Language("sv", "Swedish", "Svenska", enabled=True),
        Language("cs", "Czech", "Čeština", enabled=True),
        Language("hu", "Hungarian", "Magyar", enabled=True),
        Language("el", "Greek", "Ελληνικά", "greek", enabled=True),
        Language("ru", "Russian", "Русский", "cyrillic", enabled=True),
        Language("uk", "Ukrainian", "Українська", "cyrillic", enabled=True),
        Language("tr", "Turkish", "Türkçe", enabled=True),
        Language("he", "Hebrew", "עברית", "hebrew", enabled=True),
        Language("fa", "Persian", "فارسی", "arabic", enabled=True),
        Language("ur", "Urdu", "اردو", "arabic", enabled=True),
        Language("bn", "Bengali", "বাংলা", "bengali", enabled=True),
        Language("pa", "Punjabi", "ਪੰਜਾਬੀ", "gurmukhi", enabled=True),
        Language("gu", "Gujarati", "ગુજરાતી", "gujarati", enabled=True),
        Language("mr", "Marathi", "मराठी", "devanagari", enabled=True),
        Language("ta", "Tamil", "தமிழ்", "tamil", enabled=True),
        Language("te", "Telugu", "తెలుగు", "telugu", enabled=True),
        Language("kn", "Kannada", "ಕನ್ನಡ", "kannada", enabled=True),
        Language("ml", "Malayalam", "മലയാളം", "malayalam", enabled=True),
        Language("ne", "Nepali", "नेपाली", "devanagari", enabled=True),
        Language("ja", "Japanese", "日本語", "japanese"),
        Language("ko", "Korean", "한국어", "hangul", enabled=True),
        Language("vi", "Vietnamese", "Tiếng Việt", enabled=True),
        Language("th", "Thai", "ไทย", "thai", enabled=True),
        Language("id", "Indonesian", "Bahasa Indonesia", enabled=True),
        Language("ms", "Malay", "Bahasa Melayu", enabled=True),
        Language("tl", "Filipino (Tagalog)", "Filipino", enabled=True),
        Language("sw", "Swahili", "Kiswahili", enabled=True),
        Language("am", "Amharic", "አማርኛ", "ethiopic"),
        Language("ha", "Hausa", "Hausa"),
        Language("yo", "Yoruba", "Yorùbá"),
        Language("ig", "Igbo", "Igbo"),
        Language("zu", "Zulu", "isiZulu"),
        Language("so", "Somali", "Soomaali"),
        Language("ht", "Haitian Creole", "Kreyòl ayisyen", enabled=True),
        Language("ka", "Georgian", "ქართული", "georgian", enabled=True),
        Language("hy", "Armenian", "Հայերեն", "armenian", enabled=True),
        Language("km", "Khmer", "ខ្មែរ", "khmer", enabled=True),
        Language("my", "Burmese", "မြန်မာ", "myanmar"),
        Language("si", "Sinhala", "සිංහල", "sinhala", enabled=True),
    ]
}


def enabled_codes() -> list[str]:
    return [c for c, lang in LANGUAGES.items() if lang.enabled]
