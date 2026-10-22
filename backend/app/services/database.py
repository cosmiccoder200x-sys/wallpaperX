"""PostgreSQL access layer.

The optimizer must remain usable when PostgreSQL is not configured (see
instructions.md), so every failure to reach the database is translated into
``DatabaseUnavailable``. Endpoints that genuinely need persistent data return a
structured 503 instead of fabricated content.
"""

import logging
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool

from app.config import config
from app.models import ImageFormat, Optimization, PlanType, User, Wallpaper

logger = logging.getLogger(__name__)

_pool: Optional[SimpleConnectionPool] = None
_pool_lock = threading.Lock()


class DatabaseUnavailable(RuntimeError):
    """Raised when PostgreSQL is not configured or cannot be reached."""


def get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is not None:
        return _pool

    if not config.DATABASE_URL.strip():
        raise DatabaseUnavailable("DATABASE_URL is not configured")

    with _pool_lock:
        if _pool is None:
            try:
                _pool = SimpleConnectionPool(
                    minconn=1,
                    maxconn=10,
                    dsn=config.DATABASE_URL,
                    cursor_factory=RealDictCursor,
                    connect_timeout=5,
                )
            except psycopg2.Error as exc:
                raise DatabaseUnavailable("PostgreSQL is unavailable") from exc
    return _pool


def get_connection():
    try:
        return get_pool().getconn()
    except psycopg2.Error as exc:
        raise DatabaseUnavailable("PostgreSQL is unavailable") from exc


def release_connection(conn):
    try:
        get_pool().putconn(conn)
    except Exception:  # pool already closed
        pass


def database_available() -> bool:
    try:
        row = execute_one("SELECT 1 AS ok")
        return bool(row)
    except DatabaseUnavailable:
        return False
    except Exception:
        return False


def execute_query(query: str, params: tuple = None, fetch: bool = True):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            if fetch:
                return cur.fetchall()
            conn.commit()
            return cur.rowcount
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailable("Database query failed") from exc
    finally:
        release_connection(conn)


def execute_one(query: str, params: tuple = None, fetch: bool = True):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            if not fetch:
                conn.commit()
                return cur.rowcount
            if cur.description is None:
                conn.commit()
                return None
            return cur.fetchone()
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailable("Database query failed") from exc
    finally:
        release_connection(conn)


SCHEMA_PATH = Path(__file__).resolve().parents[3] / "database" / "schema.sql"


def init_db() -> None:
    """Create the schema when it is absent. Safe to call on every boot."""
    try:
        row = execute_one("SELECT to_regclass('public.users') AS table_name")
    except DatabaseUnavailable:
        raise
    if row and row.get("table_name"):
        return

    if not SCHEMA_PATH.exists():
        logger.warning("Schema file not found at %s, skipping initialization", SCHEMA_PATH)
        return

    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(schema)
        conn.commit()
        logger.info("Database schema initialized")
    except psycopg2.Error as exc:
        conn.rollback()
        raise DatabaseUnavailable("Database schema initialization failed") from exc
    finally:
        release_connection(conn)


# --------------------------------------------------------------------- users
def create_user(
    email: str,
    name: str = None,
    plan: PlanType = PlanType.FREE,
    password_hash: Optional[str] = None,
) -> User:
    query = """
        INSERT INTO users (email, name, plan, password_hash)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
            updated_at = NOW()
        RETURNING *
    """
    row = execute_one(query, (email, name, plan.value, password_hash))
    return _row_to_user(row)


def get_user_by_id(user_id: UUID) -> Optional[User]:
    row = execute_one("SELECT * FROM users WHERE id = %s", (str(user_id),))
    return _row_to_user(row) if row else None


def get_user_by_email(email: str) -> Optional[User]:
    row = execute_one("SELECT * FROM users WHERE email = %s", (email,))
    return _row_to_user(row) if row else None


def get_user_password_hash(email: str) -> Optional[str]:
    row = execute_one("SELECT password_hash FROM users WHERE email = %s", (email,))
    return row["password_hash"] if row else None


def update_user_plan(user_id: UUID, plan: PlanType) -> Optional[User]:
    query = "UPDATE users SET plan = %s, updated_at = NOW() WHERE id = %s RETURNING *"
    row = execute_one(query, (plan.value, str(user_id)))
    return _row_to_user(row) if row else None


def increment_optimization_count(user_id: UUID) -> int:
    today = date.today()
    query = """
        UPDATE users
        SET daily_optimizations = CASE
            WHEN last_optimization_date = %s THEN daily_optimizations + 1
            ELSE 1
        END,
        last_optimization_date = %s,
        updated_at = NOW()
        WHERE id = %s
        RETURNING daily_optimizations
    """
    row = execute_one(query, (today, today, str(user_id)))
    return row["daily_optimizations"] if row else 0


def get_user_daily_optimizations(user_id: UUID) -> int:
    row = execute_one(
        "SELECT daily_optimizations, last_optimization_date FROM users WHERE id = %s",
        (str(user_id),),
    )
    if not row:
        return 0
    if row["last_optimization_date"] != date.today():
        return 0
    return row["daily_optimizations"]


