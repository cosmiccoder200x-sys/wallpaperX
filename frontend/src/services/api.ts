import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import type {
  ApiResponse,
  Category,
  ImageAnalysis,
  ImageFormat,
  OptimizationHistoryItem,
  OptimizationResult,
  OutputFormat,
  PlanLimits,
  Wallpaper,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code = 'REQUEST_FAILED', status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

let accessToken: string | null = null;

export function setAuthToken(token: string | null) {
  accessToken = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      accessToken = null;
      delete api.defaults.headers.common.Authorization;
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------- error utils
interface ParsedError {
  message: string;
  code: string;
  status?: number;
}

function parseJsonErrorPayload(payload: unknown, status?: number): ParsedError | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, any>;
  const nested = body.error;
  if (nested && typeof nested === 'object') {
    return {
      message: String(nested.message || 'Request failed'),
      code: String(nested.code || 'REQUEST_FAILED'),
      status,
    };
  }
  if (typeof body.message === 'string') {
    return { message: body.message, code: String(body.code || 'REQUEST_FAILED'), status };
  }
  return null;
}

async function parseBlobError(error: AxiosError): Promise<ParsedError | null> {
  const data = error.response?.data;
  if (!(data instanceof Blob)) return null;
  try {
    const text = await data.text();
    return parseJsonErrorPayload(JSON.parse(text), error.response?.status);
  } catch {
    return {
      message: 'The server returned an unreadable error response',
      code: 'INVALID_ERROR_RESPONSE',
      status: error.response?.status,
    };
  }
}

export function handleApiError(err: unknown): { message: string; code: string } {
  if (err instanceof ApiError) {
    return { message: err.message, code: err.code };
  }
  if (axios.isCancel(err)) {
    return { message: 'Request cancelled', code: 'CANCELLED' };
  }
  if (axios.isAxiosError(err)) {
    const parsed = parseJsonErrorPayload(err.response?.data, err.response?.status);
    if (parsed) return { message: parsed.message, code: parsed.code };
    if (err.code === 'ECONNABORTED') {
      return { message: 'The request timed out. Please try again.', code: 'TIMEOUT' };
    }
    if (!err.response) {
      return {
        message: 'Could not reach the server. Check your connection and try again.',
        code: 'NETWORK_ERROR',
      };
    }
    return {
      message: `Request failed with status ${err.response.status}`,
      code: 'REQUEST_FAILED',
    };
  }
  if (err instanceof Error && err.message) {
    return { message: err.message, code: 'UNEXPECTED_ERROR' };
  }
  return { message: 'An unexpected error occurred.', code: 'UNEXPECTED_ERROR' };
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function filenameFromDisposition(disposition: string | undefined): string | null {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : null;
}

// --------------------------------------------------------------- optimize API
interface OptimizeOptions {
  targetSizeBytes: number;
  outputFormat: OutputFormat;
  targetWidth?: number;
  targetHeight?: number;
}

function appendOptions(formData: FormData, options: OptimizeOptions) {
  const bytes = options.targetSizeBytes;
  if (bytes < 1024 * 1024) {
    formData.append('target_size_kb', (bytes / 1024).toFixed(2));
  } else {
    formData.append('target_size_mb', (bytes / (1024 * 1024)).toFixed(3));
  }
  if (options.outputFormat !== 'AUTO') {
    formData.append('output_format', options.outputFormat);
  }
  if (options.targetWidth) {
    formData.append('target_width', String(Math.round(options.targetWidth)));
  }
  if (options.targetHeight) {
    formData.append('target_height', String(Math.round(options.targetHeight)));
  }
}

async function readBinaryResult(response: {
  data: Blob;
  headers: Record<string, any>;
}): Promise<OptimizationResult> {
  const blob = response.data;
  const headers = response.headers;

  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new ApiError('The server returned an empty image', 'EMPTY_RESPONSE');
  }

  const outputFormat = String(headers['x-output-format'] || '').toUpperCase() as ImageFormat;
  if (!['JPEG', 'PNG', 'WEBP', 'AVIF'].includes(outputFormat)) {
    throw new ApiError(
      'The server returned an unexpected response instead of an image',
      'INVALID_RESPONSE'
    );
  }
  if (!blob.type.startsWith('image/')) {
    throw new ApiError(
      'The server returned an error instead of an optimized image',
      'INVALID_RESPONSE'
    );
  }

  return {
    success: true,
    blob,
    mimeType: blob.type || headers['content-type'] || 'application/octet-stream',
    filename:
      String(headers['x-filename'] || '') ||
      filenameFromDisposition(headers['content-disposition']) ||
      `optimized.${outputFormat === 'JPEG' ? 'jpg' : outputFormat.toLowerCase()}`,
    original_size: toNumber(headers['x-original-size']),
    original_width: toNumber(headers['x-original-width']),
    original_height: toNumber(headers['x-original-height']),
    original_format: String(
      headers['x-original-format'] || outputFormat
    ).toUpperCase() as ImageFormat,
    output_size: toNumber(headers['x-output-size'], blob.size),
    output_width: toNumber(headers['x-output-width']),
    output_height: toNumber(headers['x-output-height']),
    output_format: outputFormat,
    target_size: toNumber(headers['x-target-size']),
    target_met: String(headers['x-target-met']).toLowerCase() === 'true',
    quality_used:
      headers['x-quality-used'] !== undefined ? toNumber(headers['x-quality-used']) : null,
    processing_time_ms: toNumber(headers['x-processing-time-ms']),
    compression_ratio: toNumber(headers['x-compression-ratio']),
    saved_bytes: toNumber(headers['x-saved-bytes']),
    reencoded: String(headers['x-reencoded']).toLowerCase() === 'true',
    message: headers['x-message'] ? String(headers['x-message']) : undefined,
  };
}

async function postBinary(
  url: string,
  body: FormData | object,
  config: AxiosRequestConfig = {}
): Promise<OptimizationResult> {
  try {
    const isForm = body instanceof FormData;
    const response = await api.post(url, body, {
      ...config,
      responseType: 'blob',
      headers: isForm
        ? { 'Content-Type': 'multipart/form-data' }
        : { 'Content-Type': 'application/json' },
    });
    return await readBinaryResult(response);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const parsed = await parseBlobError(error);
      if (parsed) {
        throw new ApiError(parsed.message, parsed.code, parsed.status);
      }
      if (error.code === 'ERR_CANCELED') throw error;
    }
    throw error;
  }
}

