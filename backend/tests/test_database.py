import importlib
import unittest
from unittest.mock import Mock, patch


class DatabaseTests(unittest.TestCase):
    def test_database_module_does_not_create_engine_on_import(self) -> None:
        with (
            patch("sqlalchemy.create_engine") as create_engine,
            patch("sqlalchemy.orm.sessionmaker") as sessionmaker,
        ):
            database = importlib.import_module("app.core.database")
            database = importlib.reload(database)

        create_engine.assert_not_called()
        sessionmaker.assert_not_called()

    def test_session_local_creates_engine_and_session_lazily(self) -> None:
        session_factory = Mock(return_value="db-session")

        with (
            patch("sqlalchemy.create_engine", return_value="engine") as create_engine,
            patch("sqlalchemy.orm.sessionmaker", return_value=session_factory) as sessionmaker,
        ):
            database = importlib.import_module("app.core.database")
            database = importlib.reload(database)

            session = database.SessionLocal()

        self.assertEqual(session, "db-session")
        create_engine.assert_called_once()
        sessionmaker.assert_called_once_with(
            bind="engine",
            autoflush=False,
            autocommit=False,
            class_=database.Session,
        )
        session_factory.assert_called_once_with()
