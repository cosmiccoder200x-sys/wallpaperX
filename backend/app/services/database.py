import os
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import UUID, uuid4
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from app.config import config
from app.models import User, Wallpaper, Optimization, PlanType, ImageFormat, PlanLimits

logger = logging.getLogger(__name__)

_pool: Optional[SimpleConnectionPool] = None


def get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=config.DATABASE_URL,
            cursor_factory=RealDictCursor
        )
    return _pool


def get_connection():
    return get_pool().getconn()


def release_connection(conn):
    get_pool().putconn(conn)


def execute_query(query: str, params: tuple = None, fetch: bool = True):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            if fetch:
                return cur.fetchall()
            conn.commit()
            return cur.rowcount
    except Exception as e:
        conn.rollback()
        logger.error(f"Query failed: {query}, params: {params}, error: {e}")
        raise
    finally:
        release_connection(conn)


def execute_one(query: str, params: tuple = None):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            conn.commit()
            return cur.fetchone()
    except Exception as e:
        conn.rollback()
        logger.error(f"Query failed: {query}, params: {params}, error: {e}")
        raise
    finally:
        release_connection(conn)


def init_db():
    try:
        with open('database/schema.sql', 'r') as f:
            schema = f.read()
        
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(schema)
            conn.commit()
            logger.info("Database initialized successfully")
        finally:
            release_connection(conn)
    except FileNotFoundError:
        logger.warning("Schema file not found, skipping initialization")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise


# User operations
def create_user(email: str, name: str = None, plan: PlanType = PlanType.FREE) -> User:
    query = """
        INSERT INTO users (email, name, plan)
        VALUES (%s, %s, %s)
        ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = NOW()
        RETURNING *
    """
    row = execute_one(query, (email, name, plan.value))
    return _row_to_user(row)


def get_user_by_id(user_id: UUID) -> Optional[User]:
    row = execute_one("SELECT * FROM users WHERE id = %s", (str(user_id),))
    return _row_to_user(row) if row else None


def get_user_by_email(email: str) -> Optional[User]:
    row = execute_one("SELECT * FROM users WHERE email = %s", (email,))
    return _row_to_user(row) if row else None


def update_user_plan(user_id: UUID, plan: PlanType) -> User:
    query = "UPDATE users SET plan = %s, updated_at = NOW() WHERE id = %s RETURNING *"
    row = execute_one(query, (plan.value, str(user_id)))
    return _row_to_user(row)


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
    return row['daily_optimizations'] if row else 0


def get_user_daily_optimizations(user_id: UUID) -> int:
    row = execute_one(
        "SELECT daily_optimizations, last_optimization_date FROM users WHERE id = %s",
        (str(user_id),)
    )
    if not row:
        return 0
    if row['last_optimization_date'] != date.today():
        return 0
    return row['daily_optimizations']


# Wallpaper operations
def create_wallpaper(wallpaper: Wallpaper) -> Wallpaper:
    query = """
        INSERT INTO wallpapers (title, slug, description, category, image_url, thumbnail_url,
                               width, height, format, file_size, downloads, is_published)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    row = execute_one(query, (
        wallpaper.title, wallpaper.slug, wallpaper.description, wallpaper.category,
        wallpaper.image_url, wallpaper.thumbnail_url, wallpaper.width, wallpaper.height,
        wallpaper.format.value, wallpaper.file_size, wallpaper.downloads, wallpaper.is_published
    ))
    return _row_to_wallpaper(row)


def get_wallpaper_by_slug(slug: str) -> Optional[Wallpaper]:
    row = execute_one("SELECT * FROM wallpapers WHERE slug = %s AND is_published = true", (slug,))
    return _row_to_wallpaper(row) if row else None


def get_wallpaper_by_id(wallpaper_id: UUID) -> Optional[Wallpaper]:
    row = execute_one("SELECT * FROM wallpapers WHERE id = %s", (str(wallpaper_id),))
    return _row_to_wallpaper(row) if row else None


def list_wallpapers(
    category: str = None, 
    limit: int = 20, 
    offset: int = 0,
    published_only: bool = True
) -> List[Wallpaper]:
    conditions = []
    params = []
    
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
    params.extend([limit, offset])
    
    rows = execute_query(query, tuple(params))
    return [_row_to_wallpaper(row) for row in rows]


def update_wallpaper(wallpaper_id: UUID, **kwargs) -> Optional[Wallpaper]:
    if not kwargs:
        return get_wallpaper_by_id(wallpaper_id)
    
    set_clause = ", ".join([f"{k} = %s" for k in kwargs.keys()])
    params = list(kwargs.values()) + [str(wallpaper_id)]
    
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
    return row['downloads'] if row else 0


def record_download(wallpaper_id: UUID, user_id: Optional[UUID], ip_hash: str):
    query = """
        INSERT INTO downloads (wallpaper_id, user_id, ip_hash)
        VALUES (%s, %s, %s)
    """
    execute_one(query, (str(wallpaper_id), str(user_id) if user_id else None, ip_hash), fetch=False)


# Optimization operations
def create_optimization(opt: Optimization) -> Optimization:
    query = """
        INSERT INTO optimizations (user_id, original_filename, original_size, original_width,
                                  original_height, original_format, output_size, output_width,
                                  output_height, output_format, target_size, quality_used,
                                  processing_time_ms)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    row = execute_one(query, (
        str(opt.user_id) if opt.user_id else None,
        opt.original_filename, opt.original_size, opt.original_width, opt.original_height,
        opt.original_format.value, opt.output_size, opt.output_width, opt.output_height,
        opt.output_format.value, opt.target_size, opt.quality_used, opt.processing_time_ms
    ))
    return _row_to_optimization(row)


