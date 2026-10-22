"""Application configuration.

Single source of truth for environment-driven settings. ``app.config`` is a
package (``app/config/__init__.py`` re-exports ``config``); the former
``app/config.py`` module was a byte-for-byte duplicate and has been removed so
that there is only one definition in effect.
"""

import os
from dataclasses import dataclass, field
from typing import Optional


PLACEHOLDER_SECRETS = {
    "",
    "your-super-secret-key-change-in-production",
    "your-jwt-secret-change-in-production",
    "dev-secret-change-in-production",
    "jwt-secret-change-in-production",
    "change-me",
}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:  # fail fast on malformed configuration
        raise RuntimeError(f"Environment variable {name} must be an integer") from exc


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Config:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SUPABASE_URL: Optional[str] = os.getenv("SUPABASE_URL")
    SUPABASE_ANON_KEY: Optional[str] = os.getenv("SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    MAX_UPLOAD_SIZE_MB: int = _env_int("MAX_UPLOAD_SIZE_MB", 50)
    MAX_OUTPUT_SIZE_MB: int = _env_int("MAX_OUTPUT_SIZE_MB", 10)
    MAX_PIXELS: int = _env_int("MAX_PIXELS", 8_294_400)  # 3840 * 2160
    MAX_DIMENSION: int = _env_int("MAX_DIMENSION", 16_384)

    FREE_DAILY_OPTIMIZATIONS: int = _env_int("FREE_DAILY_OPTIMIZATIONS", 5)
    FREE_MAX_INPUT_MB: int = _env_int("FREE_MAX_INPUT_MB", 25)
    FREE_MAX_OUTPUT_MB: int = _env_int("FREE_MAX_OUTPUT_MB", 10)

    PRO_MAX_INPUT_MB: int = _env_int("PRO_MAX_INPUT_MB", 100)
    PRO_MAX_OUTPUT_MB: int = _env_int("PRO_MAX_OUTPUT_MB", 50)

    STORAGE_BUCKET: str = os.getenv("STORAGE_BUCKET", "wallpapers")
    STORAGE_TYPE: str = os.getenv("STORAGE_TYPE", "local")
    LOCAL_STORAGE_PATH: str = os.getenv("LOCAL_STORAGE_PATH", "./storage")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")

    RATE_LIMIT_PER_MINUTE: int = _env_int("RATE_LIMIT_PER_MINUTE", 30)
    RATE_LIMIT_PER_HOUR: int = _env_int("RATE_LIMIT_PER_HOUR", 100)

    URL_TIMEOUT: int = _env_int("URL_TIMEOUT", 10)
    URL_CONNECT_TIMEOUT: int = _env_int("URL_CONNECT_TIMEOUT", 5)
    URL_MAX_SIZE_MB: int = _env_int("URL_MAX_SIZE_MB", 50)
    URL_MAX_REDIRECTS: int = _env_int("URL_MAX_REDIRECTS", 5)

    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    )
    TRUST_PROXY: bool = _env_bool("TRUST_PROXY", False)

    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = field(init=False)
    TESTING: bool = _env_bool("TESTING", False)

    SUPPORTED_FORMATS: tuple = ("JPEG", "PNG", "WEBP", "AVIF")
    SUPPORTED_MIME_TYPES: tuple = (
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
    )
    # Source formats we accept. GIF/BMP/TIFF are deliberately not advertised;
    # they are rejected with a clear error instead of being silently re-labelled.
    SUPPORTED_INPUT_FORMATS: tuple = ("JPEG", "PNG", "WEBP", "AVIF")

    def __post_init__(self) -> None:
        self.DEBUG = self.ENV == "development"
        if self.MAX_OUTPUT_SIZE_MB > self.MAX_UPLOAD_SIZE_MB:
            self.MAX_OUTPUT_SIZE_MB = self.MAX_UPLOAD_SIZE_MB
        if self.MAX_PIXELS < 1 or self.MAX_DIMENSION < 1:
            raise RuntimeError("MAX_PIXELS and MAX_DIMENSION must be positive")

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() in {"production", "prod"}

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def max_output_bytes(self) -> int:
        return self.MAX_OUTPUT_SIZE_MB * 1024 * 1024

    @property
    def url_max_bytes(self) -> int:
        return self.URL_MAX_SIZE_MB * 1024 * 1024

    @property
    def cors_origins(self) -> list:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    def validate(self) -> None:
        """Fail fast on unsafe production configuration.

        Never log secret values; only report which variable is unusable.
        """
        if self.is_production:
            problems = []
            if self.SECRET_KEY.strip() in PLACEHOLDER_SECRETS or len(self.SECRET_KEY) < 32:
                problems.append("SECRET_KEY")
            if self.JWT_SECRET.strip() in PLACEHOLDER_SECRETS or len(self.JWT_SECRET) < 32:
                problems.append("JWT_SECRET")
            if "*" in self.cors_origins:
                problems.append("CORS_ORIGINS (wildcard is not allowed in production)")
            if problems:
                raise RuntimeError(
                    "Unsafe production configuration for: " + ", ".join(problems)
                )


config = Config()
