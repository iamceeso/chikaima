"""workspace vision aware toggle

Revision ID: 20260611_0007
Revises: 20260607_0006
Create Date: 2026-06-11
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260611_0007"
down_revision = "20260607_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_configs",
        sa.Column(
            "vision_aware",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspace_configs", "vision_aware")
