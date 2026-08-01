"""organization applications

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "organization_applications",
        sa.Column("application_id", sa.String(128), primary_key=True),
        sa.Column("legal_name", sa.String(240), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("jurisdiction", sa.String(120), nullable=False),
        sa.Column("registration_number", sa.String(160), nullable=False),
        sa.Column("requested_msp_id", sa.String(128), nullable=False, unique=True),
        sa.Column("applicant_wallet", sa.String(42), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_organization_applications_applicant_wallet",
        "organization_applications",
        ["applicant_wallet"],
    )


def downgrade():
    op.drop_table("organization_applications")
