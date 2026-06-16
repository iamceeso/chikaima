import json
from functools import lru_cache

from pydantic import Field, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_JWT_SECRET = "change-me"
PLACEHOLDER_JWT_REFRESH_SECRET = "change-me-too"
PLACEHOLDER_PROVIDER_SECRET = "replace-with-32-char-secret"


class Settings(BaseSettings):
    app_name: str = "Olanma API"
    app_env: str = "development"
    app_debug: bool = True
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://olanma:olanma@localhost:5432/olanma"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = Field(..., min_length=16)
    jwt_refresh_secret_key: str = Field(..., min_length=16)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    provider_secret_key: str = Field(..., min_length=16)
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    media_root: str = "storage"
    document_upload_max_megabytes: int = 100
    audio_upload_max_megabytes: int = 512
    video_upload_max_megabytes: int = 2048
    embedding_dimension: int = 384
    rag_top_k: int = 3
    ollama_base_url: str = "http://localhost:11434"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
        enable_decoding=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value

        if not isinstance(value, str):
            return ["http://localhost:3000"]

        value = value.strip()
        if not value:
            return []

        if value.startswith("["):
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]

        return [item.strip() for item in value.split(",") if item.strip()]

    @computed_field
    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @computed_field
    @property
    def document_upload_max_bytes(self) -> int:
        return self.document_upload_max_megabytes * 1024 * 1024

    @computed_field
    @property
    def audio_upload_max_bytes(self) -> int:
        return self.audio_upload_max_megabytes * 1024 * 1024

    @computed_field
    @property
    def video_upload_max_bytes(self) -> int:
        return self.video_upload_max_megabytes * 1024 * 1024

    @model_validator(mode="after")
    def validate_secrets_for_environment(self) -> "Settings":
        placeholder_values = {
            "jwt_secret_key": PLACEHOLDER_JWT_SECRET,
            "jwt_refresh_secret_key": PLACEHOLDER_JWT_REFRESH_SECRET,
            "provider_secret_key": PLACEHOLDER_PROVIDER_SECRET,
        }
        insecure_fields = [field_name for field_name, placeholder in placeholder_values.items() if getattr(self, field_name) == placeholder]

        if self.is_production and insecure_fields:
            raise ValueError("Production settings require real secret values for: " + ", ".join(sorted(insecure_fields)))

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
