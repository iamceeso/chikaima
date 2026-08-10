import unittest

from app.api.v1.endpoints.settings import router


class SettingsEndpointTests(unittest.TestCase):
    def test_patch_models_route_depends_on_admin_access(self) -> None:
        patch_models_route = next(
            route for route in router.routes if route.path == "/models" and "PATCH" in route.methods
        )
        dependency_names = {dependency.call.__name__ for dependency in patch_models_route.dependant.dependencies}

        self.assertIn("get_current_admin_user", dependency_names)
