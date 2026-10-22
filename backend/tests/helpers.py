import io

from PIL import Image, ImageDraw


def jpeg_bytes(size=(640, 480), color=(90, 120, 200), quality=90) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def png_bytes(size=(640, 480), mode="RGB", color=None) -> bytes:
    buffer = io.BytesIO()
    fill = color if color is not None else ((30, 120, 200) if mode == "RGB" else (30, 120, 200, 128))
    Image.new(mode, size, fill).save(buffer, format="PNG")
    return buffer.getvalue()


def transparent_png_bytes(size=(320, 240)) -> bytes:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, size[0] // 2, size[1]], fill=(255, 0, 0, 255))
    draw.rectangle([size[0] // 2, 0, size[0], size[1]], fill=(0, 0, 255, 90))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def webp_bytes(size=(640, 480)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 200, 90)).save(buffer, format="WEBP", quality=85)
    return buffer.getvalue()


def avif_bytes(size=(320, 240)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (200, 100, 10)).save(buffer, format="AVIF", quality=70)
    return buffer.getvalue()


def noisy_image_bytes(size=(1200, 900), fmt="JPEG") -> bytes:
    """High-entropy image so tiny targets are genuinely unreachable."""
    image = Image.effect_noise(size, 80).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, quality=95)
    return buffer.getvalue()


def upload(client, data: bytes, filename: str, extra: dict = None, url: str = "/api/optimize/optimize"):
    payload = {"file": (io.BytesIO(data), filename)}
    payload.update(extra or {})
    return client.post(url, data=payload, content_type="multipart/form-data")
