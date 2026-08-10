from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


@lru_cache
def _get_engine() -> Engine:
    return create_engine(settings.database_url, pool_pre_ping=True)


@lru_cache
def _get_session_factory():
    return sessionmaker(bind=_get_engine(), autoflush=False, autocommit=False, class_=Session)


def SessionLocal() -> Session:
    return _get_session_factory()()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
