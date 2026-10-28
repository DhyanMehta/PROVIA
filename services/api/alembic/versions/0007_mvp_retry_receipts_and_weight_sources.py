"""Add durable mobile retry receipts and weight source identity.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "request_receipts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("operation", sa.String(40), nullable=False),
        sa.Column("key", sa.Uuid(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_request_receipts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "operation", "key", name=op.f("pk_request_receipts")),
    )
    op.add_column(
        "weight_logs", sa.Column("source", sa.String(50), server_default="manual", nullable=False)
    )
    op.add_column("weight_logs", sa.Column("external_id", sa.String(200), nullable=True))
    op.create_check_constraint(
        op.f("ck_weight_logs_source"), "weight_logs", "source IN ('manual','health_connect')"
    )
    op.create_check_constraint(
        op.f("ck_weight_logs_source_identity"),
        "weight_logs",
        "(source = 'manual' AND external_id IS NULL) OR "
        "(source = 'health_connect' AND external_id IS NOT NULL)",
    )
    op.create_unique_constraint(
        op.f("uq_weight_logs_user_id"), "weight_logs", ["user_id", "source", "external_id"]
    )


def downgrade():
    # Disposable tests only: this removes retry/provenance metadata, never weight rows.
    op.drop_constraint(op.f("uq_weight_logs_user_id"), "weight_logs", type_="unique")
    op.drop_constraint(op.f("ck_weight_logs_source_identity"), "weight_logs", type_="check")
    op.drop_constraint(op.f("ck_weight_logs_source"), "weight_logs", type_="check")
    op.drop_column("weight_logs", "external_id")
    op.drop_column("weight_logs", "source")
    op.drop_table("request_receipts")
