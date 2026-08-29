import io
import os
import time
import logging
from typing import Optional, Tuple, BinaryIO
from PIL import Image, ImageFile
from app.config import config
from app.models import (
    ImageFormat, OptimizationRequest, OptimizationResult, 
    ImageAnalysis, PlanLimits
)

ImageFile.LOAD_TRUNCATED_IMAGES = True
logger = logging.getLogger(__name__)

MAX_PIXELS = config.MAX_PIXELS
SUPPORTED_FORMATS = config.SUPPORTED_FORMATS


class ImageOptimizer:
    def __init__(self, plan_limits: PlanLimits):
        self.plan_limits = plan_limits
        self.max_input_bytes = plan_limits.max_input_mb * 1024 * 1024
        self.max_output_bytes = plan_limits.max_output_mb * 1024 * 1024

    def analyze(self, file: BinaryIO, filename: str) -> ImageAnalysis:
        file.seek(0)
        img = Image.open(file)
        img.load()
        
        width, height = img.size
        format_str = img.format or "UNKNOWN"
        
        try:
            image_format = ImageFormat(format_str.upper())
        except ValueError:
            image_format = ImageFormat.PNG
        
        has_transparency = img.mode in ('RGBA', 'LA', 'P') or (
            img.mode == 'P' and 'transparency' in img.info
        )
        
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        
        megapixels = (width * height) / 1_000_000
        
        from math import gcd
        g = gcd(width, height)
        aspect_ratio = f"{width // g}:{height // g}"
        
        estimated = self._estimate_optimization(
            width, height, size, image_format, has_transparency
        )
        
        return ImageAnalysis(
            filename=filename,
            format=image_format,
            size=size,
            width=width,
            height=height,
            aspect_ratio=aspect_ratio,
            megapixels=megapixels,
            has_transparency=has_transparency,
            mode=img.mode,
            estimated_optimization=estimated
        )

    def _estimate_optimization(
        self, width: int, height: int, size: int, 
        fmt: ImageFormat, has_transparency: bool
    ) -> dict:
        pixels = width * height
        bytes_per_pixel = size / pixels if pixels > 0 else 0
        
        recommended_format = self._recommend_format(fmt, has_transparency)
        
        if recommended_format == ImageFormat.WEBP:
            estimated_ratio = 0.3 if not has_transparency else 0.5
        elif recommended_format == ImageFormat.AVIF:
            estimated_ratio = 0.25 if not has_transparency else 0.4
        elif recommended_format == ImageFormat.JPEG:
            estimated_ratio = 0.4
        else:
            estimated_ratio = 0.7
        
        estimated_size = int(size * estimated_ratio)
        
        return {
            "recommended_format": recommended_format.value,
            "estimated_size_mb": round(estimated_size / 1024 / 1024, 2),
            "estimated_compression_pct": round((1 - estimated_ratio) * 100),
            "can_reach_1mb": estimated_size <= 1_048_576,
            "can_reach_5mb": estimated_size <= 5_242_880,
            "can_reach_10mb": estimated_size <= 10_485_760,
        }

    def _recommend_format(self, original: ImageFormat, has_transparency: bool) -> ImageFormat:
        if has_transparency:
            return ImageFormat.WEBP
        if original == ImageFormat.PNG:
            return ImageFormat.WEBP
        if original in (ImageFormat.JPEG, ImageFormat.WEBP, ImageFormat.AVIF):
            return ImageFormat.WEBP
        return ImageFormat.WEBP

    def optimize(
        self, 
        file: BinaryIO, 
        request: OptimizationRequest,
        original_analysis: ImageAnalysis
    ) -> OptimizationResult:
        start_time = time.time()
        
        try:
            file.seek(0)
            img = Image.open(file)
            img.load()
            
            target_size = min(request.target_size, self.max_output_bytes)
            
            output_format = request.output_format or self._recommend_format(
                original_analysis.format, original_analysis.has_transparency
            )
            
            target_width = request.target_width or original_analysis.width
            target_height = request.target_height or original_analysis.height
            
            if target_width != original_analysis.width or target_height != original_analysis.height:
                img = self._resize_image(img, target_width, target_height)
            
            result = self._compress_to_target(
                img, target_size, output_format, original_analysis.has_transparency
            )
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return OptimizationResult(
                success=True,
                data=result["data"],
                output_size=result["size"],
                output_width=result["width"],
                output_height=result["height"],
                output_format=output_format,
                quality_used=result["quality"],
                processing_time_ms=processing_time
            )
            
        except Exception as e:
            logger.error(f"Optimization failed: {e}", exc_info=True)
            return OptimizationResult(
                success=False,
                error=str(e),
                error_code="OPTIMIZATION_FAILED",
                processing_time_ms=int((time.time() - start_time) * 1000)
            )

    def _resize_image(self, img: Image.Image, target_width: int, target_height: int) -> Image.Image:
        if img.width <= target_width and img.height <= target_height:
            return img
        
        img.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
        return img

    def _compress_to_target(
        self, 
        img: Image.Image, 
        target_size: int, 
        output_format: ImageFormat,
        has_transparency: bool
    ) -> dict:
        if output_format == ImageFormat.AVIF:
            return self._compress_avif(img, target_size, has_transparency)
        elif output_format == ImageFormat.WEBP:
            return self._compress_webp(img, target_size, has_transparency)
        elif output_format == ImageFormat.JPEG:
            return self._compress_jpeg(img, target_size)
        else:
            return self._compress_png(img, target_size)

    def _compress_jpeg(self, img: Image.Image, target_size: int) -> dict:
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        low, high = 10, 95
        best_quality = 85
        best_data = None
        best_size = 0
        
        for _ in range(8):
            mid = (low + high) // 2
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=mid, optimize=True, progressive=True)
            size = buffer.tell()
            
            if size <= target_size:
                best_quality = mid
                best_data = buffer.getvalue()
                best_size = size
                low = mid + 1
            else:
                high = mid - 1
        
        if best_data is None:
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=10, optimize=True, progressive=True)
            best_data = buffer.getvalue()
            best_size = len(best_data)
            best_quality = 10
        
        return {
            "data": best_data,
            "size": best_size,
            "width": img.width,
            "height": img.height,
            "quality": best_quality
        }

    def _compress_webp(self, img: Image.Image, target_size: int, has_transparency: bool) -> dict:
        low, high = 10, 95
        best_quality = 80
        best_data = None
        best_size = 0
        
        method = 6
        
        for _ in range(8):
            mid = (low + high) // 2
            buffer = io.BytesIO()
            save_kwargs = {
                'format': 'WEBP',
                'quality': mid,
                'method': method,
                'lossless': False
            }
            if has_transparency:
                save_kwargs['alpha_quality'] = max(mid - 10, 10)
            img.save(buffer, **save_kwargs)
            size = buffer.tell()
            
            if size <= target_size:
                best_quality = mid
                best_data = buffer.getvalue()
                best_size = size
                low = mid + 1
            else:
                high = mid - 1
        
        if best_data is None:
            buffer = io.BytesIO()
            img.save(buffer, format='WEBP', quality=10, method=method, lossless=False)
            best_data = buffer.getvalue()
            best_size = len(best_data)
            best_quality = 10
        
        return {
            "data": best_data,
            "size": best_size,
            "width": img.width,
            "height": img.height,
            "quality": best_quality
        }

    def _compress_avif(self, img: Image.Image, target_size: int, has_transparency: bool) -> dict:
        try:
            low, high = 10, 63
            best_quality = 30
            best_data = None
            best_size = 0
            
            for _ in range(8):
                mid = (low + high) // 2
                buffer = io.BytesIO()
                img.save(buffer, format='AVIF', quality=mid, speed=6)
                size = buffer.tell()
                
                if size <= target_size:
                    best_quality = mid
                    best_data = buffer.getvalue()
                    best_size = size
                    low = mid + 1
                else:
                    high = mid - 1
            
            if best_data is None:
                buffer = io.BytesIO()
                img.save(buffer, format='AVIF', quality=10, speed=6)
                best_data = buffer.getvalue()
                best_size = len(best_data)
                best_quality = 10
            
            return {
                "data": best_data,
                "size": best_size,
                "width": img.width,
                "height": img.height,
                "quality": best_quality
            }
        except Exception as e:
            logger.warning(f"AVIF encoding failed, falling back to WebP: {e}")
            return self._compress_webp(img, target_size, has_transparency)

    def _compress_png(self, img: Image.Image, target_size: int) -> dict:
        buffer = io.BytesIO()
        img.save(buffer, format='PNG', optimize=True, compress_level=9)
        data = buffer.getvalue()
        size = len(data)
        
        if size <= target_size:
            return {"data": data, "size": size, "width": img.width, "height": img.height, "quality": 100}
        
        img_rgb = img.convert('RGB') if img.mode != 'RGB' else img
        return self._compress_jpeg(img_rgb, target_size)


