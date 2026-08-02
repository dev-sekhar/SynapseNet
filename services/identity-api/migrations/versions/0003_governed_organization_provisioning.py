"""governed organization provisioning

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("organization_applications") as batch:
        batch.add_column(sa.Column("requested_domain", sa.String(253), nullable=True))
        batch.add_column(sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("decision_reason", sa.String(2000), nullable=True))
        batch.add_column(sa.Column("governance_reference", sa.String(128), nullable=True))
        batch.add_column(sa.Column("join_trust_channel", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("provisioning_manifest", sa.Text(), nullable=True))
    op.execute(
        "UPDATE organization_applications SET requested_domain = "
        "lower(replace(requested_msp_id, 'MSP', '')) || '.synapsenet.invalid' "
        "WHERE requested_domain IS NULL"
    )
    with op.batch_alter_table("organization_applications") as batch:
        batch.alter_column("requested_domain", nullable=False)


def downgrade():
    with op.batch_alter_table("organization_applications") as batch:
        batch.drop_column("provisioning_manifest")
        batch.drop_column("join_trust_channel")
        batch.drop_column("governance_reference")
        batch.drop_column("decision_reason")
        batch.drop_column("decided_at")
        batch.drop_column("requested_domain")
