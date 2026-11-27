"""Typed runtime configuration. Every setting comes from the environment."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Cloudflare's published Turnstile test secrets: one always passes, one always fails.
TURNSTILE_TEST_SECRET_PASS = "1x0000000000000000000000000000000AA"  # noqa: S105 (public)
TURNSTILE_TEST_SECRET_FAIL = "2x0000000000000000000000000000000AA"  # noqa: S105 (public)
TURNSTILE_TEST_SECRETS = (TURNSTILE_TEST_SECRET_PASS, TURNSTILE_TEST_SECRET_FAIL)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "demo", "production"] = "development"
    version: str = "0.1.0"
    # GIT_SHA, else the commit Vercel built (VERCEL_GIT_COMMIT_SHA), else "unknown".
    # Empty values count as unset (Vercel sets the commit variable empty on CLI deploys).
    git_sha: str = "unknown"
    vercel_git_commit_sha: str = ""

    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres"
    # "none" on serverless hosts (Vercel): each instance holding its own pool of up to 15
    # connections exhausts the Supabase pooler, so there a request opens and closes its own.
    database_pool: Literal["queue", "none"] = "queue"

    # Supabase: the issuer is <SUPABASE_URL>/auth/v1 and keys come from its JWKS.
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_secret_key: str = ""
    jwt_audience: str = "authenticated"
    jwt_algorithms: list[str] = Field(default_factory=lambda: ["ES256", "RS256"])

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    web_base_url: str = "http://localhost:3000"

    # Marketplace commission in basis points; product policy is 20-30%.
    platform_fee_bps: int = 2500
    # Session price range (client policy: $15-$25). Request budgets and tutor bids must fit it.
    price_min_cents: int = Field(default=1500, ge=500)
    price_max_cents: int = Field(default=2500, le=500000)
    premium_price_cents: int = 999
    # AI study assistant: free questions per UTC day, and the Premium fair-use cap per month.
    ai_free_daily: int = Field(default=5, ge=0)
    ai_premium_monthly: int = Field(default=150, ge=1)

    payments_provider: Literal["stripe", "fake"] = "fake"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_premium_price_id: str = ""
    # Live keys need this explicit switch (set by a human at go-live, production only), so a
    # live key can never be picked up by accident in a preview, demo or local build.
    stripe_live_mode: bool = False

    storage_provider: Literal["supabase", "fake"] = "supabase"

    llm_provider: Literal["anthropic", "openai", "ollama", "fake"] = "fake"
    anthropic_api_key: str = ""
    anthropic_model: str = ""
    openai_api_key: str = ""
    openai_model: str = ""
    # Self-hosted open model via Ollama's chat API (no per-token cost; good for demos).
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = ""
    ollama_api_key: str = ""  # optional bearer token when Ollama sits behind an auth proxy
    ollama_timeout_s: float = 120.0
    llm_max_tokens: int = 800

    translation_provider: Literal["deepl", "google", "ollama", "fake"] = "fake"
    # Self-hosted translation model (no per-message cost); defaults to the LLM's Ollama server.
    translation_ollama_model: str = ""
    deepl_api_key: str = ""
    deepl_api_url: str = "https://api-free.deepl.com/v2/translate"
    google_translate_api_key: str = ""
    translation_timeout_s: float = 5.0

    # Reading photos and scanned PDFs for the study assistant (a vision model on Ollama).
    # Text PDFs are read without any model; "off" turns photo reading off.
    ocr_provider: Literal["ollama", "off"] = "off"
    ocr_ollama_model: str = ""
    ocr_timeout_s: float = 90.0

    # Live video + screen share (self-hosted LiveKit SFU). Media never passes through this API;
    # it only authorizes a party and signs a short-lived, single-room credential.
    video_enabled: bool = False
    video_provider: Literal["livekit", "fake"] = "fake"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_url: str = "http://127.0.0.1:7880"  # server-to-server (RoomService) address
    livekit_public_url: str = ""  # wss:// address browsers connect to
    video_token_ttl_s: int = Field(default=600, ge=60, le=3600)

    # Bot check (Cloudflare Turnstile) on sign-up. When unset outside production, Cloudflare's
    # published always-pass test secret is used, so local runs and CI need no real keys.
    turnstile_secret_key: str = ""
    turnstile_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    turnstile_timeout_s: float = 5.0

    @property
    def turnstile_secret(self) -> str:
        return self.turnstile_secret_key or TURNSTILE_TEST_SECRET_PASS

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @property
    def payments_mode(self) -> Literal["demo", "test", "live"]:
        if self.payments_provider != "stripe":
            return "demo"
        return "live" if self.stripe_secret_key.startswith(("sk_live_", "rk_live_")) else "test"

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if self.git_sha in ("", "unknown"):
            self.git_sha = self.vercel_git_commit_sha[:7] or "unknown"
        if not 2000 <= self.platform_fee_bps <= 3000:
            raise ValueError("PLATFORM_FEE_BPS must be within the 20-30% policy (2000-3000)")
        if self.price_min_cents > self.price_max_cents:
            raise ValueError("PRICE_MIN_CENTS must not exceed PRICE_MAX_CENTS")
        if self.payments_provider == "stripe":
            test_key = self.stripe_secret_key.startswith(("sk_test_", "rk_test_"))
            live_key = self.stripe_secret_key.startswith(("sk_live_", "rk_live_"))
            if self.stripe_live_mode:
                # Live keys are an explicit human approval boundary (AGENTS.md).
                if self.environment != "production":
                    raise ValueError("STRIPE_LIVE_MODE is only allowed in production")
                if not live_key:
                    raise ValueError("STRIPE_LIVE_MODE needs a live Stripe key (sk_live_/rk_live_)")
                if not self.stripe_premium_price_id:
                    raise ValueError("STRIPE_PREMIUM_PRICE_ID is required in live mode")
            elif not test_key:
                raise ValueError(
                    "Only Stripe TEST keys are permitted unless STRIPE_LIVE_MODE is turned on"
                )
            if not self.stripe_webhook_secret:
                raise ValueError("STRIPE_WEBHOOK_SECRET is required with the stripe provider")
        if self.environment == "production" and "fake" in (
            self.payments_provider,
            self.llm_provider,
            self.translation_provider,
            self.storage_provider,
            self.video_provider if self.video_enabled else None,
        ):
            raise ValueError("Fake adapters are not allowed in production")
        if self.environment == "production" and (
            not self.turnstile_secret_key or self.turnstile_secret_key in TURNSTILE_TEST_SECRETS
        ):
            raise ValueError("A real TURNSTILE_SECRET_KEY is required in production")
        if self.llm_provider == "anthropic" and not (
            self.anthropic_api_key and self.anthropic_model
        ):
            raise ValueError("ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required")
        if self.llm_provider == "openai" and not (self.openai_api_key and self.openai_model):
            raise ValueError("OPENAI_API_KEY and OPENAI_MODEL are required")
        if self.llm_provider == "ollama" and not self.ollama_model:
            raise ValueError("OLLAMA_MODEL is required")
        if self.translation_provider == "deepl" and not self.deepl_api_key:
            raise ValueError("DEEPL_API_KEY is required")
        if self.translation_provider == "ollama" and not self.translation_ollama_model:
            raise ValueError(
                "TRANSLATION_OLLAMA_MODEL is required when TRANSLATION_PROVIDER=ollama"
            )
        if self.ocr_provider == "ollama" and not self.ocr_ollama_model:
            raise ValueError("OCR_OLLAMA_MODEL is required when OCR_PROVIDER=ollama")
        if self.translation_provider == "google" and not self.google_translate_api_key:
            raise ValueError("GOOGLE_TRANSLATE_API_KEY is required")
        if self.video_provider == "livekit":
            if not self.livekit_api_key:
                raise ValueError("LIVEKIT_API_KEY is required")
            if len(self.livekit_api_secret) < 32:
                raise ValueError("LIVEKIT_API_SECRET must be at least 32 characters")
            dev = self.environment in ("development", "test")
            local = dev and self.livekit_public_url.startswith(
                ("ws://127.0.0.1:", "ws://localhost:")
            )
            if not (self.livekit_public_url.startswith("wss://") or local):
                raise ValueError(
                    "LIVEKIT_PUBLIC_URL must be a wss:// URL (ws:// only for localhost)"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
