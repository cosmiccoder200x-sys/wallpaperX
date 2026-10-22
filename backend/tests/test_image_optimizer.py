import io

import pytest
from PIL import Image, features

from app.models import FREE_LIMITS, ImageFormat, OptimizationRequest
from app.services.image_optimizer import (
    ImageOptimizer,
    OptimizationError,
    validate_image,
)
from tests.helpers import (
    avif_bytes,
    jpeg_bytes,
    noisy_image_bytes,
    png_bytes,
    transparent_png_bytes,
    webp_bytes,
)

optimizer = ImageOptimizer(FREE_LIMITS)


def analyze(data: bytes, name: str):
    return optimizer.analyze(io.BytesIO(data), name)


def optimize(data: bytes, name: str, **kwargs):
    analysis = analyze(data, name)
    return optimizer.optimize(
        io.BytesIO(data), OptimizationRequest(**kwargs), analysis
    )


@pytest.mark.parametrize(
    "factory,name,expected",
    [
        (jpeg_bytes, "photo.jpg", ImageFormat.JPEG),
        (png_bytes, "graphic.png", ImageFormat.PNG),
        (webp_bytes, "photo.webp", ImageFormat.WEBP),
        (avif_bytes, "photo.avif", ImageFormat.AVIF),
    ],
)
def test_analyze_supported_formats(factory, name, expected):
    analysis = analyze(factory(), name)
    assert analysis.format is expected
    assert analysis.width > 0 and analysis.height > 0
    assert analysis.size == len(factory())
    assert analysis.aspect_ratio.count(":") == 1


def test_palette_without_transparency_is_not_reported_transparent():
    analysis = analyze(png_bytes(mode="P", color=1), "palette.png")
    assert analysis.has_transparency is False


def test_rgba_reports_transparency():
    analysis = analyze(transparent_png_bytes(), "alpha.png")
    assert analysis.has_transparency is True


def test_exif_orientation_is_applied_to_analysis():
    image = Image.new("RGB", (640, 480), (10, 20, 30))
    exif = Image.Exif()
    exif[274] = 6  # rotate 90 CW on display
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)

    analysis = analyze(buffer.getvalue(), "rotated.jpg")
    assert (analysis.width, analysis.height) == (480, 640)


def test_target_size_is_respected_and_measured():
    data = noisy_image_bytes((1200, 900), fmt="PNG")
    result = optimize(
        data,
        "noise.png",
        target_size=300 * 1024,
        output_format=ImageFormat.WEBP,
    )
    assert result.success is True
    assert result.target_met is True
    assert result.output_size == len(result.data)
    assert result.output_size <= 300 * 1024
    assert result.output_format is ImageFormat.WEBP
    # The bytes really are a WebP image of the reported size.
    with Image.open(io.BytesIO(result.data)) as check:
        assert check.format == "WEBP"
        assert check.size == (result.output_width, result.output_height)


def test_unreachable_target_is_reported_truthfully():
    data = noisy_image_bytes((800, 800), fmt="PNG")
    result = optimize(
        data,
        "noise.png",
        target_size=1024,
        output_format=ImageFormat.WEBP,
    )
    assert result.success is True
    assert result.target_met is False
    assert result.output_size > 1024
    assert result.message and "above" in result.message


def test_png_output_is_never_silently_replaced_by_jpeg():
    result = optimize(
        noisy_image_bytes((600, 600), fmt="PNG"),
        "noise.png",
        target_size=1024,
        output_format=ImageFormat.PNG,
    )
    assert result.success is True
    assert result.output_format is ImageFormat.PNG
    assert result.data.startswith(b"\x89PNG\r\n\x1a\n")
    assert result.target_met is False


def test_transparency_is_preserved_for_webp():
    result = optimize(
        transparent_png_bytes(),
        "alpha.png",
        target_size=5 * 1024 * 1024,
        output_format=ImageFormat.WEBP,
    )
    assert result.success is True
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.format == "WEBP"
        assert "A" in image.getbands()
        low, _high = image.getchannel("A").getextrema()
        assert low < 255, "alpha channel was flattened"


def test_transparency_is_flattened_for_jpeg():
    result = optimize(
        transparent_png_bytes(),
        "alpha.png",
        target_size=5 * 1024 * 1024,
        output_format=ImageFormat.JPEG,
    )
    assert result.success is True
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.format == "JPEG"
        assert image.mode == "RGB"


def test_resize_preserves_aspect_ratio():
    result = optimize(
        png_bytes(size=(1600, 900)),
        "wide.png",
        target_size=5 * 1024 * 1024,
        output_format=ImageFormat.JPEG,
        target_width=800,
        target_height=800,
    )
    assert (result.output_width, result.output_height) == (800, 450)


def test_images_are_never_upscaled():
    result = optimize(
        png_bytes(size=(800, 600)),
        "small.png",
        target_size=5 * 1024 * 1024,
        output_format=ImageFormat.JPEG,
        target_width=4000,
        target_height=4000,
    )
    assert (result.output_width, result.output_height) == (800, 600)


def test_invalid_resolution_is_rejected():
    result = optimize(
        png_bytes(),
        "x.png",
        target_size=1024 * 1024,
        target_width=99999,
    )
    assert result.success is False
    assert result.error_code == "INVALID_RESOLUTION"


def test_truncated_image_is_rejected():
    data = jpeg_bytes()
    truncated = data[: len(data) // 2]
    with pytest.raises(OptimizationError) as exc:
        analyze(truncated, "cut.jpg")
    assert exc.value.code == "CORRUPTED_IMAGE"


def test_invalid_bytes_are_rejected():
    valid, error, code = validate_image(io.BytesIO(b"this is not an image"), 10 * 1024 * 1024)
    assert valid is False
    assert code == "UNSUPPORTED_FORMAT"
    assert error


def test_empty_upload_is_rejected():
    valid, _error, code = validate_image(io.BytesIO(b""), 10 * 1024 * 1024)
    assert valid is False
    assert code == "EMPTY_FILE"


def test_oversized_upload_is_rejected():
    data = png_bytes()
    valid, _error, code = validate_image(io.BytesIO(data), len(data) - 1)
    assert valid is False
    assert code == "FILE_TOO_LARGE"


def test_avif_encoder_missing_returns_structured_error(monkeypatch):
    from app.services import image_optimizer as module

    monkeypatch.setattr(module.features, "check", lambda name: False)
    result = optimize(
        jpeg_bytes(),
        "photo.jpg",
        target_size=1024 * 1024,
        output_format=ImageFormat.AVIF,
    )
    assert result.success is False
    assert result.error_code == "AVIF_UNSUPPORTED"
    assert "AVIF" in (result.error or "")


@pytest.mark.skipif(not features.check("avif"), reason="AVIF encoder not available")
def test_avif_output_is_valid():
    result = optimize(
        jpeg_bytes(),
        "photo.jpg",
        target_size=1024 * 1024,
        output_format=ImageFormat.AVIF,
    )
    assert result.success is True
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.format == "AVIF"


def test_zero_target_is_rejected():
    result = optimize(jpeg_bytes(), "x.jpg", target_size=0)
    assert result.success is False
    assert result.error_code == "INVALID_TARGET_SIZE"
