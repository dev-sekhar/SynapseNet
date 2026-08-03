from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SYNAPSENET_", env_file=".env")

    database_url: str = "sqlite+aiosqlite:///./data/synapsenet.db"
    ledger_gateway_url: str = "http://127.0.0.1:3001"
    fabric_adapter_url: str = "http://127.0.0.1:3010"
    fabric_adapter_token: str
    session_secret: str
    encryption_key: str
    wallet_challenge_ttl_seconds: int = 300
    cookie_secure: bool = False
    docs_dir: str | None = None
    public_app_url: str = "http://localhost:3001"
    penalty_executor_token: str = "local-penalty-executor-change-me"
    governance_token: str = "local-governance-change-me"
    credential_channel_name: str = "credentials"
    trust_channel_name: str = "trust-governance"
    require_wallet_for_credentials: bool = False
    operations_token: str = "local-operations-change-me"
    allow_legacy_business_sessions: bool = True


@lru_cache
def settings() -> Settings:
    return Settings()
