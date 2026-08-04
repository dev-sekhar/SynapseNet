"""company follow graph

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "company_profiles",
        sa.Column("enterprise_id", sa.String(128), primary_key=True),
        sa.Column("logo_url", sa.String(2048), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "company_follows",
        sa.Column("follower_actor_id", sa.String(128), primary_key=True),
        sa.Column("enterprise_id", sa.String(128), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_company_follows_enterprise_id", "company_follows", ["enterprise_id"])


def downgrade():
    op.drop_index("ix_company_follows_enterprise_id", table_name="company_follows")
    op.drop_table("company_follows")
    op.drop_table("company_profiles")
