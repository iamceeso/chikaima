"""Add asset chunks table for shared knowledge retrieval

Revision ID: 20260607_0006
Revises: 20260607_0005
Create Date: 2026-06-07 18:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision = "20260607_0006"
down_revision = "20260607_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "asset_chunks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("asset_type", sa.String(length=50), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(dim=384), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asset_chunks_user_id", "asset_chunks", ["user_id"])
    op.create_index("ix_asset_chunks_source_type", "asset_chunks", ["source_type"])
    op.create_index("ix_asset_chunks_source_id", "asset_chunks", ["source_id"])
    op.create_index("ix_asset_chunks_asset_type", "asset_chunks", ["asset_type"])
    op.create_index(
        "idx_asset_chunk_source_order",
        "asset_chunks",
        ["user_id", "source_type", "source_id", "chunk_index"],
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_asset_chunks_embedding ON asset_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_asset_chunks_embedding")
    op.drop_index("idx_asset_chunk_source_order", table_name="asset_chunks")
    op.drop_index("ix_asset_chunks_asset_type", table_name="asset_chunks")
    op.drop_index("ix_asset_chunks_source_id", table_name="asset_chunks")
    op.drop_index("ix_asset_chunks_source_type", table_name="asset_chunks")
    op.drop_index("ix_asset_chunks_user_id", table_name="asset_chunks")
    op.drop_table("asset_chunks")
