export type ImageFormat = 'JPEG' | 'PNG' | 'WEBP' | 'AVIF' | 'AUTO';

export type PlanType = 'free' | 'pro' | 'admin';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  plan: PlanType;
  is_active: boolean;
}

export interface ImageAnalysis {
  filename: string;
  format: ImageFormat;
  size: number;
  width: number;
  height: number;
  aspect_ratio: string;
  megapixels: number;
  has_transparency: boolean;
  mode: string;
  estimated_optimization: {
    recommended_format: string;
    estimated_size_mb: number;
    estimated_compression_pct: number;
    can_reach_1mb: boolean;
    can_reach_5mb: boolean;
    can_reach_10mb: boolean;
  };
}

export interface OptimizationRequest {
  target_size: number;
  output_format?: ImageFormat;
  target_width?: number;
  target_height?: number;
}

export interface OptimizationResult {
  success: boolean;
  output_size: number;
  output_width: number;
  output_height: number;
  output_format: ImageFormat;
  quality_used: number;
  processing_time_ms: number;
  compression_ratio: number;
  saved_bytes: number;
  download_url?: string;
  blob?: Blob;
  error?: string;
  error_code?: string;
}

export interface OptimizationHistoryItem {
  id: string;
  original_filename: string;
  original_size: number;
  original_width: number;
  original_height: number;
  output_size: number;
  output_width: number;
  output_height: number;
  output_format: ImageFormat;
  compression_ratio: number;
  saved_bytes: number;
  quality_used: number;
  processing_time_ms: number;
  created_at: string;
}

export interface PlanLimits {
  plan: PlanType;
  max_input_mb: number;
  max_output_mb: number;
  daily_optimizations: number;
  daily_used: number;
  daily_remaining: number;
  priority_processing: boolean;
  batch_processing: boolean;
  no_ads: boolean;
  history_retention_days: number;
}

export interface Wallpaper {
  id: string;
  title: string;
  slug: string;
  description?: string;
  category: string;
  image_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  aspect_ratio: string;
  resolution_label: string;
  format: ImageFormat;
  file_size: number;
  downloads: number;
  is_published: boolean;
  created_at: string;
}

export interface Category {
  name: string;
  count: number;
  slug: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}