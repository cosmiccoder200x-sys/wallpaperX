"""SSRF-safe remote image fetcher.

Protections:
* only http/https, no credentials in the URL;
* hostnames are resolved once and every resolved address is checked against a
  blocklist (loopback, private, CGNAT, link-local, multicast, reserved, IPv6
  equivalents and IPv4-mapped IPv6);
* the validated addresses are pinned for the actual connection, closing the
  DNS-rebinding window between validation and connect;
* redirects are followed manually and every hop is re-validated and re-pinned;
* connect/read timeouts and a streamed maximum download size;
* the downloaded bytes - not the Content-Type header - must decode as a
  supported image.

Error messages are deliberately generic; URLs and resolved addresses are never
returned to the client or written to logs.
"""

import contextlib
import io
import ipaddress
import logging
import socket
import threading
from typing import BinaryIO, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests

from app.config import config
from app.services.image_optimizer import format_bytes, validate_image

logger = logging.getLogger(__name__)

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::ffff:0:0/96"),
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("100::/64"),
    ipaddress.ip_network("2001:db8::/32"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("ff00::/8"),
]

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "localhost6",
    "metadata",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
    "metadata.azure.com",
}

BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa", ".lan")

ALLOWED_SCHEMES = {"http", "https"}
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/avif",
    "application/octet-stream",
    "binary/octet-stream",
}

MAX_REDIRECTS = max(0, config.URL_MAX_REDIRECTS)
CONNECT_TIMEOUT = config.URL_CONNECT_TIMEOUT
READ_TIMEOUT = config.URL_TIMEOUT
MAX_SIZE = config.url_max_bytes
CHUNK_SIZE = 64 * 1024


class URLFetchError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# --------------------------------------------------------------------------
# Thread-local DNS pinning
# --------------------------------------------------------------------------
_resolver_state = threading.local()
_real_getaddrinfo = socket.getaddrinfo


def _guarded_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    mapping = getattr(_resolver_state, "mapping", None)
    try:
        key = host.decode("ascii") if isinstance(host, bytes) else str(host)
    except Exception:
        key = str(host)
    key = key.lower().rstrip(".")

    if mapping and key in mapping:
        results = []
        for address in mapping[key]:
            ip = ipaddress.ip_address(address)
            sockaddr = (
                (str(ip), port, 0, 0)
                if ip.version == 6
                else (str(ip), port)
            )
            results.append(
                (
                    socket.AF_INET6 if ip.version == 6 else socket.AF_INET,
                    type or socket.SOCK_STREAM,
                    proto or socket.IPPROTO_TCP,
                    "",
                    sockaddr,
                )
            )
        return results

    return _real_getaddrinfo(host, port, family, type, proto, flags)


socket.getaddrinfo = _guarded_getaddrinfo


@contextlib.contextmanager
def _pin_host(host: str, addresses: List[str]):
    previous = getattr(_resolver_state, "mapping", None)
    _resolver_state.mapping = {host.lower().rstrip("."): addresses}
    try:
        yield
    finally:
        _resolver_state.mapping = previous


def _is_blocked_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return True

    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped:
            return _is_blocked_ip(str(ip.ipv4_mapped))
        if ip.sixtofour:
            return _is_blocked_ip(str(ip.sixtofour))

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True

    return any(ip in network for network in BLOCKED_NETWORKS)


