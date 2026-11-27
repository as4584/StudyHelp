"""The website's demo/test labels follow payments_mode, which comes from the key itself."""

from app.core.config import Settings


def test_payments_mode_follows_the_configured_key() -> None:
    assert Settings(payments_provider="fake").payments_mode == "demo"
    test = Settings(
        payments_provider="stripe", stripe_secret_key="sk_test_x", stripe_webhook_secret="whsec_x"
    )
    assert test.payments_mode == "test"
    # Live keys are refused at startup until a human approves going live, so build it unchecked.
    live = Settings.model_construct(payments_provider="stripe", stripe_secret_key="sk_live_x")
    assert live.payments_mode == "live"
