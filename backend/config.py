import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Canvello Architecture Explorer"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Security & Sessions
    CANVELLO_ENCRYPTION_KEY: str = os.getenv("CANVELLO_ENCRYPTION_KEY", "canvello-32-byte-default-test-key!!")
    SESSION_COOKIE_NAME: str = "canvello_session"
    SESSION_MAX_AGE_SECONDS: int = 86400  # 24 hours
    CSRF_COOKIE_NAME: str = "canvello_csrf"

    # GitHub App Integration
    GITHUB_APP_ID: str = os.getenv("GITHUB_APP_ID", "123456")
    GITHUB_APP_CLIENT_ID: str = os.getenv("GITHUB_APP_CLIENT_ID", "client_123456")
    GITHUB_APP_CLIENT_SECRET: str = os.getenv("GITHUB_APP_CLIENT_SECRET", "secret_123456")
    GITHUB_APP_PRIVATE_KEY: str = os.getenv("GITHUB_APP_PRIVATE_KEY", "")
    GITHUB_APP_CALLBACK_URL: str = os.getenv("GITHUB_APP_CALLBACK_URL", "http://localhost:3000/api/v1/auth/github/callback")
    GITHUB_APP_SETUP_URL: str = os.getenv("GITHUB_APP_SETUP_URL", "http://localhost:3000/api/v1/auth/github/setup")

    # Storage & Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./canvello_dev.db")

    # Ingestion & Analysis Budgets
    MAX_INGESTION_FILES: int = 2500
    MAX_INGESTION_BYTES: int = 50 * 1024 * 1024  # 50 MB
    MAX_INGESTION_TIME_SECONDS: int = 45
    MAX_JOB_EXECUTION_SECONDS: int = 90
    CLIENT_POLLING_TIMEOUT_SECONDS: int = 120

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
