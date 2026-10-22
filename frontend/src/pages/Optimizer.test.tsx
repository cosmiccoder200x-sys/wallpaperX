import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ImageAnalysis, OptimizationResult, PlanLimits } from '../types';

const apiMocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  optimize: vi.fn(),
  optimizeUrl: vi.fn(),
  limits: vi.fn(),
  history: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, optimizeApi: apiMocks };
});

import { Optimizer } from './Optimizer';
import { ApiError } from '../services/api';

const LIMITS: PlanLimits = {
  plan: 'free',
  max_input_mb: 25,
  max_output_mb: 10,
  daily_optimizations: 5,
  daily_used: 0,
  daily_remaining: 5,
  priority_processing: false,
  batch_processing: false,
  no_ads: false,
  history_retention_days: 7,
};

function analysis(overrides: Partial<ImageAnalysis> = {}): ImageAnalysis {
  return {
    filename: 'wallpaper.jpg',
    format: 'JPEG',
    mime_type: 'image/jpeg',
    size: 524288,
    size_formatted: '512.0 KB',
    width: 1920,
    height: 1080,
    dimensions: '1920 × 1080',
    aspect_ratio: '16:9',
    megapixels: 2.1,
    has_transparency: false,
    mode: 'RGB',
    estimated_optimization: {
      recommended_format: 'WEBP',
      estimated_size_mb: 0.15,
      estimated_compression_pct: 70,
      can_reach_1mb: true,
      can_reach_5mb: true,
      can_reach_10mb: true,
    },
    ...overrides,
  };
}

function result(overrides: Partial<OptimizationResult> = {}): OptimizationResult {
  return {
    success: true,
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }),
    mimeType: 'image/webp',
    filename: 'wallpaper-optimized.webp',
    original_size: 524288,
    original_width: 1920,
    original_height: 1080,
    original_format: 'JPEG',
    output_size: 51200,
    output_width: 1920,
    output_height: 1080,
    output_format: 'WEBP',
    target_size: 1024 * 1024,
    target_met: true,
    quality_used: 78,
    processing_time_ms: 42,
    compression_ratio: 90,
    saved_bytes: 473088,
    reencoded: true,
    ...overrides,
  };
}

function imageFile(name = 'wallpaper.jpg') {
  return new File([new Uint8Array([255, 216, 255, 0])], name, { type: 'image/jpeg' });
}

function renderOptimizer() {
  return render(
    <MemoryRouter>
      <Optimizer />
    </MemoryRouter>
  );
}

async function uploadFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(screen.getByTestId('file-input'), file);
}

