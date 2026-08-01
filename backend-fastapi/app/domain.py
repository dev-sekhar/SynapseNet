from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum


class IncidentStatus(StrEnum):
    REPORTED = "reported"
    INVESTIGATING = "investigating"
    CONFIRMED = "confirmed"
    DISMISSED = "dismissed"
    APPEALED = "appealed"
    FINAL = "final"


class CredentialStatus(StrEnum):
    PENDING = "pending_validation"
    ACTIVE = "active"
    CHALLENGED = "challenged"
    ISSUER_UNRESPONSIVE = "issuer_unresponsive"
    SUSPENDED = "suspended"
    REVOKED = "revoked"
    INVALIDATED = "invalidated"


@dataclass(frozen=True)
class PenaltyPolicy:
    version: str
    burn_rates: tuple[Decimal, Decimal, Decimal]

    def burn_rate(self, confirmed_incidents: int) -> Decimal:
        if confirmed_incidents < 1:
            raise ValueError("A penalty requires a confirmed incident")
        return self.burn_rates[min(confirmed_incidents, len(self.burn_rates)) - 1]
