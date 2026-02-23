"""Worker configuration — validated from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    temporal_address:   str = "temporal:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "iama-main-queue"
    database_url:       str = "postgres://iama:iama_secret@pgbouncer:5432/iama_db"
    litellm_api_base:   str = "http://localhost:4000"
    log_level:          str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
