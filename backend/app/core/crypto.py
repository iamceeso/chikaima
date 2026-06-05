from __future__ import annotations

import base64


class SecretManager:
    """Placeholder encryptor for provider configs.

    Replace this with a real KMS, Vault, or Fernet-backed implementation in production.
    """

    def encrypt(self, value: str) -> str:
        return base64.b64encode(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str) -> str:
        return base64.b64decode(value.encode("utf-8")).decode("utf-8")


secret_manager = SecretManager()
