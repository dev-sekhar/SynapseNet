"""private evidence metadata ownership and key versioning

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("encrypted_metadata") as batch:
        batch.add_column(sa.Column("owner_actor_id", sa.String(128), nullable=True))
        batch.add_column(sa.Column("issuer_enterprise_id", sa.String(128), nullable=True))
        batch.add_column(sa.Column("evidence_id", sa.String(128), nullable=True))
        batch.add_column(sa.Column("key_version", sa.String(32), nullable=False, server_default="v1"))
        batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_index("ix_encrypted_metadata_owner_actor_id", ["owner_actor_id"])
        batch.create_index("ix_encrypted_metadata_issuer_enterprise_id", ["issuer_enterprise_id"])
        batch.create_unique_constraint("uq_encrypted_metadata_evidence_id", ["evidence_id"])


def downgrade():
    with op.batch_alter_table("encrypted_metadata") as batch:
        batch.drop_constraint("uq_encrypted_metadata_evidence_id", type_="unique")
        batch.drop_index("ix_encrypted_metadata_issuer_enterprise_id")
        batch.drop_index("ix_encrypted_metadata_owner_actor_id")
        batch.drop_column("deleted_at")
        batch.drop_column("key_version")
        batch.drop_column("evidence_id")
        batch.drop_column("issuer_enterprise_id")
        batch.drop_column("owner_actor_id")
