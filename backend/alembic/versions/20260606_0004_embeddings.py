"""Add embeddings table for RAG support

Revision ID: 20260606_0004
Revises: 20260606_0003
Create Date: 2026-06-06 19:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260606_0004'
down_revision = '20260606_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'embeddings',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('source_id', sa.String(255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('vector', sa.JSON(), nullable=False),
        sa.Column('meta', sa.JSON(), nullable=False, server_default='{}'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_user_embeddings', 'embeddings', ['user_id'])
    op.create_index('idx_user_source', 'embeddings', ['user_id', 'source_type', 'source_id'])


def downgrade() -> None:
    op.drop_index('idx_user_source', table_name='embeddings')
    op.drop_index('idx_user_embeddings', table_name='embeddings')
    op.drop_table('embeddings')

