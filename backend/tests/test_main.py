import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app import main


class MainTests(unittest.TestCase):
    def test_ensure_vector_extension_commits_when_extension_setup_succeeds(self) -> None:
        db = MagicMock()

        with patch("app.main.SessionLocal", return_value=db):
            main._ensure_vector_extension()

        db.execute.assert_called_once()
        db.commit.assert_called_once()
        db.rollback.assert_not_called()
        db.close.assert_called_once()

    def test_ensure_vector_extension_rolls_back_when_extension_setup_fails(self) -> None:
        db = MagicMock()
        db.execute.side_effect = RuntimeError("boom")

        with patch("app.main.SessionLocal", return_value=db), patch("app.main.logger") as logger:
            main._ensure_vector_extension()

        db.rollback.assert_called_once()
        logger.warning.assert_called_once()
        db.close.assert_called_once()

    def test_docs_enabled_reads_workspace_flag_and_closes_session(self) -> None:
        db = MagicMock()

        with (
            patch("app.main.SessionLocal", return_value=db),
            patch("app.main.WorkspaceService") as workspace_service,
        ):
            workspace_service.return_value.get_or_create.return_value = SimpleNamespace(docs_enabled=True)
            enabled = main._docs_enabled()

        self.assertTrue(enabled)
        db.close.assert_called_once()

    def test_raise_docs_disabled_raises_404(self) -> None:
        with self.assertRaises(HTTPException) as context:
            main._raise_docs_disabled()

        self.assertEqual(context.exception.status_code, 404)

    def test_swagger_ui_raises_when_docs_disabled(self) -> None:
        with patch("app.main._docs_enabled", return_value=False):
            with self.assertRaises(HTTPException) as context:
                main.swagger_ui()

        self.assertEqual(context.exception.status_code, 404)

    def test_swagger_ui_returns_generated_docs_when_enabled(self) -> None:
        response = SimpleNamespace(body=b"swagger")

        with (
            patch("app.main._docs_enabled", return_value=True),
            patch("app.main.get_swagger_ui_html", return_value=response) as docs_builder,
        ):
            result = main.swagger_ui()

        self.assertIs(result, response)
        docs_builder.assert_called_once()

    def test_redoc_ui_returns_generated_docs_when_enabled(self) -> None:
        response = SimpleNamespace(body=b"redoc")

        with (
            patch("app.main._docs_enabled", return_value=True),
            patch("app.main.get_redoc_html", return_value=response) as docs_builder,
        ):
            result = main.redoc_ui()

        self.assertIs(result, response)
        docs_builder.assert_called_once()

    def test_redoc_ui_raises_when_docs_disabled(self) -> None:
        with patch("app.main._docs_enabled", return_value=False):
            with self.assertRaises(HTTPException) as context:
                main.redoc_ui()

        self.assertEqual(context.exception.status_code, 404)

    def test_openapi_schema_returns_json_response_when_enabled(self) -> None:
        with (
            patch("app.main._docs_enabled", return_value=True),
            patch("app.main.get_openapi", return_value={"openapi": "3.1.0"}) as openapi_builder,
        ):
            response = main.openapi_schema()

        self.assertEqual(response.status_code, 200)
        self.assertIn(b'"openapi":"3.1.0"', response.body)
        openapi_builder.assert_called_once()

    def test_openapi_schema_raises_when_docs_disabled(self) -> None:
        with patch("app.main._docs_enabled", return_value=False):
            with self.assertRaises(HTTPException) as context:
                main.openapi_schema()

        self.assertEqual(context.exception.status_code, 404)

    def test_health_returns_ok_status(self) -> None:
        self.assertEqual(main.health(), {"status": "ok"})

    def test_startup_checks_bootstraps_dependencies(self) -> None:
        with (
            patch("app.main._ensure_vector_extension") as ensure_vector,
            patch("app.main.bootstrap_transcription_runtime") as bootstrap_runtime,
        ):
            main.startup_checks()

        ensure_vector.assert_called_once()
        bootstrap_runtime.assert_called_once()
