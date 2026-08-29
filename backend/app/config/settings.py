import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://localhost/wallpaper10")
    SUPABASE_URL: Optional[str] = os.getenv("SUPABASE_URL")
    SUPABASE_ANON_KEY: Optional[str] = os.getenv("SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    MAX_OUTPUT_SIZE_MB: int = int(os.getenv("MAX_OUTPUT_SIZE_MB", "10"))
    MAX_PIXELS: int = int(os.getenv("MAX_PIXELS", "8294400"))  # 4K = 3840*2160
    
    FREE_DAILY_OPTIMIZATIONS: int = int(os.getenv("FREE_DAILY_OPTIMIZATIONS", "5"))
    FREE_MAX_INPUT_MB: int = int(os.getenv("FREE_MAX_INPUT_MB", "25"))
    FREE_MAX_OUTPUT_MB: int = int(os.getenv("FREE_MAX_OUTPUT_MB", "10"))
    
    PRO_MAX_INPUT_MB: int = int(os.getenv("PRO_MAX_INPUT_MB", "100"))
    PRO_MAX_OUTPUT_MB: int = int(os.getenv("PRO_MAX_OUTPUT_MB", "50"))
    
    STORAGE_BUCKET: str = os.getenv("STORAGE_BUCKET", "wallpapers")
    STORAGE_TYPE: str = os.getenv("STORAGE_TYPE", "local")  # local, supabase, s3
    LOCAL_STORAGE_PATH: str = os.getenv("LOCAL_STORAGE_PATH", "./storage")
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "jwt-secret-change-in-production")
    
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "30"))
    RATE_LIMIT_PER_HOUR: int = int(os.getenv("RATE_LIMIT_PER_HOUR", "100"))
    
    URL_TIMEOUT: int = int(os.getenv("URL_TIMEOUT", "10"))
    URL_MAX_SIZE_MB: int = int(os.getenv("URL_MAX_SIZE_MB", "50"))
    URL_MAX_REDIRECTS: int = int(os.getenv("URL_MAX_REDIRECTS", "5"))
    
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
    
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = ENV == "development"
    
    SUPPORTED_FORMATS: tuple = ("JPEG", "PNG", "WEBP", "AVIF")
    SUPPORTED_MIME_TYPES: tuple = (
        "image/jpeg", "image/png", "image/webp", "image/avif"
    )
    
    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    
    @property
    def url_max_bytes(self) -> int:
        return self.URL_MAX_SIZE_MB * 1024 * 1024


config = Config()