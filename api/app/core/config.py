"""Typed runtime configuration. Every setting comes from the environment."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "demo", "production"] = "development"
    version: str = "0.1.0"
    git_sha: str = "unknown"

    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres"

    # Supabase: the issuer is <SUPABASE_URL>/auth/v1 and keys come from its JWKS.
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_secret_key: str = ""
    jwt_audience: str = "authenticated"
    jwt_algorithms: list[str] = Field(default_factory=lambda: ["ES256", "RS256"])

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    web_base_url: str = "http://localhost:3000"

    # Marketplace commission in basis points; product policy is 20-30%.
    platform_fee_bps: int = 2500
    premium_price_cents: int = 999

    payments_provider: Literal["stripe", "fake"] = "fake"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_premium_price_id: str = ""

    storage_provider: Literal["supabase", "fake"] = "supabase"

    llm_provider: Literal["anthropic", "openai", "fake"] = "fake"
    anthropic_api_key: str = ""
    anthropic_model: str = ""
    openai_api_key: str = ""
    openai_model: str = ""
    llm_max_tokens: int = 800

    translation_provider: Literal["deepl", "google", "fake"] = "fake"
    deepl_api_key: str = ""
    deepl_api_url: str = "https://api-free.deepl.com/v2/translate"
    google_translate_api_key: str = ""
    translation_timeout_s: float = 5.0

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if not 2000 <= self.platform_fee_bps <= 3000:
            raise ValueError("PLATFORM_FEE_BPS must be within the 20-30% policy (2000-3000)")
        if self.payments_provider == "stripe":
            if not self.stripe_secret_key.startswith(("sk_test_", "rk_test_")):
                # Live keys are an explicit human approval boundary (AGENTS.md).
                raise ValueError("Only Stripe TEST keys are permitted in this build")
            if not self.stripe_webhook_secret:
                raise ValueError("STRIPE_WEBHOOK_SECRET is required with the stripe provider")
        if self.environment == "production" and "fake" in (
            self.payments_provider,
            self.llm_provider,
            self.translation_provider,
            self.storage_provider,
        ):
            raise ValueError("Fake adapters are not allowed in production")
        if self.llm_provider == "anthropic" and not (self.anthropic_api_key and self.anthropic_model):
            raise ValueError("ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required")
        if self.llm_provider == "openai" and not (self.openai_api_key and self.openai_model):
            raise ValueError("OPENAI_API_KEY and OPENAI_MODEL are required")
        if self.translation_provider == "deepl" and not self.deepl_api_key:
            raise ValueError("DEEPL_API_KEY is required")
        if self.translation_provider == "google" and not self.google_translate_api_key:
            raise ValueError("GOOGLE_TRANSLATE_API_KEY is required")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
