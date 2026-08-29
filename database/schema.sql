-- Wallpaper10 Database Schema
-- Run this against your PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (synced with Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    avatar_url TEXT,
    plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'admin')),
    is_active BOOLEAN DEFAULT true,
    daily_optimizations INT DEFAULT 0,
    last_optimization_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);

-- Wallpapers table (for the library)
CREATE TABLE wallpapers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    format VARCHAR(10) NOT NULL,
    file_size BIGINT NOT NULL,
    downloads BIGINT DEFAULT 0,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallpapers_category ON wallpapers(category);
CREATE INDEX idx_wallpapers_published ON wallpapers(is_published);
CREATE INDEX idx_wallpapers_slug ON wallpapers(slug);
CREATE INDEX idx_wallpapers_downloads ON wallpapers(downloads DESC);

-- Optimizations history
CREATE TABLE optimizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    original_filename VARCHAR(255) NOT NULL,
    original_size BIGINT NOT NULL,
    original_width INT NOT NULL,
    original_height INT NOT NULL,
    original_format VARCHAR(10) NOT NULL,
    output_size BIGINT NOT NULL,
    output_width INT NOT NULL,
    output_height INT NOT NULL,
    output_format VARCHAR(10) NOT NULL,
    target_size BIGINT NOT NULL,
    quality_used INT,
    processing_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_optimizations_user_id ON optimizations(user_id);
CREATE INDEX idx_optimizations_created_at ON optimizations(created_at DESC);

-- Downloads tracking
CREATE TABLE downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallpaper_id UUID REFERENCES wallpapers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_downloads_wallpaper_id ON downloads(wallpaper_id);
CREATE INDEX idx_downloads_user_id ON downloads(user_id);
CREATE INDEX idx_downloads_created_at ON downloads(created_at DESC);

-- Rate limiting
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    count INT DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(identifier, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier, endpoint);

-- Admin analytics views
CREATE VIEW daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(DISTINCT user_id) as active_users,
    COUNT(*) as total_optimizations,
    SUM(original_size - output_size) as total_bytes_saved,
    AVG((original_size - output_size)::float / original_size * 100) as avg_compression_pct
FROM optimizations
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE VIEW popular_wallpapers AS
SELECT 
    w.id, w.title, w.slug, w.category, w.downloads,
    w.thumbnail_url, w.width, w.height, w.file_size
FROM wallpapers w
WHERE w.is_published = true
ORDER BY w.downloads DESC
LIMIT 100;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallpapers_updated_at BEFORE UPDATE ON wallpapers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();