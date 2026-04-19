from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderChoice = Literal["openai", "anthropic", "deepseek"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="BW_")

    @field_validator("llm_provider", "llm_api_key", "llm_model", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        return None if isinstance(v, str) and v.strip() == "" else v

    @field_validator("llm_api_key", mode="before")
    @classmethod
    def _placeholder_key_to_none(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        key = v.strip()
        lower = key.lower()
        if lower in {"replace-me", "your-api-key", "change-me"}:
            return None
        if lower.startswith("replace-") or lower.startswith("your-"):
            return None
        return key

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/bloodwork"
    upload_dir: str = "./uploads"
    bloodwork_data_dir: str = "../blood_work_data"
    cors_origins: list[str] = ["http://localhost:5173"]

    # The system always uses the LLM parser; pick provider + key below.
    llm_provider: ProviderChoice | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_seconds: float = 60.0

    # Default window for /analysis/attention and /analysis/ask.
    attention_window: int = 5

    session_secret: str = "change-me-in-production"
    session_cookie_name: str = "bw_session"
    session_ttl_hours: int = 24 * 14
    session_secure_cookie: bool = False

    # Bootstrap admin account created automatically on startup if missing.
    bootstrap_admin_login: str = "kuweg_admin"
    bootstrap_admin_password: str = "kuweg_admin"


settings = Settings()
