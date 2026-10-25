from functools import lru_cache

from app.core.config import get_settings
from app.providers.payments.base import PaymentGateway


@lru_cache
def get_gateway() -> PaymentGateway:
    settings = get_settings()
    if settings.payments_provider == "stripe":
        from app.providers.payments.stripe_gateway import StripeGateway

        return StripeGateway(settings)
    from app.providers.payments.fake_gateway import FakeGateway

    return FakeGateway(settings)
