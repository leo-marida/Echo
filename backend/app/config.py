from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

# pydantic-settings parses .env into our own Settings object but never writes to
# os.environ — which is what the LangSmith tracer (and any other env-var-reading
# library) actually checks. Loading here, not just in main.py, means any entry
# point that imports app.config (scripts, tests, the API) gets this for free.
load_dotenv()


class Settings(BaseSettings):
    OPENAI_API_KEY: str
    OPENAI_REALTIME_MODEL: str = "gpt-realtime-whisper"
    OPENAI_FAST_MODEL: str = "gpt-4.1-mini"
    OPENAI_SMART_MODEL: str = "gpt-4o"

    DATABASE_URL: str

    REDIS_URL: str = "redis://localhost:6379"

    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "echo"
    LANGCHAIN_TRACING_V2: bool = False

    API_SECRET_KEY: str
    CORS_ORIGINS: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"

    AUDIO_SAMPLE_RATE: int = 24000
    AUDIO_CHUNK_DURATION_MS: int = 100

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
