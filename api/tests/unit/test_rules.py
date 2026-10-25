import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import InvalidState
from app.providers.llm import FakeLLMProvider, get_llm_provider
from app.providers.translation import FakeTranslationProvider, TranslationError
from app.services.fees import split_payment, validate_tip
from app.services.state import can_transition, ensure_transition


@pytest.mark.parametrize(
    ("amount", "bps", "fee", "net"),
    [(4000, 2500, 1000, 3000), (999, 2000, 200, 799), (1001, 3000, 300, 701), (1, 2500, 0, 1)],
)
def test_fee_split_is_exact_and_sums(amount: int, bps: int, fee: int, net: int) -> None:
    s = split_payment(amount, bps)
    assert (s.platform_fee_cents, s.tutor_net_cents) == (fee, net)
    assert s.platform_fee_cents + s.tutor_net_cents == amount


@pytest.mark.parametrize("bps", [1999, 3001, 0])
def test_fee_outside_policy_rejected(bps: int) -> None:
    with pytest.raises(ValueError):
        split_payment(1000, bps)


def test_nonpositive_amount_rejected() -> None:
    with pytest.raises(ValueError):
        split_payment(0, 2500)


@pytest.mark.parametrize("bps", ["1500", "3500"])
def test_config_enforces_fee_policy(bps: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLATFORM_FEE_BPS", bps)
    with pytest.raises(ValidationError):
        Settings()


def test_config_rejects_live_stripe_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PAYMENTS_PROVIDER", "stripe")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_abc")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_x")
    with pytest.raises(ValidationError, match="TEST keys"):
        Settings()


def test_config_rejects_fakes_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(ValidationError, match="Fake adapters"):
        Settings()


def test_config_requires_model_env_for_real_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.delenv("ANTHROPIC_MODEL", raising=False)
    with pytest.raises(ValidationError, match="ANTHROPIC_MODEL"):
        Settings()


@pytest.mark.parametrize("cents", [200, 500, 1000])
def test_valid_tips(cents: int) -> None:
    assert validate_tip(cents) == cents


@pytest.mark.parametrize("cents", [0, 100, 300, 2000, -500])
def test_invalid_tips(cents: int) -> None:
    with pytest.raises(ValueError):
        validate_tip(cents)


def test_state_machine() -> None:
    assert can_transition("open", "hired")
    assert can_transition("delivered", "completed")
    assert not can_transition("paid", "completed")  # must be delivered first
    assert not can_transition("disputed", "cancelled")
    assert not can_transition("completed", "refunded")
    with pytest.raises(InvalidState):
        ensure_transition("open", "paid")


def test_provider_selection_defaults_to_fake() -> None:
    get_llm_provider.cache_clear()
    assert isinstance(get_llm_provider(), FakeLLMProvider)


async def test_fake_translation_is_labelled_and_can_fail() -> None:
    p = FakeTranslationProvider()
    assert await p.translate("hi", source="en", target="es") == "[EN→ES] hi"
    with pytest.raises(TranslationError):
        await p.translate("x [[fail-translation]]", source="en", target="es")