export const optimizeApi = {
  analyze: (file: File, signal?: AbortSignal) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<ImageAnalysis>>('/optimize/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
    });
  },

  optimize: (file: File, options: OptimizeOptions, signal?: AbortSignal) => {
    const formData = new FormData();
    formData.append('file', file);
    appendOptions(formData, options);
    return postBinary('/optimize/optimize', formData, { signal });
  },

  optimizeUrl: (url: string, options: OptimizeOptions, signal?: AbortSignal) => {
    return postBinary(
      '/optimize/optimize-url',
      {
        url,
        target_size_mb: options.targetSizeBytes / (1024 * 1024),
        output_format: options.outputFormat === 'AUTO' ? undefined : options.outputFormat,
        target_width: options.targetWidth,
        target_height: options.targetHeight,
      },
      { signal }
    );
  },

  limits: () => api.get<ApiResponse<PlanLimits>>('/optimize/limits'),

  history: (limit = 20, offset = 0) =>
    api.get<ApiResponse<OptimizationHistoryItem[]>>('/optimize/history', {
      params: { limit, offset },
    }),
};

// -------------------------------------------------------------- wallpapers API
export const wallpapersApi = {
  list: (params?: {
    category?: string;
    limit?: number;
    offset?: number;
    published?: boolean;
  }) => api.get<ApiResponse<Wallpaper[]>>('/wallpapers', { params }),

  get: (slug: string) =>
    api.get<ApiResponse<Wallpaper>>(`/wallpapers/${encodeURIComponent(slug)}`),

  categories: () => api.get<ApiResponse<Category[]>>('/wallpapers/categories'),

  download: (id: string) =>
    api.post<ApiResponse<{ download_url: string; filename: string }>>(
      `/wallpapers/${encodeURIComponent(id)}/download`
    ),

  adminUpdate: (id: string, data: Partial<Wallpaper>) =>
    api.put<ApiResponse<{ id: string }>>(`/wallpapers/admin/${encodeURIComponent(id)}`, data),

  adminDelete: (id: string) =>
    api.delete<ApiResponse<null>>(`/wallpapers/admin/${encodeURIComponent(id)}`),
};

// ------------------------------------------------------------------ admin API
export const adminApi = {
  stats: () => api.get<ApiResponse<Record<string, number>>>('/admin/stats'),

  analytics: (days = 30) =>
    api.get<ApiResponse<{ daily_stats: any[]; popular_wallpapers: any[] }>>(
      '/admin/analytics',
      { params: { days } }
    ),

  users: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<{ users: any[]; pagination: any }>>('/admin/users', { params }),

  updateUserPlan: (userId: string, plan: string) =>
    api.put<ApiResponse<{ id: string; plan: string }>>(
      `/admin/users/${encodeURIComponent(userId)}/plan`,
      { plan }
    ),

  disableUser: (userId: string) =>
    api.post<ApiResponse<null>>(`/admin/users/${encodeURIComponent(userId)}/disable`),

  wallpapers: (params?: {
    page?: number;
    limit?: number;
    published?: string;
    category?: string;
  }) =>
    api.get<ApiResponse<{ wallpapers: any[]; pagination: any }>>('/admin/wallpapers', {
      params,
    }),
};
