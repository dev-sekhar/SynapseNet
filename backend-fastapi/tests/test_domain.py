from decimal import Decimal

import pytest

from app.domain import PenaltyPolicy


def test_progressive_burn_rate_caps_at_third_incident():
    policy = PenaltyPolicy("2026-01", (Decimal(".10"), Decimal(".25"), Decimal("1")))
    assert policy.burn_rate(1) == Decimal(".10")
    assert policy.burn_rate(2) == Decimal(".25")
    assert policy.burn_rate(3) == Decimal("1")
    assert policy.burn_rate(8) == Decimal("1")


def test_penalty_requires_confirmed_incident():
    policy = PenaltyPolicy("2026-01", (Decimal(".10"), Decimal(".25"), Decimal("1")))
    with pytest.raises(ValueError):
        policy.burn_rate(0)