# ---------------------------------------------------------------- wallpapers
def create_wallpaper(wallpaper: Wallpaper) -> Wallpaper:
    query = """
        INSERT INTO wallpapers (title, slug, description, category, image_url, thumbnail_url,
                               width, height, format, file_size, downloads, is_published)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    row = execute_one(
        query,
        (
            wallpaper.title,
            wallpaper.slug,
            wallpaper.description,
            wallpaper.category,
            wallpaper.image_url,
            wallpaper.thumbnail_url,
            wallpaper.width,
            wallpaper.height,
            wallpaper.format.value,
            wallpaper.file_size,
            wallpaper.downloads,
            wallpaper.is_published,
        ),
    )
    return _row_to_wallpaper(row)


def get_wallpaper_by_slug(slug: str) -> Optional[Wallpaper]:
    row = execute_one(
        "SELECT * FROM wallpapers WHERE slug = %s AND is_published = true", (slug,)
    )
    return _row_to_wallpaper(row) if row else None


def get_wallpaper_by_id(wallpaper_id: UUID) -> Optional[Wallpaper]:
    row = execute_one("SELECT * FROM wallpapers WHERE id = %s", (str(wallpaper_id),))
    return _row_to_wallpaper(row) if row else None


def list_wallpapers(
    category: str = None,
    limit: int = 20,
    offset: int = 0,
    published_only: bool = True,
) -> List[Wallpaper]:
    conditions = []
    params: List[Any] = []

    if published_only:
        conditions.append("is_published = true")
    if category:
        conditions.append("category = %s")
        params.append(category)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    query = f"""
        SELECT * FROM wallpapers
        {where_clause}
        ORDER BY downloads DESC, created_at DESC
        LIMIT %s OFFSET %s
    """
    params.extend([max(1, min(int(limit), 100)), max(0, int(offset))])

    rows = execute_query(query, tuple(params))
    return [_row_to_wallpaper(row) for row in rows]


def count_wallpapers(category: str = None, published_only: bool = True) -> int:
    conditions = []
    params: List[Any] = []
    if published_only:
        conditions.append("is_published = true")
    if category:
        conditions.append("category = %s")
        params.append(category)
    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    row = execute_one(
        f"SELECT COUNT(*) AS count FROM wallpapers {where_clause}", tuple(params)
    )
    return int(row["count"]) if row else 0


def list_categories() -> List[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT category, COUNT(*) as count
        FROM wallpapers
        WHERE is_published = true
        GROUP BY category
        ORDER BY count DESC
        """
    )
    return [
        {
            "name": row["category"],
            "count": row["count"],
            "slug": row["category"].lower().replace(" ", "-"),
        }
        for row in rows
    ]


def update_wallpaper(wallpaper_id: UUID, **kwargs) -> Optional[Wallpaper]:
    if not kwargs:
        return get_wallpaper_by_id(wallpaper_id)

    allowed = {
        "title",
        "description",
        "category",
        "image_url",
        "thumbnail_url",
        "width",
        "height",
        "format",
        "file_size",
        "is_published",
    }
    fields = [key for key in kwargs if key in allowed]
    if not fields:
        return get_wallpaper_by_id(wallpaper_id)

    set_clause = ", ".join([f"{key} = %s" for key in fields])
    params = [kwargs[key] for key in fields] + [str(wallpaper_id)]
    query = f"UPDATE wallpapers SET {set_clause}, updated_at = NOW() WHERE id = %s RETURNING *"
    row = execute_one(query, tuple(params))
    return _row_to_wallpaper(row) if row else None


def delete_wallpaper(wallpaper_id: UUID) -> bool:
    count = execute_one(
        "DELETE FROM wallpapers WHERE id = %s", (str(wallpaper_id),), fetch=False
    )
    return count > 0


def increment_wallpaper_downloads(wallpaper_id: UUID) -> int:
    query = """
        UPDATE wallpapers SET downloads = downloads + 1, updated_at = NOW()
        WHERE id = %s RETURNING downloads
    """
    row = execute_one(query, (str(wallpaper_id),))
    return row["downloads"] if row else 0


def record_download(wallpaper_id: UUID, user_id: Optional[UUID], ip_hash: str) -> None:
    execute_one(
        """
        INSERT INTO downloads (wallpaper_id, user_id, ip_hash)
        VALUES (%s, %s, %s)
        """,
        (str(wallpaper_id), str(user_id) if user_id else None, ip_hash),
        fetch=False,
    )


