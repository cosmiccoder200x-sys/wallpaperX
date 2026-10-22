"""Image analysis and compression pipeline.

Design rules (see instructions.md):
* the target size is a maximum - we always measure real encoded bytes;
* transparency is preserved for PNG/WebP/AVIF and flattened to white for JPEG;
* width/height are bounds, never a stretch, and images are never upscaled;
* the output is re-decoded and verified before it is returned;
* a format is never silently substituted (no AVIF -> WebP fallback).
"""

import io
import logging
import os
import time
import warnings
from math import gcd
from typing import BinaryIO, Optional, Tuple

from PIL import Image, ImageFile, ImageOps, UnidentifiedImageError, features

from app.config import config
from app.models import (
    ImageAnalysis,
    ImageFormat,
    OptimizationRequest,
    OptimizationResult,
    PlanLimits,
)

logger = logging.getLogger(__name__)

# Truncated files must fail loudly instead of being silently "repaired".
ImageFile.LOAD_TRUNCATED_IMAGES = False
# Treat Pillow's decompression-bomb warning as an error and align its threshold
# with the application limit; the pixel check below is the primary guard.
Image.MAX_IMAGE_PIXELS = config.MAX_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)

MAX_PIXELS = config.MAX_PIXELS
MAX_DIMENSION = config.MAX_DIMENSION
SUPPORTED_FORMATS = config.SUPPORTED_INPUT_FORMATS

_MAGIC_CHECKS = (
    (b"\xff\xd8\xff", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "PNG"),
    (b"RIFF", "WEBP"),  # refined below
)


class OptimizationError(Exception):
    """A user-safe processing error with an HTTP status mapping."""

    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def mime_type_for(fmt: ImageFormat) -> str:
    return fmt.mime_type


def format_bytes(bytes_val: float) -> str:
    value = float(bytes_val)
    for unit in ["B", "KB", "MB", "GB"]:
        if value < 1024:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


def format_dimensions(width: int, height: int) -> str:
    return f"{width} × {height}"


def _sniff_format(header: bytes) -> Optional[str]:
    if header.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "WEBP"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand in (b"avif", b"avis"):
            return "AVIF"
    return None


def _stream_size(stream: BinaryIO) -> int:
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    return size


def _open_image(stream: BinaryIO) -> Image.Image:
    """Open a stream, returning an image with EXIF orientation applied."""
    stream.seek(0)
    try:
        img = Image.open(stream)
        img.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise OptimizationError(
            "RESOLUTION_TOO_HIGH",
            f"Image exceeds the maximum supported resolution ({MAX_PIXELS:,} pixels)",
            422,
        ) from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise OptimizationError(
            "CORRUPTED_IMAGE",
            "The file is not a valid or complete image",
            400,
        ) from exc

    if img.width * img.height > MAX_PIXELS:
        raise OptimizationError(
            "RESOLUTION_TOO_HIGH",
            f"Image exceeds the maximum supported resolution ({MAX_PIXELS:,} pixels)",
            422,
        )
    if max(img.width, img.height) > MAX_DIMENSION:
        raise OptimizationError(
            "RESOLUTION_TOO_HIGH",
            f"Image exceeds the maximum supported dimension ({MAX_DIMENSION} px)",
            422,
        )

    original_format = img.format
    try:
        oriented = ImageOps.exif_transpose(img)
    except Exception:  # malformed EXIF must not break processing
        oriented = img
    if oriented is not img:
        oriented.load()
        # transpose() returns a copy without .format; keep the real source format.
        oriented.format = original_format
    return oriented


def _has_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA", "PA"):
        return True
    if img.mode == "P" and "transparency" in img.info:
        return True
    return "A" in img.getbands()


def _alpha_is_opaque(img: Image.Image) -> bool:
    if img.mode not in ("RGBA", "LA", "PA"):
        return False
    try:
        alpha = img.getchannel("A")
        low, high = alpha.getextrema()
        return low == high == 255
    except Exception:
        return False


def _actual_transparency(img: Image.Image) -> bool:
    return _has_alpha(img) and not _alpha_is_opaque(img)


