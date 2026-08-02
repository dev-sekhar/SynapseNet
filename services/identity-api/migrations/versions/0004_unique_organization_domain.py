"""require unique organization Fabric domains

Revision ID: 0004
Revises: 0003
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("organization_applications") as batch:
        batch.create_unique_constraint(
            "uq_organization_applications_requested_domain", ["requested_domain"]
        )


def downgrade():
    with op.batch_alter_table("organization_applications") as batch:
        batch.drop_constraint(
            "uq_organization_applications_requested_domain", type_="unique"
        )
