from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

ENCRYPTED_VALUE_PREFIX = "fernet:"


class SecretManager:
    """Symmetric secret manager for provider configs.

    The Fernet key is deterministically derived from ``PROVIDER_SECRET_KEY`` so
    encrypted values remain portable across application restarts for a given
    deployment.
    """

    def __init__(self, secret_key: str) -> None:
        derived_key = hashlib.sha256(secret_key.encode("utf-8")).digest()
        self._fernet = Fernet(base64.urlsafe_b64encode(derived_key))

    def encrypt(self, value: str) -> str:
        encrypted = self._fernet.encrypt(value.encode("utf-8")).decode("utf-8")
        return f"{ENCRYPTED_VALUE_PREFIX}{encrypted}"

    def decrypt(self, value: str) -> str:
        if value.startswith(ENCRYPTED_VALUE_PREFIX):
            token = value.removeprefix(ENCRYPTED_VALUE_PREFIX)
            return self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")

        # Backward compatibility for older local installs that stored base64.
        try:
            return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            return base64.b64decode(value.encode("utf-8")).decode("utf-8")


secret_manager = SecretManager(settings.provider_secret_key)
