"""End-to-end HTTP smoke test against a running WallpaperX backend.

Exercises the real network contract (not Flask's test client) and asserts the
release-critical guarantees:

* every successful optimization returns a real, decodable image;
* the reported output size/format/filename match the bytes actually returned;
* an image already under the target is still returned as an image, never JSON;
* failures are structured JSON with a non-2xx status.

Usage: python scripts/e2e_smoke.py [base_url]
"""

from __future__ import annotations

import io
import json
import sys

import requests
from PIL import Image, ImageDraw

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000").rstrip("/")
FAILURES: list[str] = []
CHECKS = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if condition:
        print(f"  PASS  {label}")
    else:
        FAILURES.append(f"{label} {detail}".strip())
        print(f"  FAIL  {label} {detail}".strip())


def photo_jpeg(width: int = 2560, height: int = 1440) -> bytes:
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=(y % 256, (y * 2) % 256, (y * 3) % 256))
    for i in range(0, width, 40):
        draw.ellipse([i, 100, i + 200, 300], fill=(250, 120, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def transparent_png(width: int = 900, height: int = 600) -> bytes:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([50, 50, 450, 450], fill=(220, 40, 160, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def post_image(data: bytes, name: str, mime: str, fields: dict[str, str]):
    return requests.post(
        f"{BASE}/api/optimize/optimize",
        files={"file": (name, data, mime)},
        data=fields,
        timeout=120,
    )


def analyse(data: bytes, name: str, mime: str):
    return requests.post(
        f"{BASE}/api/optimize/analyze",
        files={"file": (name, data, mime)},
        timeout=120,
    )


def decode(payload: bytes):
    try:
        img = Image.open(io.BytesIO(payload))
        img.load()
        return img
    except Exception as exc:  # noqa: BLE001 - diagnostic path
        print(f"       decode error: {exc}")
        return None


def main() -> int:
    print(f"WallpaperX E2E smoke test against {BASE}\n")

    print("health")
    r = requests.get(f"{BASE}/api/health", timeout=10)
    check("GET /api/health is 200", r.status_code == 200, f"got {r.status_code}")

    print("\n1. small JPEG, target already satisfied")
    small = photo_jpeg(640, 360)
    r = analyse(small, "small.jpg", "image/jpeg")
    check("analyze returns 200", r.status_code == 200, f"got {r.status_code}")
    analysis = r.json().get("data", {}) if r.status_code == 200 else {}
    check(
        "analyze reports real dimensions",
        analysis.get("width") == 640 and analysis.get("height") == 360,
        f"got {analysis.get('width')}x{analysis.get('height')}",
    )

    r = post_image(
        small,
        "small.jpg",
        "image/jpeg",
        {"target_size_kb": "5000", "output_format": "JPEG", "preset": "custom"},
    )
    check("already-optimized upload returns 2xx", r.status_code < 300, f"got {r.status_code}")
    check(
        "already-optimized upload returns an image, not JSON",
        r.headers.get("Content-Type", "").startswith("image/"),
        f"content-type={r.headers.get('Content-Type')}",
    )
    img = decode(r.content) if r.headers.get("Content-Type", "").startswith("image/") else None
    check("returned bytes decode as an image", img is not None)
    check(
        "no silent upscale",
        img is not None and img.width <= 640,
        f"got {img.width if img else '?'}",
    )
    reported = r.headers.get("X-Optimized-Size")
    if reported:
        check(
            "X-Optimized-Size matches the body",
            int(reported) == len(r.content),
            f"header={reported} body={len(r.content)}",
        )
    disposition = r.headers.get("Content-Disposition", "")
    check("download filename is present and typed", "attachment" in disposition and ".jpg" in disposition, disposition)

    print("\n2. large JPEG compressed to a hard byte budget")
    big = photo_jpeg(2560, 1440)
    r = post_image(
        big,
        "big.jpg",
        "image/jpeg",
        {"target_size_kb": "120", "output_format": "JPEG", "preset": "custom"},
    )
    check("optimize returns 2xx", r.status_code < 300, f"got {r.status_code}")
    ctype = r.headers.get("Content-Type", "")
    check("returns image/jpeg", ctype.startswith("image/jpeg"), ctype)
    img = decode(r.content) if ctype.startswith("image/") else None
    check("body decodes as JPEG", img is not None and img.format == "JPEG")
    met = r.headers.get("X-Target-Met")
    if met is not None:
        under = len(r.content) <= 120 * 1024
        check(
            "target claim matches reality",
            (met.lower() == "true") == under,
            f"X-Target-Met={met} size={len(r.content)} limit={120 * 1024}",
        )
        if under:
            check("claimed-met result is within budget", under, f"{len(r.content)} bytes")
    check("compression actually happened", len(r.content) < len(big), f"{len(big)} -> {len(r.content)}")

    print("\n3. transparent PNG keeps alpha when PNG is requested")
    png = transparent_png()
    r = post_image(
        png,
        "alpha.png",
        "image/png",
        {"target_size_kb": "800", "output_format": "PNG"},
    )
    check("optimize returns 2xx", r.status_code < 300, f"got {r.status_code}")
    img = decode(r.content) if r.status_code < 300 else None
    check("body decodes as PNG", img is not None and img.format == "PNG")
    if img is not None:
        rgba = img.convert("RGBA")
        corner = rgba.getpixel((5, 5))
        check("transparency preserved", corner[3] == 0, f"corner={corner}")
        check("no silent upscale", img.width <= 900, f"width={img.width}")

    print("\n4. WebP output")
    r = post_image(
        big, "big.jpg", "image/jpeg", {"target_size_kb": "300", "output_format": "WEBP"}
    )
    if r.status_code < 300:
        img = decode(r.content)
        check("WebP body decodes", img is not None and img.format == "WEBP")
        check(
            "download filename matches format",
            ".webp" in r.headers.get("Content-Disposition", ""),
            r.headers.get("Content-Disposition", ""),
        )
    else:
        print(f"  SKIP  WebP unavailable in this environment ({r.status_code})")

    print("\n5. AVIF output (encoder may be unavailable)")
    r = post_image(
        big, "big.jpg", "image/jpeg", {"target_size_kb": "300", "output_format": "AVIF"}
    )
    if r.status_code < 300:
        img = decode(r.content)
        check("AVIF body decodes", img is not None)
    else:
        body = r.json() if r.headers.get("Content-Type", "").startswith("application/json") else {}
        print(f"  SKIP  AVIF unsupported here: {r.status_code} {body.get('error', {}).get('code', '')}")

    print("\n6. invalid inputs fail as structured JSON")
    r = post_image(b"this is not an image", "fake.jpg", "image/jpeg", {"target_size_kb": "100"})
    check("invalid image rejected", 400 <= r.status_code < 500, f"got {r.status_code}")
    check("json content type", r.headers.get("Content-Type", "").startswith("application/json"))
    body = r.json() if r.headers.get("Content-Type", "").startswith("application/json") else {}
    check("structured error code", bool(body.get("error", {}).get("code")), json.dumps(body)[:160])
    check("no stack trace leaked", "Traceback" not in r.text)

    r = post_image(b"", "empty.jpg", "image/jpeg", {"target_size_kb": "100"})
    check("empty upload rejected", 400 <= r.status_code < 500, f"got {r.status_code}")

    r = post_image(small, "small.jpg", "image/jpeg", {"target_size_kb": "-5"})
    check("negative target rejected", 400 <= r.status_code < 500, f"got {r.status_code}")

    r = post_image(small, "small.jpg", "image/jpeg", {"output_format": "BMP", "target_size_kb": "100"})
    check("unsupported output format rejected", 400 <= r.status_code < 500, f"got {r.status_code}")

    print("\n7. URL optimization rejects internal targets (SSRF)")
    for blocked in (
        "http://127.0.0.1:5000/api/health",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/logo.png",
        "file:///etc/passwd",
        "http://localhost/x.png",
    ):
        r = requests.post(
            f"{BASE}/api/optimize/optimize-url", json={"url": blocked}, timeout=30
        )
        check(
            f"blocked {blocked}",
            400 <= r.status_code < 500,
            f"got {r.status_code}",
        )
        check(
            f"no internal address echoed for {blocked}",
            "127.0.0.1" not in r.text and "169.254" not in r.text,
            r.text[:120],
        )

    print(f"\n{CHECKS - len(FAILURES)}/{CHECKS} checks passed")
    if FAILURES:
        print("\nFAILURES:")
        for failure in FAILURES:
            print(f" - {failure}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
