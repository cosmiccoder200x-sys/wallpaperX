import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

let accessToken: string | null = null;

export function setAuthToken(token: string | null) {
  accessToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      accessToken = null;
      delete api.defaults.headers.common['Authorization'];
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (email: string, password: string, name?: string) =>
    api.post<ApiResponse<{ user: any; token: string }>>('/auth/register', { email, password, name }),

  login: (email: string, password: string) =>
    api.post<ApiResponse<{ user: any; token: string }>>('/auth/login', { email, password }),

  supabaseAuth: (accessToken: string) =>
    api.post<ApiResponse<{ user: any; token: string }>>('/auth/supabase', { access_token: accessToken }),

  me: () =>
    api.get<ApiResponse<any>>('/auth/me'),

  refresh: () =>
    api.post<ApiResponse<{ token: string }>>('/auth/refresh'),
};

export const optimizeApi = {
  analyze: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ApiResponse<any>>('/optimize/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  optimize: (file: File, options: {
    target_size_mb?: number;
    target_size_kb?: number;
    output_format?: string;
    target_width?: number;
    target_height?: number;
  }) => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, value.toString());
    });
    return api.post<Blob>('/optimize/optimize', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  optimizeUrl: (url: string, options: {
    target_size_mb?: number;
    target_size_kb?: number;
    output_format?: string;
    target_width?: number;
    target_height?: number;
  }) =>
    api.post<Blob>('/optimize/optimize-url', { url, ...options }, {
      responseType: 'blob',
    }),

  history: (limit = 50, offset = 0) =>
    api.get<ApiResponse<any[]>>('/optimize/history', { params: { limit, offset } }),

  limits: () =>
    api.get<ApiResponse<any>>('/optimize/limits'),
};

export const wallpapersApi = {
  list: (params?: { category?: string; limit?: number; offset?: number; published?: boolean }) =>
    api.get<ApiResponse<any[]>>('/wallpapers', { params }),

  categories: () =>
    api.get<ApiResponse<any[]>>('/wallpapers/categories'),

  get: (slug: string) =>
    api.get<ApiResponse<any>>(`/wallpapers/${slug}`),

  download: (id: string) =>
    api.post<ApiResponse<{ download_url: string; filename: string }>>(`/wallpapers/${id}/download`),

  adminCreate: (data: any) =>
    api.post<ApiResponse<any>>('/wallpapers/admin', data),

  adminUpdate: (id: string, data: any) =>
    api.put<ApiResponse<any>>(`/wallpapers/admin/${id}`, data),

  adminDelete: (id: string) =>
    api.delete<ApiResponse<any>>(`/wallpapers/admin/${id}`),
};

export const adminApi = {
  stats: () =>
    api.get<ApiResponse<any>>('/admin/stats'),

  analytics: (days = 30) =>
    api.get<ApiResponse<any>>('/admin/analytics', { params: { days } }),

  users: (params?: { page?: number; limit?: number; plan?: string; search?: string }) =>
    api.get<ApiResponse<any>>('/admin/users', { params }),

  updateUserPlan: (userId: string, plan: string) =>
    api.put<ApiResponse<any>>(`/admin/users/${userId}/plan`, { plan }),

  disableUser: (userId: string) =>
    api.post<ApiResponse<any>>(`/admin/users/${userId}/disable`),

  wallpapers: (params?: { page?: number; limit?: number; published?: string; category?: string }) =>
    api.get<ApiResponse<any>>('/admin/wallpapers', { params }),
};

export function handleApiError(error: unknown): { code: string; message: string } {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data as ApiResponse<any> | undefined;
    if (responseError?.error) {
      return responseError.error;
    }
    return { code: 'NETWORK_ERROR', message: error.message || 'Network error occurred' };
  }
  return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
}

export default api;