def validate_image(
    file: BinaryIO, max_size: int
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Cheap header + structure validation. Full decoding happens in analyze().

    Returns ``(is_valid, error_message, error_code)`` for backwards
    compatibility with existing callers.
    """
    try:
        file.seek(0)
        # Bounded read: never pull more than the limit + 1 byte into memory.
        data = file.read(max_size + 1)
        file.seek(0)
    except Exception:
        return False, "Unable to read the uploaded file", "INVALID_FILE"

    size = len(data)
    if size == 0:
        return False, "The uploaded file is empty", "EMPTY_FILE"
    if size > max_size:
        return False, f"File size exceeds limit of {format_bytes(max_size)}", "FILE_TOO_LARGE"

    header = data[:32]
    declared = _sniff_format(header)
    if declared is None:
        return False, "Unsupported image format. Use JPG, PNG, WebP, or AVIF.", "UNSUPPORTED_FORMAT"

    # Verify a private copy: some Pillow plugins (PNG) close the stream during
    # verify(), which must never invalidate the caller's upload.
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in SUPPORTED_FORMATS:
                return (
                    False,
                    f"Unsupported image format: {probe.format or 'unknown'}",
                    "UNSUPPORTED_FORMAT",
                )
            if probe.format != declared:
                return False, "The file contents do not match its image format", "CORRUPTED_IMAGE"
            width, height = probe.size
            if width <= 0 or height <= 0:
                return False, "The image has invalid dimensions", "CORRUPTED_IMAGE"
            if width * height > MAX_PIXELS:
                return (
                    False,
                    f"Image exceeds maximum resolution ({MAX_PIXELS:,} pixels)",
                    "RESOLUTION_TOO_HIGH",
                )
            probe.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        return False, "Image is too large to process safely", "RESOLUTION_TOO_HIGH"
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return False, "The image is corrupted or incomplete", "CORRUPTED_IMAGE"
    finally:
        try:
            file.seek(0)
        except (ValueError, OSError):
            pass

    return True, None, None


class ImageOptimizer:
    def __init__(self, plan_limits: PlanLimits):
        self.plan_limits = plan_limits
        self.max_input_bytes = plan_limits.max_input_mb * 1024 * 1024
        self.max_output_bytes = plan_limits.max_output_mb * 1024 * 1024

    # ------------------------------------------------------------------ analyze
    def analyze(self, file: BinaryIO, filename: str) -> ImageAnalysis:
        size = _stream_size(file)
        img = _open_image(file)

        width, height = img.size
        format_str = (img.format or "").upper()
        try:
            image_format = ImageFormat(format_str)
        except ValueError as exc:
            raise OptimizationError(
                "UNSUPPORTED_FORMAT",
                f"Unsupported image format: {format_str or 'unknown'}",
                415,
            ) from exc

        has_transparency = _actual_transparency(img)
        megapixels = (width * height) / 1_000_000
        divisor = gcd(width, height) or 1
        aspect_ratio = f"{width // divisor}:{height // divisor}"

        estimated = self._estimate_optimization(
            width, height, size, image_format, has_transparency
        )

        return ImageAnalysis(
            filename=filename or "image",
            format=image_format,
            size=size,
            width=width,
            height=height,
            aspect_ratio=aspect_ratio,
            megapixels=megapixels,
            has_transparency=has_transparency,
            mode=img.mode,
            estimated_optimization=estimated,
        )

    def _estimate_optimization(
        self, width: int, height: int, size: int, fmt: ImageFormat, has_transparency: bool
    ) -> dict:
        recommended = self.recommend_format(fmt, has_transparency)
        ratios = {
            ImageFormat.AVIF: 0.40 if has_transparency else 0.25,
            ImageFormat.WEBP: 0.50 if has_transparency else 0.30,
            ImageFormat.JPEG: 0.40,
            ImageFormat.PNG: 0.70,
        }
        ratio = ratios.get(recommended, 0.4)
        estimated_size = int(size * ratio)

        return {
            "recommended_format": recommended.value,
            "estimated_size_mb": round(estimated_size / 1024 / 1024, 2),
            "estimated_compression_pct": round((1 - ratio) * 100),
            "can_reach_1mb": estimated_size <= 1_048_576,
            "can_reach_5mb": estimated_size <= 5_242_880,
            "can_reach_10mb": estimated_size <= 10_485_760,
            "note": "Estimates only; actual output size is measured after encoding.",
        }

    def recommend_format(self, original: ImageFormat, has_transparency: bool) -> ImageFormat:
        if has_transparency:
            # WebP has the widest alpha support across target browsers.
            return ImageFormat.WEBP
        if original == ImageFormat.PNG:
            return ImageFormat.WEBP
        return ImageFormat.WEBP

    # ----------------------------------------------------------------- optimize
    def optimize(
        self,
        file: BinaryIO,
        request: OptimizationRequest,
        original_analysis: ImageAnalysis,
    ) -> OptimizationResult:
        start_time = time.time()
        try:
            target_size = min(request.target_size, self.max_output_bytes)
            if target_size <= 0:
                raise OptimizationError(
                    "INVALID_TARGET_SIZE", "Target size must be greater than zero", 400
                )

            img = _open_image(file)
            output_format = request.output_format or self.recommend_format(
                original_analysis.format, original_analysis.has_transparency
            )
            self._ensure_encoder(output_format)

            width, height = self._fit_size(
                img.width, img.height, request.target_width, request.target_height
            )
            if (width, height) != img.size:
                img = img.resize((width, height), Image.Resampling.LANCZOS)

            prepared = self._prepare_mode(img, output_format)
            encoded = self._encode_to_target(prepared, output_format, target_size)
            self._verify_encoded(
                encoded["data"], output_format, encoded["width"], encoded["height"]
            )

            target_met = encoded["size"] <= target_size
            message = None
            if not target_met:
                message = (
                    f"The smallest {output_format.value} encoding at the requested "
                    f"resolution is {format_bytes(encoded['size'])}, which is "
                    f"{format_bytes(encoded['size'] - target_size)} above the "
                    f"{format_bytes(target_size)} target. Choose a smaller "
                    f"resolution, a different format, or a larger target."
                )
            elif encoded.get("note"):
                message = encoded["note"]

            return OptimizationResult(
                success=True,
                data=encoded["data"],
                output_size=encoded["size"],
                output_width=encoded["width"],
                output_height=encoded["height"],
                output_format=output_format,
                quality_used=encoded["quality"],
                processing_time_ms=int((time.time() - start_time) * 1000),
                target_met=target_met,
                message=message,
            )
        except OptimizationError as exc:
            logger.info("Optimization rejected: %s", exc.code)
            return OptimizationResult(
                success=False,
                error=exc.message,
                error_code=exc.code,
                processing_time_ms=int((time.time() - start_time) * 1000),
            )
        except Exception as exc:  # defensive: never leak internals to clients
            logger.exception("Optimization failed unexpectedly: %s", type(exc).__name__)
            return OptimizationResult(
                success=False,
                error="The image could not be optimized. Please try another file.",
                error_code="OPTIMIZATION_FAILED",
                processing_time_ms=int((time.time() - start_time) * 1000),
            )

    def _ensure_encoder(self, fmt: ImageFormat) -> None:
        if fmt == ImageFormat.AVIF:
            if not features.check("avif"):
                raise OptimizationError(
                    "AVIF_UNSUPPORTED",
                    "AVIF encoding is not available on this server. Choose WebP, JPEG, or PNG.",
                    422,
                )
            return
        if fmt == ImageFormat.WEBP and not features.check("webp"):
            raise OptimizationError(
                "WEBP_UNSUPPORTED",
                "WebP encoding is not available on this server. Choose JPEG or PNG.",
                422,
            )

    def _fit_size(
        self,
        width: int,
        height: int,
        target_width: Optional[int],
        target_height: Optional[int],
    ) -> Tuple[int, int]:
        """Treat width/height as bounds while preserving aspect ratio.

        Never upscales and never returns a zero-sized image.
        """
        if target_width is None and target_height is None:
            return width, height

        for value in (target_width, target_height):
            if value is not None and (value < 16 or value > MAX_DIMENSION):
                raise OptimizationError(
                    "INVALID_RESOLUTION",
                    f"Requested dimensions must be between 16 and {MAX_DIMENSION} px",
                    400,
                )

        scale = 1.0
        if target_width is not None:
            scale = min(scale, target_width / width)
        if target_height is not None:
            scale = min(scale, target_height / height)
        if scale >= 1.0:
            return width, height

        new_width = max(1, min(MAX_DIMENSION, int(round(width * scale))))
        new_height = max(1, min(MAX_DIMENSION, int(round(height * scale))))
        return new_width, new_height

    def _prepare_mode(self, img: Image.Image, fmt: ImageFormat) -> Image.Image:
        if fmt == ImageFormat.JPEG:
            return self._flatten_for_jpeg(img)

        if fmt in (ImageFormat.WEBP, ImageFormat.AVIF):
            if img.mode == "P":
                img = img.convert("RGBA" if _has_alpha(img) else "RGB")
            if img.mode in ("RGBA", "LA", "PA") and _alpha_is_opaque(img):
                img = img.convert("RGB" if img.mode != "LA" else "L")
            if img.mode in ("CMYK", "I", "I;16", "F", "1"):
                img = img.convert("RGB")
            return img

        # PNG keeps alpha and palette data.
        if img.mode in ("CMYK", "F"):
            img = img.convert("RGB")
        return img

    def _flatten_for_jpeg(self, img: Image.Image) -> Image.Image:
        if img.mode in ("RGBA", "LA", "PA") or (
            img.mode == "P" and "transparency" in img.info
        ):
            if img.mode == "P":
                img = img.convert("RGBA")
            background = Image.new("RGB", img.size, (255, 255, 255))
            alpha = img.getchannel("A") if "A" in img.getbands() else None
            background.paste(img.convert("RGB"), mask=alpha)
            return background
        if img.mode != "RGB":
            return img.convert("RGB")
        return img

    # --------------------------------------------------------------- encoders
    def _encode_to_target(
        self, img: Image.Image, fmt: ImageFormat, target_size: int
    ) -> dict:
        if fmt == ImageFormat.PNG:
            return self._encode_png(img, target_size)
        return self._encode_lossy(img, fmt, target_size)

    def _encode_lossy(self, img: Image.Image, fmt: ImageFormat, target_size: int) -> dict:
        quality_range = {
            ImageFormat.JPEG: (1, 95),
            ImageFormat.WEBP: (1, 95),
            ImageFormat.AVIF: (1, 90),
        }
        q_min, q_max = quality_range[fmt]

        best = self._encode_at(img, fmt, q_max)
        if best["size"] <= target_size:
            best["note"] = None
            return best

        smallest = self._encode_at(img, fmt, q_min)
        if smallest["size"] > target_size:
            smallest["note"] = None
            return smallest

        # Bounded search for the highest quality that fits. The final encoded
        # size is always measured; no "exact size" guarantee is claimed.
        low, high = q_min + 1, q_max - 1
        while low <= high:
            mid = (low + high) // 2
            candidate = self._encode_at(img, fmt, mid)
            if candidate["size"] <= target_size:
                best = candidate
                low = mid + 1
            else:
                high = mid - 1
            if candidate["size"] < smallest["size"]:
                smallest = candidate

        best["note"] = None
        return best

    def _encode_at(self, img: Image.Image, fmt: ImageFormat, quality: int) -> dict:
        buffer = io.BytesIO()
        if fmt == ImageFormat.JPEG:
            img.save(
                buffer,
                format="JPEG",
                quality=int(quality),
                optimize=True,
                progressive=True,
            )
        elif fmt == ImageFormat.WEBP:
            kwargs = {"format": "WEBP", "quality": int(quality), "method": 6, "lossless": False}
            if _has_alpha(img):
                kwargs["alpha_quality"] = max(1, min(100, int(quality)))
            img.save(buffer, **kwargs)
        elif fmt == ImageFormat.AVIF:
            img.save(buffer, format="AVIF", quality=int(quality), speed=6)
        else:  # pragma: no cover - guarded by caller
            raise OptimizationError("UNSUPPORTED_FORMAT", "Unsupported output format", 415)

        data = buffer.getvalue()
        if not data:
            raise OptimizationError(
                "ENCODING_FAILED", "The encoder returned an empty file", 500
            )
        return {
            "data": data,
            "size": len(data),
            "width": img.width,
            "height": img.height,
            "quality": int(quality),
        }

    def _encode_png(self, img: Image.Image, target_size: int) -> dict:
        buffer = io.BytesIO()
        img.save(buffer, format="PNG", optimize=True, compress_level=9)
        best = {
            "data": buffer.getvalue(),
            "size": len(buffer.getvalue()),
            "width": img.width,
            "height": img.height,
            "quality": 100,
            "note": None,
        }
        if best["size"] <= target_size:
            return best

        # PNG has no quality dial: for opaque images we can try palette
        # quantization. Transparent PNGs keep full RGBA fidelity (never drop
        # alpha to hit a size target).
        if not _has_alpha(img):
            source = img.convert("RGB") if img.mode not in ("RGB", "L") else img
            for colors in (256, 128, 64):
                try:
                    quantized = source.quantize(colors=colors)
                except Exception:
                    continue
                candidate_buffer = io.BytesIO()
                quantized.save(candidate_buffer, format="PNG", optimize=True)
                data = candidate_buffer.getvalue()
                if len(data) < best["size"]:
                    best = {
                        "data": data,
                        "size": len(data),
                        "width": img.width,
                        "height": img.height,
                        "quality": None,
                        "note": f"Palette-quantized to {colors} colors to reduce size.",
                    }
        else:
            best["note"] = (
                "Transparency was preserved; PNG has no lossy quality setting, so the "
                "file may stay above the target. Try WebP or AVIF for a smaller file."
            )
        return best

    def _verify_encoded(
        self, data: bytes, expected_format: ImageFormat, width: int, height: int
    ) -> None:
        if not data:
            raise OptimizationError(
                "ENCODING_FAILED", "The encoder returned an empty file", 500
            )
        try:
            with Image.open(io.BytesIO(data)) as check:
                check.load()
                if (check.format or "").upper() != expected_format.value:
                    raise OptimizationError(
                        "ENCODING_FAILED",
                        "The generated image does not match the requested format",
                        500,
                    )
                if check.size != (width, height):
                    raise OptimizationError(
                        "ENCODING_FAILED",
                        "The generated image has unexpected dimensions",
                        500,
                    )
        except OptimizationError:
            raise
        except Exception as exc:
            logger.error("Encoded image failed verification: %s", type(exc).__name__)
            raise OptimizationError(
                "ENCODING_FAILED", "The optimized image could not be verified", 500
            ) from exc
