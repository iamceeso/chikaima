"""workspace access controls

Revision ID: 20260607_0005
Revises: 20260606_0004
Create Date: 2026-06-07
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260607_0005"
down_revision = "20260606_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_configs",
        sa.Column(
            "authentication_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "workspace_configs",
        sa.Column("docs_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("workspace_configs", "docs_enabled")
    op.drop_column("workspace_configs", "authentication_enabled")
