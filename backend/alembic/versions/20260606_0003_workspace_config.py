"""workspace config

Revision ID: 20260606_0003
Revises: 20260606_0002
Create Date: 2026-06-06
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa

from alembic import op

revision = "20260606_0003"
down_revision = "20260606_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_configs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "name",
            sa.String(length=120),
            nullable=False,
            server_default="Chikaima Workspace",
        ),
        sa.Column(
            "public_registration_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO workspace_configs (id, name, public_registration_enabled, created_at, updated_at)
            VALUES (:id, :name, :enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
        ).bindparams(
            id=str(uuid.uuid4()),
            name="Chikaima Workspace",
            enabled=True,
        )
    )


def downgrade() -> None:
    op.drop_table("workspace_configs")