def get_optimization_history(user_id: UUID, limit: int = 50, offset: int = 0) -> List[Optimization]:
    rows = execute_query(
        "SELECT * FROM optimizations WHERE user_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (str(user_id), limit, offset)
    )
    return [_row_to_optimization(row) for row in rows]


def get_optimization_by_id(opt_id: UUID) -> Optional[Optimization]:
    row = execute_one("SELECT * FROM optimizations WHERE id = %s", (str(opt_id),))
    return _row_to_optimization(row) if row else None


# Admin stats
def get_admin_stats() -> Dict[str, Any]:
    stats = {}
    
    stats['total_users'] = execute_one("SELECT COUNT(*) as count FROM users")['count']
    stats['total_optimizations'] = execute_one("SELECT COUNT(*) as count FROM optimizations")['count']
    stats['total_downloads'] = execute_one("SELECT COUNT(*) as count FROM downloads")['count']
    stats['total_wallpapers'] = execute_one("SELECT COUNT(*) as count FROM wallpapers WHERE is_published = true")['count']
    stats['total_storage_bytes'] = execute_one("SELECT COALESCE(SUM(file_size), 0) as total FROM wallpapers")['total']
    
    today = date.today()
    stats['daily_active_users'] = execute_one(
        "SELECT COUNT(DISTINCT user_id) as count FROM optimizations WHERE DATE(created_at) = %s",
        (today,)
    )['count']
    
    stats['daily_optimizations'] = execute_one(
        "SELECT COUNT(*) as count FROM optimizations WHERE DATE(created_at) = %s",
        (today,)
    )['count']
    
    stats['daily_downloads'] = execute_one(
        "SELECT COUNT(*) as count FROM downloads WHERE DATE(created_at) = %s",
        (today,)
    )['count']
    
    return stats


def get_daily_stats(days: int = 30) -> List[Dict[str, Any]]:
    rows = execute_query("""
        SELECT date, active_users, total_optimizations, total_bytes_saved, avg_compression_pct
        FROM daily_stats
        WHERE date >= CURRENT_DATE - INTERVAL '%s days'
        ORDER BY date DESC
    """, (days,))
    return [dict(row) for row in rows]


def get_popular_wallpapers(limit: int = 20) -> List[Wallpaper]:
    rows = execute_query("SELECT * FROM popular_wallpapers LIMIT %s", (limit,))
    return [_row_to_wallpaper(row) for row in rows]


# Rate limiting
def check_rate_limit(identifier: str, endpoint: str, limit: int, window_minutes: int = 1) -> bool:
    window_start = datetime.utcnow().replace(second=0, microsecond=0)
    
    query = """
        INSERT INTO rate_limits (identifier, endpoint, count, window_start)
        VALUES (%s, %s, 1, %s)
        ON CONFLICT (identifier, endpoint, window_start) DO UPDATE SET
            count = rate_limits.count + 1
        RETURNING count
    """
    row = execute_one(query, (identifier, endpoint, window_start))
    return row['count'] <= limit


# Helper functions
def _row_to_user(row: dict) -> User:
    return User(
        id=UUID(row['id']),
        email=row['email'],
        name=row['name'],
        avatar_url=row['avatar_url'],
        plan=PlanType(row['plan']),
        is_active=row['is_active'],
        daily_optimizations=row['daily_optimizations'],
        last_optimization_date=row['last_optimization_date'],
        created_at=row['created_at'],
        updated_at=row['updated_at']
    )


def _row_to_wallpaper(row: dict) -> Wallpaper:
    return Wallpaper(
        id=UUID(row['id']),
        title=row['title'],
        slug=row['slug'],
        description=row['description'],
        category=row['category'],
        image_url=row['image_url'],
        thumbnail_url=row['thumbnail_url'],
        width=row['width'],
        height=row['height'],
        format=ImageFormat(row['format']),
        file_size=row['file_size'],
        downloads=row['downloads'],
        is_published=row['is_published'],
        created_at=row['created_at'],
        updated_at=row['updated_at']
    )


def _row_to_optimization(row: dict) -> Optimization:
    return Optimization(
        id=UUID(row['id']),
        user_id=UUID(row['user_id']) if row['user_id'] else None,
        original_filename=row['original_filename'],
        original_size=row['original_size'],
        original_width=row['original_width'],
        original_height=row['original_height'],
        original_format=ImageFormat(row['original_format']),
        output_size=row['output_size'],
        output_width=row['output_width'],
        output_height=row['output_height'],
        output_format=ImageFormat(row['output_format']),
        target_size=row['target_size'],
        quality_used=row['quality_used'],
        processing_time_ms=row['processing_time_ms'],
        created_at=row['created_at']
    )