# ------------------------------------------------------------- optimizations
def create_optimization(
    *,
    user_id: Optional[UUID],
    original_filename: str,
    original_size: int,
    original_width: int,
    original_height: int,
    original_format: ImageFormat,
    output_size: int,
    output_width: int,
    output_height: int,
    output_format: ImageFormat,
    target_size: int,
    quality_used: Optional[int],
    processing_time_ms: int,
) -> Optional[Optimization]:
    query = """
        INSERT INTO optimizations (user_id, original_filename, original_size, original_width,
                                  original_height, original_format, output_size, output_width,
                                  output_height, output_format, target_size, quality_used,
                                  processing_time_ms)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    row = execute_one(
        query,
        (
            str(user_id) if user_id else None,
            original_filename[:255],
            original_size,
            original_width,
            original_height,
            original_format.value,
            output_size,
            output_width,
            output_height,
            output_format.value,
            target_size,
            quality_used,
            processing_time_ms,
        ),
    )
    return _row_to_optimization(row) if row else None


def get_optimization_history(
    user_id: UUID, limit: int = 50, offset: int = 0
) -> List[Optimization]:
    rows = execute_query(
        "SELECT * FROM optimizations WHERE user_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (str(user_id), max(1, min(int(limit), 100)), max(0, int(offset))),
    )
    return [_row_to_optimization(row) for row in rows]


def get_optimization_by_id(opt_id: UUID) -> Optional[Optimization]:
    row = execute_one("SELECT * FROM optimizations WHERE id = %s", (str(opt_id),))
    return _row_to_optimization(row) if row else None


# --------------------------------------------------------------- admin stats
def get_admin_stats() -> Dict[str, Any]:
    stats = {}
    stats["total_users"] = execute_one("SELECT COUNT(*) as count FROM users")["count"]
    stats["total_optimizations"] = execute_one(
        "SELECT COUNT(*) as count FROM optimizations"
    )["count"]
    stats["total_downloads"] = execute_one("SELECT COUNT(*) as count FROM downloads")[
        "count"
    ]
    stats["total_wallpapers"] = execute_one(
        "SELECT COUNT(*) as count FROM wallpapers WHERE is_published = true"
    )["count"]
    stats["total_storage_bytes"] = execute_one(
        "SELECT COALESCE(SUM(file_size), 0) as total FROM wallpapers"
    )["total"]

    today = date.today()
    stats["daily_active_users"] = execute_one(
        "SELECT COUNT(DISTINCT user_id) as count FROM optimizations WHERE DATE(created_at) = %s",
        (today,),
    )["count"]
    stats["daily_optimizations"] = execute_one(
        "SELECT COUNT(*) as count FROM optimizations WHERE DATE(created_at) = %s",
        (today,),
    )["count"]
    stats["daily_downloads"] = execute_one(
        "SELECT COUNT(*) as count FROM downloads WHERE DATE(created_at) = %s",
        (today,),
    )["count"]
    return stats


def get_daily_stats(days: int = 30) -> List[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT date, active_users, total_optimizations, total_bytes_saved, avg_compression_pct
        FROM daily_stats
        WHERE date >= CURRENT_DATE - (%s * INTERVAL '1 day')
        ORDER BY date DESC
        """,
        (max(1, min(int(days), 365)),),
    )
    return [dict(row) for row in rows]


def get_popular_wallpapers(limit: int = 20) -> List[Wallpaper]:
    rows = execute_query(
        "SELECT * FROM wallpapers WHERE is_published = true ORDER BY downloads DESC LIMIT %s",
        (max(1, min(int(limit), 100)),),
    )
    return [_row_to_wallpaper(row) for row in rows]


# ------------------------------------------------------------------- helpers
def _field(row: dict, name: str, default=None):
    return row[name] if name in row else default


def _row_to_user(row: dict) -> User:
    return User(
        id=UUID(str(row["id"])),
        email=row["email"],
        name=_field(row, "name"),
        avatar_url=_field(row, "avatar_url"),
        plan=PlanType(row["plan"]),
        is_active=_field(row, "is_active", True),
        daily_optimizations=_field(row, "daily_optimizations", 0),
        last_optimization_date=_field(row, "last_optimization_date"),
        created_at=_field(row, "created_at"),
        updated_at=_field(row, "updated_at"),
    )


def _row_to_wallpaper(row: dict) -> Wallpaper:
    return Wallpaper(
        id=UUID(str(row["id"])),
        title=row["title"],
        slug=row["slug"],
        description=_field(row, "description"),
        category=row["category"],
        image_url=row["image_url"],
        thumbnail_url=row["thumbnail_url"],
        width=row["width"],
        height=row["height"],
        format=ImageFormat(row["format"]),
        file_size=row["file_size"],
        downloads=_field(row, "downloads", 0),
        is_published=_field(row, "is_published", False),
        created_at=_field(row, "created_at"),
        updated_at=_field(row, "updated_at"),
    )


def _row_to_optimization(row: dict) -> Optimization:
    return Optimization(
        id=UUID(str(row["id"])),
        user_id=UUID(str(row["user_id"])) if row["user_id"] else None,
        original_filename=row["original_filename"],
        original_size=row["original_size"],
        original_width=row["original_width"],
        original_height=row["original_height"],
        original_format=ImageFormat(row["original_format"]),
        output_size=row["output_size"],
        output_width=row["output_width"],
        output_height=row["output_height"],
        output_format=ImageFormat(row["output_format"]),
        target_size=row["target_size"],
        quality_used=_field(row, "quality_used"),
        processing_time_ms=_field(row, "processing_time_ms"),
        created_at=_field(row, "created_at"),
    )