describe('Optimizer page', () => {
  beforeEach(() => {
    apiMocks.analyze.mockReset();
    apiMocks.optimize.mockReset();
    apiMocks.optimizeUrl.mockReset();
    apiMocks.limits.mockReset();
    apiMocks.limits.mockResolvedValue({ data: { success: true, data: LIMITS } });
    apiMocks.history.mockResolvedValue({ data: { success: true, data: [] } });
  });

  it('analyzes the selected file and shows its real metadata and preview', async () => {
    const user = userEvent.setup();
    apiMocks.analyze.mockResolvedValue({ data: { success: true, data: analysis() } });
    renderOptimizer();

    const file = imageFile();
    await uploadFile(user, file);

    await waitFor(() => expect(apiMocks.analyze).toHaveBeenCalledTimes(1));
    expect(apiMocks.analyze.mock.calls[0][0]).toBe(file);
    expect((await screen.findAllByText('1920 × 1080')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('preview-image')).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/)
    );
    expect(screen.getByRole('button', { name: /Optimize Wallpaper/i })).toBeEnabled();
  });

  it('shows an analysis error, keeps the file and clears the loading state', async () => {
    const user = userEvent.setup();
    apiMocks.analyze.mockRejectedValue(new ApiError('Unsupported image format', 'UNSUPPORTED_FORMAT'));
    renderOptimizer();

    await uploadFile(user, imageFile());

    expect(await screen.findByText('Unsupported image format')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Analyzing image…')).not.toBeInTheDocument());
    expect(screen.getByTestId('preview-image')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Optimize Wallpaper/i })).not.toBeInTheDocument();
  });

  it('optimizes, shows truthful comparison details and downloads the blob', async () => {
    const user = userEvent.setup();
    apiMocks.analyze.mockResolvedValue({ data: { success: true, data: analysis() } });
    apiMocks.optimize.mockResolvedValue(result());
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('wallpaper-optimized.webp');
        expect(this.href).toMatch(/^blob:/);
      });

    renderOptimizer();
    await uploadFile(user, imageFile());
    await screen.findAllByText('1920 × 1080');

    await user.click(screen.getByRole('button', { name: /Optimize Wallpaper/i }));

    expect(await screen.findByText('Optimization Complete')).toBeInTheDocument();
    expect(screen.getByText(/Target met/)).toBeInTheDocument();
    expect(screen.getByText(/90\.\d% smaller/)).toBeInTheDocument();
    expect(apiMocks.optimize.mock.calls[0][1]).toMatchObject({
      targetSizeBytes: 10 * 1024 * 1024,
      outputFormat: 'AUTO',
    });

    await user.click(screen.getByRole('button', { name: /DOWNLOAD OPTIMIZED WALLPAPER/i }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('reports blob errors and recovers the optimize button', async () => {
    const user = userEvent.setup();
    apiMocks.analyze.mockResolvedValue({ data: { success: true, data: analysis() } });
    apiMocks.optimize.mockRejectedValue(
      new ApiError('Daily limit of 5 optimizations reached', 'QUOTA_EXCEEDED', 429)
    );

    renderOptimizer();
    await uploadFile(user, imageFile());
    await screen.findAllByText('1920 × 1080');
    await user.click(screen.getByRole('button', { name: /Optimize Wallpaper/i }));

    expect(await screen.findByText('Daily limit of 5 optimizations reached')).toBeInTheDocument();
    expect(screen.queryByText('Optimization Complete')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Optimize Wallpaper/i })).toBeEnabled();
  });

  it('downloads a file that already met the target without re-encoding', async () => {
    const user = userEvent.setup();
    apiMocks.analyze.mockResolvedValue({ data: { success: true, data: analysis() } });
    apiMocks.optimize.mockResolvedValue(
      result({
        output_size: 524288,
        output_format: 'JPEG',
        mimeType: 'image/jpeg',
        filename: 'wallpaper-optimized.jpg',
        target_met: true,
        reencoded: false,
        quality_used: null,
        message:
          'The original file already meets the target size and no conversion was requested, so it is returned unchanged.',
      })
    );

    renderOptimizer();
    await uploadFile(user, imageFile());
    await screen.findAllByText('1920 × 1080');
    await user.click(screen.getByRole('button', { name: /Optimize Wallpaper/i }));

    expect(
      await screen.findByText(/original file already met your target/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/0\.0% smaller/)).toBeInTheDocument();
  });

  it('replaces the displayed result when the file changes and revokes preview URLs', async () => {
    const user = userEvent.setup();
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    apiMocks.analyze
      .mockResolvedValueOnce({ data: { success: true, data: analysis() } })
      .mockResolvedValueOnce({
        data: { success: true, data: analysis({ width: 800, height: 600, dimensions: '800 × 600' }) },
      });
    apiMocks.optimize.mockResolvedValue(result());

    const { unmount } = renderOptimizer();
    await uploadFile(user, imageFile('first.jpg'));
    await screen.findAllByText('1920 × 1080');
    const firstPreview = screen.getByTestId('preview-image').getAttribute('src');

    await uploadFile(user, imageFile('second.jpg'));
    expect((await screen.findAllByText('800 × 600')).length).toBeGreaterThan(0);
    expect(apiMocks.analyze).toHaveBeenCalledTimes(2);
    expect(apiMocks.optimize).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview-image').getAttribute('src')).not.toBe(firstPreview);
    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith(firstPreview));

    unmount();
  });

  it('clears a result when settings change after optimizing again', async () => {
    const user = userEvent.setup();
    apiMocks.analyze.mockResolvedValue({ data: { success: true, data: analysis() } });
    apiMocks.optimize.mockResolvedValue(result());

    renderOptimizer();
    await uploadFile(user, imageFile());
    await screen.findAllByText('1920 × 1080');
    await user.click(screen.getByRole('button', { name: /Optimize Wallpaper/i }));
    await screen.findByText('Optimization Complete');

    await user.click(screen.getByRole('button', { name: /Optimize again/i }));
    expect(screen.queryByText('Optimization Complete')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '5 MB' }));
    await user.click(screen.getByRole('button', { name: /Optimize Wallpaper/i }));
    await waitFor(() => expect(apiMocks.optimize).toHaveBeenCalledTimes(2));
    expect(apiMocks.optimize.mock.calls[1][1]).toMatchObject({
      targetSizeBytes: 5 * 1024 * 1024,
    });
  });

  it('optimizes from a URL with the same result contract', async () => {
    const user = userEvent.setup();
    apiMocks.optimizeUrl.mockResolvedValue(result({ filename: 'remote-optimized.webp' }));

    renderOptimizer();
    await user.click(screen.getByRole('tab', { name: 'From URL' }));
    await user.type(
      screen.getByLabelText('Image URL'),
      'https://example.com/wallpaper.png'
    );
    await user.click(screen.getByRole('button', { name: /Optimize URL/i }));

    await waitFor(() =>
      expect(apiMocks.optimizeUrl).toHaveBeenCalledWith(
        'https://example.com/wallpaper.png',
        expect.objectContaining({ targetSizeBytes: 10 * 1024 * 1024 }),
        expect.any(AbortSignal)
      )
    );
    expect(await screen.findByText('Optimization Complete')).toBeInTheDocument();
  });

  it('rejects unsupported URL schemes without calling the API', async () => {
    const user = userEvent.setup();
    renderOptimizer();

    await user.click(screen.getByRole('tab', { name: 'From URL' }));
    await user.type(screen.getByLabelText('Image URL'), 'ftp://example.com/file.png');
    await user.click(screen.getByRole('button', { name: /Optimize URL/i }));

    expect(
      await screen.findByText(/Only http:\/\/ and https:\/\/ URLs are supported/i)
    ).toBeInTheDocument();
    expect(apiMocks.optimizeUrl).not.toHaveBeenCalled();
  });
});
