"""Add encrypted durable authentication email intents.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "auth_email_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("request_key", sa.String(64), nullable=False),
        sa.Column("payload_ciphertext", sa.Text(), nullable=True),
        sa.Column("action_id", sa.Uuid(), nullable=True),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claim_token", sa.Uuid(), nullable=True),
        sa.Column("last_error", sa.String(40), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "kind IN ('register','verify_email','reset_password')",
            name=op.f("ck_auth_email_jobs_kind"),
        ),
        sa.CheckConstraint(
            "state IN ('queued','processing','retry','sent','cancelled','expired','failed')",
            name=op.f("ck_auth_email_jobs_state"),
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND attempts <= 4", name=op.f("ck_auth_email_jobs_attempts")
        ),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_auth_email_jobs_expiry")),
        sa.CheckConstraint(
            "(state IN ('queued','processing','retry') AND payload_ciphertext IS NOT NULL) OR "
            "(state IN ('sent','cancelled','expired','failed') AND payload_ciphertext IS NULL)",
            name=op.f("ck_auth_email_jobs_payload_state"),
        ),
        sa.CheckConstraint(
            "(state = 'processing' AND claimed_until IS NOT NULL AND claim_token IS NOT NULL) OR "
            "(state <> 'processing' AND claimed_until IS NULL AND claim_token IS NULL)",
            name=op.f("ck_auth_email_jobs_lease_state"),
        ),
        sa.ForeignKeyConstraint(
            ["action_id"],
            ["auth_actions.id"],
            name=op.f("fk_auth_email_jobs_action_id_auth_actions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_email_jobs")),
    )
    op.create_index(
        "ix_auth_email_jobs_available", "auth_email_jobs", ["state", "available_at", "created_at"]
    )
    op.create_index("ix_auth_email_jobs_lease", "auth_email_jobs", ["state", "claimed_until"])
    op.create_index(
        "ix_auth_email_jobs_terminal_updated", "auth_email_jobs", ["state", "updated_at"]
    )
    op.create_index("ix_auth_email_jobs_request", "auth_email_jobs", ["request_key", "created_at"])
    op.create_index("ix_auth_email_jobs_action", "auth_email_jobs", ["action_id"])


def downgrade():
    # Disposable tests only: dropping jobs loses pending delivery intents, not users or fitness.
    op.drop_index("ix_auth_email_jobs_action", table_name="auth_email_jobs")
    op.drop_index("ix_auth_email_jobs_request", table_name="auth_email_jobs")
    op.drop_index("ix_auth_email_jobs_lease", table_name="auth_email_jobs")
    op.drop_index("ix_auth_email_jobs_terminal_updated", table_name="auth_email_jobs")
    op.drop_index("ix_auth_email_jobs_available", table_name="auth_email_jobs")
    op.drop_table("auth_email_jobs")
