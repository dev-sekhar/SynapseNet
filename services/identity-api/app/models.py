from datetime import datetime

from sqlalchemy import DateTime, LargeBinary, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class WalletIdentity(Base):
    __tablename__ = "wallet_identities"

    address: Mapped[str] = mapped_column(String(42), primary_key=True)
    actor_id: Mapped[str | None] = mapped_column(String(128), unique=True)
    fabric_msp_id: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WalletChallenge(Base):
    __tablename__ = "wallet_challenges"

    nonce_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    address: Mapped[str] = mapped_column(String(42), index=True)
    message: Mapped[str] = mapped_column(String(2048))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EncryptedMetadata(Base):
    __tablename__ = "encrypted_metadata"

    metadata_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    owner_address: Mapped[str] = mapped_column(String(42), index=True)
    ledger_hash: Mapped[str] = mapped_column(String(71), index=True)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    nonce: Mapped[bytes] = mapped_column(LargeBinary)
    schema_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrganizationApplication(Base):
    __tablename__ = "organization_applications"

    application_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    legal_name: Mapped[str] = mapped_column(String(240))
    display_name: Mapped[str] = mapped_column(String(160))
    jurisdiction: Mapped[str] = mapped_column(String(120))
    registration_number: Mapped[str] = mapped_column(String(160))
    requested_msp_id: Mapped[str] = mapped_column(String(128), unique=True)
    applicant_wallet: Mapped[str] = mapped_column(String(42), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending_governance")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
