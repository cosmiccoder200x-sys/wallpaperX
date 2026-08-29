import io
import re
import logging
import requests
from typing import Tuple, Optional, BinaryIO
from urllib.parse import urlparse
import ipaddress
from app.config import config
from app.services.image_optimizer import validate_image, format_bytes

logger = logging.getLogger(__name__)

BLOCKED_IP_RANGES = [
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('169.254.0.0/16'),
    ipaddress.ip_network('::1/128'),
    ipaddress.ip_network('fe80::/10'),
    ipaddress.ip_network('fc00::/7'),
]

METADATA_ENDPOINTS = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.azure.com',
    '169.254.169.254:80',
    '[::1]:80',
]

ALLOWED_SCHEMES = {'http', 'https'}
ALLOWED_CONTENT_TYPES = {
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'
}
MAX_REDIRECTS = config.URL_MAX_REDIRECTS
TIMEOUT = config.URL_TIMEOUT
MAX_SIZE = config.url_max_bytes


class SSRFError(Exception):
    pass


class URLFetcher:
    def __init__(self):
        self.session = requests.Session()
        self.session.max_redirects = MAX_REDIRECTS
        self.session.headers.update({
            'User-Agent': 'Wallpaper10/1.0 (+https://x.com)'
        })

    def fetch(self, url: str) -> Tuple[Optional[BinaryIO], Optional[str], Optional[str]]:
        validation_error = self._validate_url(url)
        if validation_error:
            return None, None, validation_error
        
        try:
            response = self.session.get(
                url,
                timeout=TIMEOUT,
                stream=True,
                allow_redirects=True
            )
            
            final_url = response.url
            redirect_validation = self._validate_url(final_url)
            if redirect_validation:
                return None, None, f"Redirect to blocked URL: {redirect_validation}"
            
            content_type = response.headers.get('Content-Type', '').lower().split(';')[0]
            if content_type not in ALLOWED_CONTENT_TYPES:
                return None, None, f"Unsupported content type: {content_type}"
            
            content_length = response.headers.get('Content-Length')
            if content_length and int(content_length) > MAX_SIZE:
                return None, None, f"File too large: {format_bytes(int(content_length))}"
            
            buffer = io.BytesIO()
            downloaded = 0
            
            for chunk in response.iter_content(chunk_size=8192):
                downloaded += len(chunk)
                if downloaded > MAX_SIZE:
                    return None, None, f"Download exceeds size limit of {config.URL_MAX_SIZE_MB} MB"
                buffer.write(chunk)
            
            buffer.seek(0)
            
            is_valid, error, code = validate_image(buffer, MAX_SIZE)
            if not is_valid:
                return None, None, error
            
            return buffer, content_type, None
            
        except requests.exceptions.Timeout:
            return None, None, "Request timed out"
        except requests.exceptions.TooManyRedirects:
            return None, None, "Too many redirects"
        except requests.exceptions.SSLError:
            return None, None, "SSL certificate verification failed"
        except requests.exceptions.ConnectionError:
            return None, None, "Could not connect to the URL"
        except Exception as e:
            logger.error(f"URL fetch failed: {e}")
            return None, None, f"Failed to fetch URL: {str(e)}"

    def _validate_url(self, url: str) -> Optional[str]:
        try:
            parsed = urlparse(url)
        except Exception:
            return "Invalid URL format"
        
        if parsed.scheme not in ALLOWED_SCHEMES:
            return f"Scheme '{parsed.scheme}' not allowed"
        
        hostname = parsed.hostname
        if not hostname:
            return "No hostname in URL"
        
        if self._is_blocked_host(hostname):
            return "Access to this host is blocked"
        
        if self._is_metadata_endpoint(hostname):
            return "Access to metadata endpoints is blocked"
        
        if self._is_private_ip(hostname):
            return "Access to private IP addresses is blocked"
        
        return None

    def _is_blocked_host(self, hostname: str) -> bool:
        blocked = ['localhost', 'localhost.localdomain', 'local']
        return hostname.lower() in blocked

    def _is_metadata_endpoint(self, hostname: str) -> bool:
        return hostname in METADATA_ENDPOINTS

    def _is_private_ip(self, hostname: str) -> bool:
        try:
            ip = ipaddress.ip_address(hostname)
            return any(ip in network for network in BLOCKED_IP_RANGES)
        except ValueError:
            try:
                ips = [ipaddress.ip_address(ip) for ip in 
                       __import__('socket').getaddrinfo(hostname, None)]
                return any(any(ip in network for network in BLOCKED_IP_RANGES) 
                          for ip in ips)
            except Exception:
                return False


url_fetcher = URLFetcher()