def validate_image(file: BinaryIO, max_size: int) -> Tuple[bool, Optional[str], Optional[str]]:
    file.seek(0)
    header = file.read(32)
    file.seek(0)
    
    if len(header) < 12:
        return False, "File too small to be a valid image", "INVALID_IMAGE"
    
    is_valid = False
    fmt = None
    
    if header.startswith(b'\xff\xd8\xff'):
        is_valid, fmt = True, "JPEG"
    elif header.startswith(b'\x89PNG\r\n\x1a\n'):
        is_valid, fmt = True, "PNG"
    elif header.startswith(b'RIFF') and header[8:12] == b'WEBP':
        is_valid, fmt = True, "WEBP"
    elif header[4:8] == b'ftyp' and b'avif' in header[:32]:
        is_valid, fmt = True, "AVIF"
    
    if not is_valid:
        return False, "Unsupported image format", "UNSUPPORTED_FORMAT"
    
    try:
        img = Image.open(file)
        img.load()
        
        pixels = img.width * img.height
        if pixels > MAX_PIXELS:
            return False, f"Image exceeds maximum resolution ({MAX_PIXELS:,} pixels)", "RESOLUTION_TOO_HIGH"
        
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        
        if size > max_size:
            return False, f"File size exceeds limit of {max_size // 1024 // 1024} MB", "FILE_TOO_LARGE"
        
        return True, None, None
    except Exception as e:
        return False, f"Invalid or corrupted image: {str(e)}", "CORRUPTED_IMAGE"


def format_bytes(bytes_val: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} TB"


def format_dimensions(width: int, height: int) -> str:
    return f"{width} × {height}"