"""Shared dataclasses and enums used by routes and services."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID
import enum

from app.config import config

MIME_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "AVIF": "image/avif",
}

FILE_EXTENSIONS = {
    "JPEG": "jpg",
    "PNG": "png",
    "WEBP": "webp",
    "AVIF": "avif",
}


class PlanType(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ADMIN = "admin"


class ImageFormat(str, enum.Enum):
    JPEG = "JPEG"
    PNG = "PNG"
    WEBP = "WEBP"
    AVIF = "AVIF"

    @property
    def mime_type(self) -> str:
        return MIME_TYPES[self.value]

    @property
    def extension(self) -> str:
        return FILE_EXTENSIONS[self.value]


@dataclass
class User:
    id: UUID
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    plan: PlanType = PlanType.FREE
    is_active: bool = True
    daily_optimizations: int = 0
    last_optimization_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @property
    def is_pro(self) -> bool:
        return self.plan in (PlanType.PRO, PlanType.ADMIN)

    @property
    def is_admin(self) -> bool:
        return self.plan == PlanType.ADMIN

    @property
    def is_anonymous(self) -> bool:
        # Anonymous identities are never persisted; see services.auth.
        return self.email.endswith("@anonymous.local")


@dataclass
class Wallpaper:
    id: UUID
    title: str
    slug: str
    description: Optional[str]
    category: str
    image_url: str
    thumbnail_url: str
    width: int
    height: int
    format: ImageFormat
    file_size: int
    downloads: int = 0
    is_published: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @property
    def aspect_ratio(self) -> str:
        from math import gcd
        g = gcd(self.width, self.height)
        return f"{self.width // g}:{self.height // g}"

    @property
    def resolution_label(self) -> str:
        if self.width >= 7680:
            return "8K"
        if self.width >= 3840:
            return "4K"
        if self.width >= 2560:
            return "2K"
        if self.width >= 1920:
            return "1080p"
        return f"{self.width}x{self.height}"


@dataclass
class Optimization:
    id: UUID
    user_id: Optional[UUID]
    original_filename: str
    original_size: int
    original_width: int
    original_height: int
    original_format: ImageFormat
    output_size: int
    output_width: int
    output_height: int
    output_format: ImageFormat
    target_size: int
    quality_used: Optional[int] = None
    processing_time_ms: Optional[int] = None
    created_at: Optional[datetime] = None

    @property
    def compression_ratio(self) -> float:
        if self.original_size == 0:
            return 0.0
        return (self.original_size - self.output_size) / self.original_size * 100

    @property
    def saved_bytes(self) -> int:
        return self.original_size - self.output_size


@dataclass
class OptimizationRequest:
    target_size: int
    output_format: Optional[ImageFormat] = None
    target_width: Optional[int] = None
    target_height: Optional[int] = None
    quality: Optional[int] = None


@dataclass
class OptimizationResult:
    success: bool
    data: Optional[bytes] = None
    output_size: int = 0
    output_width: int = 0
    output_height: int = 0
    output_format: Optional[ImageFormat] = None
    quality_used: Optional[int] = None
    processing_time_ms: int = 0
    target_met: bool = False
    message: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None


@dataclass
class ImageAnalysis:
    filename: str
    format: ImageFormat
    size: int
    width: int
    height: int
    aspect_ratio: str
    megapixels: float
    has_transparency: bool
    mode: str
    estimated_optimization: dict


@dataclass
class PlanLimits:
    max_input_mb: int
    max_output_mb: int
    daily_optimizations: int
    priority_processing: bool = False
    batch_processing: bool = False
    no_ads: bool = False
    history_retention_days: int = 30


# Plan limits are configuration, not code: operators tune them through the
# documented FREE_* / PRO_* environment variables. The defaults here and in
# app.config.settings are the same, so behaviour is unchanged out of the box.
FREE_LIMITS = PlanLimits(
    max_input_mb=config.FREE_MAX_INPUT_MB,
    max_output_mb=config.FREE_MAX_OUTPUT_MB,
    daily_optimizations=config.FREE_DAILY_OPTIMIZATIONS,
    history_retention_days=7,
)

PRO_LIMITS = PlanLimits(
    max_input_mb=config.PRO_MAX_INPUT_MB,
    max_output_mb=config.PRO_MAX_OUTPUT_MB,
    daily_optimizations=-1,
    priority_processing=True,
    batch_processing=True,
    no_ads=True,
    history_retention_days=365,
)

ADMIN_LIMITS = PlanLimits(
    max_input_mb=500,
    max_output_mb=200,
    daily_optimizations=-1,
    priority_processing=True,
    batch_processing=True,
    no_ads=True,
    history_retention_days=-1,
)

PLAN_LIMITS = {
    PlanType.FREE: FREE_LIMITS,
    PlanType.PRO: PRO_LIMITS,
    PlanType.ADMIN: ADMIN_LIMITS,
}


def get_plan_limits(plan: PlanType) -> PlanLimits:
    return PLAN_LIMITS.get(plan, FREE_LIMITS)
