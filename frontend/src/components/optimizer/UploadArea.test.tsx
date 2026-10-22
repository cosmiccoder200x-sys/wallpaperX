import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadArea } from './UploadArea';
import { validateFile } from '../../utils/validateFile';
import type { ImageAnalysis } from '../../types';

const ANALYSIS: ImageAnalysis = {
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
};

function props(overrides: Partial<React.ComponentProps<typeof UploadArea>> = {}) {
  return {
    selectedFile: null,
    previewUrl: null,
    analysis: null,
    isAnalyzing: false,
    isOptimizing: false,
    maxSizeMB: 25,
    error: null,
    onFileSelect: vi.fn(),
    onValidationError: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

describe('UploadArea', () => {
  it('renders a visible dropzone and only one file input', () => {
    render(<UploadArea {...props()} />);
    expect(screen.getByTestId('upload-dropzone')).toBeVisible();
    expect(screen.getByText('DROP WALLPAPER HERE')).toBeVisible();
    expect(screen.getAllByTestId('file-input')).toHaveLength(1);
  });

  it('selects a file through the picker', async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    render(<UploadArea {...props({ onFileSelect })} />);

    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('file-input'), file);

    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect.mock.calls[0][0]).toBe(file);
  });

  it('accepts drag-and-drop', () => {
    const onFileSelect = vi.fn();
    render(<UploadArea {...props({ onFileSelect })} />);
    const file = new File(['abc'], 'photo.png', { type: 'image/png' });

    fireEvent.drop(screen.getByTestId('upload-dropzone'), {
      dataTransfer: { files: [file] },
    });

    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('reports unsupported and oversized files instead of selecting them', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onFileSelect = vi.fn();
    const onValidationError = vi.fn();
    render(
      <UploadArea
        {...props({ onFileSelect, onValidationError, maxSizeMB: 0.0001 })}
      />
    );

    await user.upload(
      screen.getByTestId('file-input'),
      new File(['abc'], 'notes.txt', { type: 'text/plain' })
    );
    expect(onFileSelect).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenCalledWith(expect.stringMatching(/Unsupported format/i));

    await user.upload(
      screen.getByTestId('file-input'),
      new File([new Uint8Array(2048)], 'big.jpg', { type: 'image/jpeg' })
    );
    expect(onFileSelect).not.toHaveBeenCalled();
    expect(onValidationError).toHaveBeenCalledWith(expect.stringMatching(/too large/i));
  });

  it('opens the picker from the keyboard', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<UploadArea {...props()} />);

    fireEvent.keyDown(screen.getByTestId('upload-dropzone'), { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the real preview and analysis details', () => {
    const file = new File(['abc'], 'wallpaper.jpg', { type: 'image/jpeg' });
    render(
      <UploadArea
        {...props({
          selectedFile: file,
          previewUrl: 'blob:preview-1',
          analysis: ANALYSIS,
        })}
      />
    );

    const image = screen.getByTestId('preview-image');
    expect(image).toHaveAttribute('src', 'blob:preview-1');
    expect(screen.getAllByText('JPEG').length).toBeGreaterThan(0);
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(screen.getAllByText('512.0 KB').length).toBeGreaterThan(0);
    expect(screen.getByText('16:9')).toBeInTheDocument();
    expect(screen.getByText('wallpaper.jpg')).toBeInTheDocument();
  });

  it('shows a loading overlay while analysing', () => {
    render(
      <UploadArea
        {...props({
          selectedFile: new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
          previewUrl: 'blob:preview-2',
          isAnalyzing: true,
        })}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Analyzing image/i);
  });

  it('clears the selection through the remove button', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <UploadArea
        {...props({
          selectedFile: new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
          previewUrl: 'blob:preview-3',
          analysis: ANALYSIS,
          onClear,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /Remove image/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('validates size and format directly', () => {
    expect(validateFile(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 1)).toBeNull();
    expect(validateFile(new File(['a'], 'a.txt', { type: 'text/plain' }), 1)).toMatch(
      /Unsupported format/
    );
    expect(
      validateFile(new File([new Uint8Array(2 * 1024 * 1024)], 'a.jpg', { type: 'image/jpeg' }), 1)
    ).toMatch(/too large/);
  });
});