def _validate_hostname(host: str) -> None:
    lowered = host.lower().rstrip(".")
    if not lowered or len(lowered) > 253:
        raise URLFetchError("INVALID_URL", "The URL host is invalid")
    if "%" in lowered:
        raise URLFetchError("INVALID_URL", "The URL host is invalid")
    if lowered in BLOCKED_HOSTNAMES:
        raise URLFetchError("URL_BLOCKED", "Access to this host is not allowed")
    if any(lowered.endswith(suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        raise URLFetchError("URL_BLOCKED", "Access to this host is not allowed")


def _resolve(host: str, port: int) -> List[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise URLFetchError("URL_UNRESOLVABLE", "The image host could not be resolved") from exc
    except OSError as exc:
        raise URLFetchError("URL_UNRESOLVABLE", "The image host could not be resolved") from exc

    addresses = []
    for info in infos:
        sockaddr = info[4]
        address = str(sockaddr[0]).split("%")[0]
        if address not in addresses:
            addresses.append(address)
    if not addresses:
        raise URLFetchError("URL_UNRESOLVABLE", "The image host could not be resolved")
    return addresses


class URLFetcher:
    def __init__(self):
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.max_redirects = MAX_REDIRECTS + 1
        self.session.headers.update(
            {
                "User-Agent": "WallpaperX/1.0 (+https://wallpaperx.app)",
                "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
            }
        )

    # ------------------------------------------------------------- validation
    def validate_url(self, url: str) -> Tuple[str, str, List[str]]:
        """Return ``(normalized_url, hostname, addresses)`` or raise URLFetchError."""
        if not isinstance(url, str) or not url.strip():
            raise URLFetchError("NO_URL", "Please provide an image URL")
        if len(url) > 2048:
            raise URLFetchError("INVALID_URL", "The URL is too long")

        parsed = urlparse(url.strip())
        if parsed.scheme.lower() not in ALLOWED_SCHEMES:
            raise URLFetchError(
                "INVALID_SCHEME", "Only http:// and https:// URLs are supported"
            )
        if parsed.username or parsed.password:
            raise URLFetchError("INVALID_URL", "URLs with credentials are not allowed")
        if not parsed.hostname:
            raise URLFetchError("INVALID_URL", "The URL is missing a host")

        try:
            port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
        except ValueError as exc:
            raise URLFetchError("INVALID_URL", "The URL contains an invalid port") from exc
        if port <= 0:
            raise URLFetchError("INVALID_URL", "The URL contains an invalid port")

        hostname = parsed.hostname.lower().rstrip(".")
        _validate_hostname(hostname)

        # IP literal? Validate directly; never trust the textual form.
        try:
            ip = ipaddress.ip_address(hostname)
        except ValueError:
            ip = None

        if ip is not None:
            if _is_blocked_ip(str(ip)):
                raise URLFetchError("URL_BLOCKED", "Access to this address is not allowed")
            addresses = [str(ip)]
        else:
            addresses = _resolve(hostname, port)
            for address in addresses:
                if _is_blocked_ip(address):
                    raise URLFetchError(
                        "URL_BLOCKED", "Access to this host is not allowed"
                    )

        normalized = parsed._replace(scheme=parsed.scheme.lower()).geturl()
        return normalized, hostname, addresses

    # ------------------------------------------------------------------ fetch
    def fetch(
        self, url: str
    ) -> Tuple[Optional[BinaryIO], Optional[str], Optional[str]]:
        """Fetch and validate a remote image.

        Returns ``(buffer, content_type, error_message)``. On failure the first
        two values are None and the error message is safe to show to the user.
        """
        try:
            buffer, content_type = self._fetch(url)
            return buffer, content_type, None
        except URLFetchError as exc:
            logger.info("URL fetch rejected: %s", exc.code)
            return None, None, exc.message
        except requests.exceptions.Timeout:
            logger.info("URL fetch timed out")
            return None, None, "The image host did not respond in time"
        except requests.exceptions.SSLError:
            logger.info("URL fetch TLS failure")
            return None, None, "The image host's TLS certificate could not be verified"
        except requests.exceptions.ConnectionError:
            logger.info("URL fetch connection failure")
            return None, None, "Could not connect to the image host"
        except Exception as exc:
            logger.error("URL fetch failed: %s", type(exc).__name__)
            return None, None, "The image could not be downloaded"

    def _fetch(self, url: str) -> Tuple[io.BytesIO, str]:
        current_url = url
        response = None

        for _hop in range(MAX_REDIRECTS + 1):
            normalized, hostname, addresses = self.validate_url(current_url)
            try:
                with _pin_host(hostname, addresses):
                    response = self.session.get(
                        normalized,
                        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                        stream=True,
                        allow_redirects=False,
                    )
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("Location")
                        if not location:
                            raise URLFetchError(
                                "URL_FETCH_FAILED",
                                "The image host returned an invalid redirect",
                            )
                        current_url = urljoin(normalized, location)
                        response.close()
                        response = None
                        continue

                    if response.status_code != 200:
                        raise URLFetchError(
                            "URL_FETCH_FAILED",
                            f"The image host returned HTTP {response.status_code}",
                        )

                    content_type = (
                        response.headers.get("Content-Type", "").split(";")[0].strip().lower()
                    )
                    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
                        raise URLFetchError(
                            "UNSUPPORTED_CONTENT_TYPE",
                            "The URL does not point to a supported image",
                        )

                    content_length = response.headers.get("Content-Length")
                    if content_length:
                        try:
                            if int(content_length) > MAX_SIZE:
                                raise URLFetchError(
                                    "FILE_TOO_LARGE",
                                    f"The remote file exceeds the {config.URL_MAX_SIZE_MB} MB limit",
                                )
                        except ValueError:
                            pass

                    buffer = io.BytesIO()
                    downloaded = 0
                    for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                        if not chunk:
                            continue
                        downloaded += len(chunk)
                        if downloaded > MAX_SIZE:
                            raise URLFetchError(
                                "FILE_TOO_LARGE",
                                f"The remote file exceeds the {config.URL_MAX_SIZE_MB} MB limit",
                            )
                        buffer.write(chunk)

                    buffer.seek(0)
                    is_valid, error, _code = validate_image(buffer, MAX_SIZE)
                    if not is_valid:
                        raise URLFetchError(
                            "INVALID_IMAGE",
                            error or "The downloaded file is not a supported image",
                        )
                    buffer.seek(0)
                    return buffer, content_type
            finally:
                if response is not None:
                    response.close()
                    response = None

        raise URLFetchError("TOO_MANY_REDIRECTS", "The URL redirected too many times")


url_fetcher = URLFetcher()
