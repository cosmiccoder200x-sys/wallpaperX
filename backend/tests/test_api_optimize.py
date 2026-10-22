import io

import pytest
from PIL import Image

from app.models import FREE_LIMITS, ImageFormat
from app.services.image_optimizer import format_bytes
from tests.helpers import (
    avif_bytes,
    jpeg_bytes,
    noisy_image_bytes,
    png_bytes,
    transparent_png_bytes,
    upload,
    webp_bytes,
)


def test_analyze_reports_real_metadata(client):
    data = png_bytes(size=(800, 600))
    response = upload(client, data, "pic.png", url="/api/optimize/analyze")
    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    payload = body["data"]
    assert payload["format"] == "PNG"
    assert payload["width"] == 800
    assert payload["height"] == 600
    assert payload["size"] == len(data)
    assert payload["aspect_ratio"] == "4:3"
    assert payload["mime_type"] == "image/png"


@pytest.mark.parametrize(
    "fmt,extension,mime",
    [
        ("JPEG", ".jpg", "image/jpeg"),
        ("PNG", ".png", "image/png"),
        ("WEBP", ".webp", "image/webp"),
        ("AVIF", ".avif", "image/avif"),
    ],
)
def test_optimize_returns_valid_binary_for_each_format(client, fmt, extension, mime):
    response = upload(
        client,
        png_bytes(size=(1400, 1000)),
        "photo.png",
        {"target_size_mb": "2", "output_format": fmt},
    )
    if response.status_code == 422 and fmt == "AVIF":
        pytest.skip("AVIF encoder not available in this environment")

    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("image/")
    assert response.headers["X-Output-Format"] == fmt
    assert response.headers["X-Target-Met"] == "true"
    assert int(response.headers["X-Output-Size"]) == len(response.data)
    assert response.headers["X-Filename"].endswith(extension)
    assert "attachment" in response.headers["Content-Disposition"]

    with Image.open(io.BytesIO(response.data)) as image:
        assert (image.format or "").upper() == fmt
        assert image.size == (
            int(response.headers["X-Output-Width"]),
            int(response.headers["X-Output-Height"]),
        )


def test_original_under_target_is_returned_as_an_image(client):
    data = jpeg_bytes(size=(80, 60))
    response = upload(client, data, "tiny.jpg", {"target_size_mb": "10"})
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/jpeg"
    assert response.data == data
    assert response.headers["X-Reencoded"] == "false"
    assert response.headers["X-Target-Met"] == "true"
    with Image.open(io.BytesIO(response.data)) as image:
        assert image.format == "JPEG"


def test_unreachable_target_still_returns_an_image_and_says_so(client):
    response = upload(
        client,
        noisy_image_bytes((700, 700), fmt="PNG"),
        "noise.png",
        {"target_size_kb": "1", "output_format": "WEBP"},
    )
    assert response.status_code == 200
    assert response.headers["X-Target-Met"] == "false"
    assert int(response.headers["X-Output-Size"]) > 1024
    assert response.headers.get("X-Message")
    with Image.open(io.BytesIO(response.data)) as image:
        assert image.format == "WEBP"


def test_transparent_png_download_preserves_alpha(client):
    response = upload(
        client,
        transparent_png_bytes(),
        "alpha.png",
        {"target_size_mb": "5", "output_format": "WEBP"},
    )
    assert response.status_code == 200
    with Image.open(io.BytesIO(response.data)) as image:
        assert image.format == "WEBP"
        assert "A" in image.getbands()


def test_invalid_file_returns_json_error_not_an_image(client):
    response = upload(client, b"not really an image", "bad.jpg")
    assert response.status_code == 400
    assert response.is_json
    body = response.get_json()
    assert body["success"] is False
    assert body["error"]["code"] in {"UNSUPPORTED_FORMAT", "CORRUPTED_IMAGE"}
    assert not response.headers["Content-Type"].startswith("image/")


def test_empty_upload_returns_json_error(client):
    response = upload(client, b"", "empty.jpg")
    assert response.status_code == 400
    assert response.is_json
    assert response.get_json()["error"]["code"] == "EMPTY_FILE"


def test_invalid_output_format_is_rejected(client):
    response = upload(client, jpeg_bytes(), "x.jpg", {"output_format": "GIF"})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_OUTPUT_FORMAT"


def test_target_above_plan_limit_is_rejected(client):
    response = upload(client, jpeg_bytes(), "x.jpg", {"target_size_mb": "500"})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "TARGET_TOO_LARGE"


def test_invalid_resolution_is_rejected(client):
    response = upload(client, jpeg_bytes(), "x.jpg", {"target_width": "99999"})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_RESOLUTION"


def test_download_filename_matches_encoded_format(client):
    response = upload(
        client,
        png_bytes(size=(600, 400)),
        "My Wallpaper 4K.png",
        {"target_size_mb": "2", "output_format": "JPEG"},
    )
    assert response.status_code == 200
    assert response.headers["X-Filename"] == "My-Wallpaper-4K-optimized.jpg"
    assert response.headers["X-Output-Format"] == "JPEG"


def test_cors_exposes_metadata_headers(client):
    response = client.options(
        "/api/optimize/optimize",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    exposed = response.headers.get("Access-Control-Expose-Headers", "")
    assert "X-Target-Met" in exposed
    assert "X-Output-Format" in exposed


def test_daily_quota_is_enforced(client, monkeypatch):
    monkeypatch.setattr(FREE_LIMITS, "daily_optimizations", 1)
    data = jpeg_bytes()

    first = upload(client, data, "one.jpg", {"target_size_mb": "9"})
    assert first.status_code == 200

    second = upload(client, data, "two.jpg", {"target_size_mb": "9"})
    assert second.status_code == 429
    assert second.is_json
    assert second.headers["Retry-After"]


def test_limits_endpoint_matches_plan(client):
    response = client.get("/api/optimize/limits")
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["plan"] == "free"
    assert data["max_output_mb"] == FREE_LIMITS.max_output_mb
    assert "WEBP" in data["supported_formats"]


def test_history_requires_authentication(client):
    response = client.get("/api/optimize/history")
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"


def test_url_optimization_blocks_ssrf_without_fetching(client):
    response = client.post(
        "/api/optimize/optimize-url",
        json={"url": "http://169.254.169.254/latest/meta-data", "target_size_mb": 1},
    )
    assert response.status_code == 400
    assert response.is_json
    body = response.get_json()
    assert body["error"]["code"] == "URL_FETCH_FAILED"
    assert "169.254" not in body["error"]["message"]


def test_url_optimization_uses_the_same_binary_contract(client, monkeypatch):
    from app.routes import optimize as optimize_route

    image = png_bytes(size=(900, 600))

    def fake_fetch(_url):
        return io.BytesIO(image), "image/png", None

    monkeypatch.setattr(optimize_route.url_fetcher, "fetch", fake_fetch)
    response = client.post(
        "/api/optimize/optimize-url",
        json={
            "url": "https://example.com/wallpaper.png",
            "target_size_mb": 1,
            "output_format": "WEBP",
        },
    )
    assert response.status_code == 200
    assert response.headers["X-Output-Format"] == "WEBP"
    assert response.headers["X-Original-Size"] == str(len(image))
    assert response.headers["X-Filename"].endswith("-optimized.webp")
    with Image.open(io.BytesIO(response.data)) as decoded:
        assert decoded.format == "WEBP"


def test_health_reports_database_and_encoders(client):
    body = client.get("/api/health").get_json()
    assert body["status"] == "ok"
    assert body["database"] in {"connected", "unavailable"}
    assert isinstance(body["avif"], bool)
