import { beforeEach, describe, expect, it } from 'vitest';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { ApiError, api, handleApiError, optimizeApi } from './api';

function binaryResponse(headers: Record<string, string>): AxiosResponse {
  return {
    data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }),
    status: 200,
    statusText: 'OK',
    headers,
    config: {} as InternalAxiosRequestConfig,
  };
}

function rejectedBlob(status: number, payload: unknown): AxiosError {
  const config = {} as InternalAxiosRequestConfig;
  const response = {
    data: new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    status,
    statusText: 'Error',
    headers: {},
    config,
  };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response);
}

const HEADERS = {
  'content-type': 'image/webp',
  'x-output-format': 'WEBP',
  'x-output-size': '4',
  'x-output-width': '800',
  'x-output-height': '600',
  'x-original-size': '100',
  'x-original-width': '1600',
  'x-original-height': '1200',
  'x-original-format': 'PNG',
  'x-target-size': '1024',
  'x-target-met': 'true',
  'x-quality-used': '72',
  'x-processing-time-ms': '35',
  'x-compression-ratio': '96.00',
  'x-saved-bytes': '96',
  'x-filename': 'photo-optimized.webp',
  'x-reencoded': 'true',
};

const options = { targetSizeBytes: 1024 * 1024, outputFormat: 'AUTO' as const };

describe('optimizeApi', () => {
  beforeEach(() => {
    api.defaults.adapter = async () => binaryResponse(HEADERS);
  });

  it('turns a binary response and headers into a typed result', async () => {
    const result = await optimizeApi.optimize(
      new File(['x'], 'photo.png', { type: 'image/png' }),
      options
    );

    expect(result.output_format).toBe('WEBP');
    expect(result.blob.type).toBe('image/webp');
    expect(result.output_size).toBe(4);
    expect(result.output_width).toBe(800);
    expect(result.original_size).toBe(100);
    expect(result.target_met).toBe(true);
    expect(result.quality_used).toBe(72);
    expect(result.filename).toBe('photo-optimized.webp');
    expect(result.reencoded).toBe(true);
  });

  it('parses structured JSON errors received as blobs', async () => {
    api.defaults.adapter = async () => {
      throw rejectedBlob(400, {
        success: false,
        error: { code: 'INVALID_OUTPUT_FORMAT', message: 'Unsupported output format' },
      });
    };

    await expect(
      optimizeApi.optimize(new File(['x'], 'photo.png', { type: 'image/png' }), options)
    ).rejects.toMatchObject({
      message: 'Unsupported output format',
      code: 'INVALID_OUTPUT_FORMAT',
    });
  });

  it('never treats a JSON error blob as a successful image', async () => {
    api.defaults.adapter = async () => ({
      data: new Blob([JSON.stringify({ success: false })], { type: 'application/json' }),
      status: 200,
      statusText: 'OK',
      headers: { 'x-output-format': 'WEBP' },
      config: {} as InternalAxiosRequestConfig,
    });

    const error = await optimizeApi
      .optimize(new File(['x'], 'photo.png', { type: 'image/png' }), options)
      .catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INVALID_RESPONSE');
  });

  it('reports network failures', async () => {
    api.defaults.adapter = async () => {
      throw new AxiosError('Network Error', 'ERR_NETWORK');
    };

    await expect(
      optimizeApi.optimize(new File(['x'], 'photo.png', { type: 'image/png' }), options)
    ).rejects.toBeInstanceOf(AxiosError);

    const networkError = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(handleApiError(networkError).code).toBe('NETWORK_ERROR');
  });

  it('maps ApiError to a display message', () => {
    const parsed = handleApiError(new ApiError('Daily limit reached', 'QUOTA_EXCEEDED', 429));
    expect(parsed).toEqual({ message: 'Daily limit reached', code: 'QUOTA_EXCEEDED' });
  });
});
