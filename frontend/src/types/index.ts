export type ImageFormat = 'JPEG' | 'PNG' | 'WEBP' | 'AVIF';
export type OutputFormat = ImageFormat | 'AUTO';
export type PlanType = 'free' | 'pro' | 'admin';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  plan: PlanType;
  dailyOptimizations: number;
  credits: number;
  createdAt: number;
  lastLoginAt: number;
}

export interface ImageAnalysis {
  filename: string;
  format: ImageFormat;
  mime_type: string;
  size: number;
  size_formatted: string;
  width: number;
  height: number;
  dimensions: string;
  aspect_ratio: string;
  megapixels: number;
  has_transparency: boolean;
  mode: string;
  estimated_optimization: {
    recommended_format: ImageFormat;
    estimated_size_mb: number;
    estimated_compression_pct: number;
    can_reach_1mb: boolean;
    can_reach_5mb: boolean;
    can_reach_10mb: boolean;
    note?: string;
  };
}

export interface OptimizationRequest {
  targetSizeBytes: number;
  outputFormat: OutputFormat;
  targetWidth?: number;
  targetHeight?: number;
}

export interface OptimizationResult {
  success: true;
  blob: Blob;
  mimeType: string;
  filename: string;
  original_size: number;
  original_width: number;
  original_height: number;
  original_format: ImageFormat;
  output_size: number;
  output_width: number;
  output_height: number;
  output_format: ImageFormat;
  target_size: number;
  target_met: boolean;
  quality_used: number | null;
  processing_time_ms: number;
  compression_ratio: number;
  saved_bytes: number;
  reencoded: boolean;
  message?: string;
}

export interface OptimizationHistoryItem {
  id: string;
  original_filename: string;
  original_size: number;
  original_size_formatted: string;
  original_dimensions: string;
  output_size: number;
  output_size_formatted: string;
  output_dimensions: string;
  output_format: ImageFormat;
  compression_ratio: number;
  saved_bytes: number;
  saved_formatted: string;
  quality_used: number | null;
  processing_time_ms: number;
  created_at: string | null;
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
  supported_formats?: ImageFormat[];
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
  dimensions?: string;
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
