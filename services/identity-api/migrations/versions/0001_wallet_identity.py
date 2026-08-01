"""wallet identity and encrypted metadata

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "wallet_identities",
        sa.Column("address", sa.String(42), primary_key=True),
        sa.Column("actor_id", sa.String(128), unique=True),
        sa.Column("fabric_msp_id", sa.String(128)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_verified_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "wallet_challenges",
        sa.Column("nonce_hash", sa.String(64), primary_key=True),
        sa.Column("address", sa.String(42), nullable=False),
        sa.Column("message", sa.String(2048), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_wallet_challenges_address", "wallet_challenges", ["address"])
    op.create_table(
        "encrypted_metadata",
        sa.Column("metadata_id", sa.String(128), primary_key=True),
        sa.Column("owner_address", sa.String(42), nullable=False),
        sa.Column("ledger_hash", sa.String(71), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(), nullable=False),
        sa.Column("schema_version", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_encrypted_metadata_owner_address", "encrypted_metadata", ["owner_address"])
    op.create_index("ix_encrypted_metadata_ledger_hash", "encrypted_metadata", ["ledger_hash"])


def downgrade():
    op.drop_table("encrypted_metadata")
    op.drop_table("wallet_challenges")
    op.drop_table("wallet_identities")
