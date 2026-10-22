import io

import pytest

from app.services import url_fetcher as module
from app.services.url_fetcher import URLFetchError, URLFetcher, _is_blocked_ip
from tests.helpers import png_bytes


class FakeResponse:
    def __init__(self, status_code=200, headers=None, chunks=(), url="https://example.com/a.png"):
        self.status_code = status_code
        self.headers = headers or {}
        self._chunks = list(chunks)
        self.url = url
        self.closed = False

    def iter_content(self, chunk_size=8192):
        yield from self._chunks

    def close(self):
        self.closed = True


@pytest.fixture()
def fetcher():
    return URLFetcher()


@pytest.fixture(autouse=True)
def _public_dns(monkeypatch):
    # No real DNS lookups in tests; pretend every host resolves to a public IP.
    monkeypatch.setattr(module, "_resolve", lambda host, port: ["93.184.216.34"])


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/x.png",
        "http://localhost/x.png",
        "http://10.1.2.3/x.png",
        "http://172.16.0.1/x.png",
        "http://192.168.1.1/x.png",
        "http://169.254.169.254/latest/meta-data",
        "http://100.64.0.1/x.png",
        "http://0.0.0.0/x.png",
        "http://[::1]/x.png",
        "http://[fe80::1]/x.png",
        "http://[fc00::1]/x.png",
        "http://[::ffff:127.0.0.1]/x.png",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://printer.local/x.png",
    ],
)
def test_ssrf_targets_are_blocked(fetcher, url):
    with pytest.raises(URLFetchError) as exc:
        fetcher.validate_url(url)
    assert exc.value.code in {"URL_BLOCKED", "URL_UNRESOLVABLE"}


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/x.png",
        "gopher://example.com/x.png",
        "javascript:alert(1)",
    ],
)
def test_unsupported_schemes_are_rejected(fetcher, url):
    with pytest.raises(URLFetchError) as exc:
        fetcher.validate_url(url)
    assert exc.value.code == "INVALID_SCHEME"


def test_credentials_in_url_are_rejected(fetcher):
    with pytest.raises(URLFetchError) as exc:
        fetcher.validate_url("https://user:pass@example.com/x.png")
    assert exc.value.code == "INVALID_URL"


def test_private_ip_ranges_detected():
    assert _is_blocked_ip("127.0.0.1") is True
    assert _is_blocked_ip("10.0.0.1") is True
    assert _is_blocked_ip("169.254.169.254") is True
    assert _is_blocked_ip("::1") is True
    assert _is_blocked_ip("::ffff:10.0.0.1") is True
    assert _is_blocked_ip("8.8.8.8") is False
    assert _is_blocked_ip("2606:4700:4700::1111") is False


def test_redirect_to_a_blocked_host_is_revalidated(fetcher, monkeypatch):
    calls = []

    def fake_get(url, **kwargs):
        calls.append(url)
        return FakeResponse(
            status_code=302,
            headers={"Location": "http://169.254.169.254/latest/meta-data"},
            url=url,
        )

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    buffer, content_type, error = fetcher.fetch("https://example.com/a.png")
    assert buffer is None and content_type is None
    assert error == "Access to this address is not allowed"
    assert len(calls) == 1


def test_redirect_loop_is_limited(fetcher, monkeypatch):
    def fake_get(url, **kwargs):
        return FakeResponse(status_code=302, headers={"Location": "/again"}, url=url)

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    _buffer, _content_type, error = fetcher.fetch("https://example.com/a.png")
    assert error == "The URL redirected too many times"


def test_declared_content_length_is_enforced(fetcher, monkeypatch):
    monkeypatch.setattr(module, "MAX_SIZE", 1024)

    def fake_get(url, **kwargs):
        return FakeResponse(headers={"Content-Type": "image/png", "Content-Length": "2048"})

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    _buffer, _content_type, error = fetcher.fetch("https://example.com/a.png")
    assert error and "limit" in error


def test_streamed_download_is_capped(fetcher, monkeypatch):
    monkeypatch.setattr(module, "MAX_SIZE", 1024)

    def fake_get(url, **kwargs):
        return FakeResponse(headers={"Content-Type": "image/png"}, chunks=[b"x" * 600, b"x" * 600])

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    _buffer, _content_type, error = fetcher.fetch("https://example.com/a.png")
    assert error and "limit" in error


def test_non_image_content_type_is_rejected(fetcher, monkeypatch):
    def fake_get(url, **kwargs):
        return FakeResponse(headers={"Content-Type": "text/html"}, chunks=[b"<html></html>"])

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    _buffer, _content_type, error = fetcher.fetch("https://example.com/a.png")
    assert error == "The URL does not point to a supported image"


def test_image_content_type_with_invalid_bytes_is_rejected(fetcher, monkeypatch):
    def fake_get(url, **kwargs):
        return FakeResponse(headers={"Content-Type": "image/png"}, chunks=[b"not an image"])

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    _buffer, _content_type, error = fetcher.fetch("https://example.com/a.png")
    assert error


def test_valid_image_is_returned_as_a_buffer(fetcher, monkeypatch):
    data = png_bytes(size=(40, 30))

    def fake_get(url, **kwargs):
        return FakeResponse(
            headers={"Content-Type": "image/png", "Content-Length": str(len(data))},
            chunks=[data],
        )

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    buffer, content_type, error = fetcher.fetch("https://example.com/a.png")
    assert error is None
    assert content_type == "image/png"
    assert buffer is not None
    assert buffer.read() == data


def test_http_error_is_reported_without_leaking_the_url(fetcher, monkeypatch):
    def fake_get(url, **kwargs):
        return FakeResponse(status_code=403)

    monkeypatch.setattr(fetcher.session, "get", fake_get)
    _buffer, _content_type, error = fetcher.fetch("https://example.com/private/secret.png?token=abc")
    assert error == "The image host returned HTTP 403"
    assert "token" not in error
