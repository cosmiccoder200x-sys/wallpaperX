import { DragEvent, KeyboardEvent, ChangeEvent, useCallback, useRef, useState } from 'react';
import { AlertCircle, File, ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { formatBytes } from '../../utils/format';
import type { ImageAnalysis } from '../../types';
import { DEFAULT_FORMATS, validateFile } from '../../utils/validateFile';

interface UploadAreaProps {
  selectedFile: File | null;
  previewUrl: string | null;
  analysis: ImageAnalysis | null;
  isAnalyzing?: boolean;
  isOptimizing?: boolean;
  maxSizeMB?: number;
  acceptedFormats?: string[];
  error?: string | null;
  onFileSelect: (file: File) => void;
  onValidationError: (message: string) => void;
  onClear: () => void;
}

export function UploadArea({
  selectedFile,
  previewUrl,
  analysis,
  isAnalyzing = false,
  isOptimizing = false,
  maxSizeMB = 50,
  acceptedFormats = DEFAULT_FORMATS,
  error,
  onFileSelect,
  onValidationError,
  onClear,
}: UploadAreaProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = isAnalyzing || isOptimizing;

  const openPicker = useCallback(() => {
    if (busy) return;
    inputRef.current?.click();
  }, [busy]);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || busy) return;
      const validationError = validateFile(file, maxSizeMB, acceptedFormats);
      if (validationError) {
        onValidationError(validationError);
        return;
      }
      onFileSelect(file);
    },
    [acceptedFormats, busy, maxSizeMB, onFileSelect, onValidationError]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so selecting the same file again still fires onChange.
      event.target.value = '';
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = 0;
      setIsDragActive(false);
      if (busy) return;
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length > 1) {
        onValidationError('Please drop one image at a time.');
        return;
      }
      handleFile(files[0]);
    },
    [busy, handleFile, onValidationError]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPicker();
      }
    },
    [openPicker]
  );

  const input = (
    <input
      ref={inputRef}
      id="wallpaper-file-input"
      type="file"
      accept={acceptedFormats.join(',')}
      onChange={handleInputChange}
      className="sr-only"
      disabled={busy}
      data-testid="file-input"
    />
  );

  if (selectedFile) {
    return (
      <div className="animate-in space-y-4">
        <div
          className="relative aspect-video rounded-xl overflow-hidden border border-brand-800 bg-brand-900"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={selectedFile.name}
              className="w-full h-full object-contain"
              data-testid="preview-image"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-brand-500">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}

          {analysis && (
            <div className="absolute top-3 right-3 z-10 flex gap-1.5">
              <span className="px-2 py-1 text-xs font-medium bg-black/60 backdrop-blur-sm rounded-full text-white border border-white/10">
                {analysis.format}
              </span>
              <span className="px-2 py-1 text-xs font-medium bg-black/60 backdrop-blur-sm rounded-full text-white border border-white/10">
                {analysis.width}×{analysis.height}
              </span>
            </div>
          )}

          {isAnalyzing && (
            <div
              className="absolute inset-0 bg-brand-950/70 flex items-center justify-center gap-3 text-brand-200"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-6 h-6 animate-spin text-accent-400" />
              <span>Analyzing image…</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-brand-300 truncate" title={selectedFile.name}>
            <File className="w-4 h-4 inline mr-2 text-brand-500" />
            {selectedFile.name}
          </span>
          <span className="text-brand-500 shrink-0">{formatBytes(selectedFile.size)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metadata label="Format" value={analysis?.format ?? '—'} />
          <Metadata
            label="Dimensions"
            value={analysis ? `${analysis.width} × ${analysis.height}` : '—'}
          />
          <Metadata label="Size" value={analysis?.size_formatted ?? '—'} />
          <Metadata label="Ratio" value={analysis?.aspect_ratio ?? '—'} />
        </div>

        {analysis?.has_transparency && (
          <p className="text-xs text-brand-400">
            This image has transparency. It is preserved for PNG, WebP and AVIF output.
          </p>
        )}

        {error && <InlineError message={error} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button variant="secondary" onClick={openPicker} disabled={busy}>
            <Upload className="w-4 h-4" />
            Choose different image
          </Button>
          <Button variant="ghost" onClick={onClear} disabled={isOptimizing}>
            <X className="w-4 h-4" />
            Remove image
          </Button>
        </div>

        {input}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Upload a wallpaper: click, press Enter, or drop a file"
        aria-busy={isAnalyzing}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden',
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
          isDragActive
            ? 'border-accent-500 bg-accent-500/10 scale-[1.01] shadow-[0_0_40px_rgba(217,70,239,0.15)]'
            : 'border-brand-700 hover:border-brand-600 hover:bg-brand-900/50',
          busy && 'opacity-60 pointer-events-none'
        )}
        data-testid="upload-dropzone"
      >
        <div className="p-12 sm:p-16 text-center">
          <div className="mx-auto mb-6 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-800/50 flex items-center justify-center border border-brand-700">
            <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-brand-400" />
          </div>

          <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2">
            DROP WALLPAPER HERE
          </h3>

          <p className="text-brand-400 mb-6 max-w-md mx-auto">
            Drag &amp; drop your image, or click to browse
          </p>

          <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-800 border border-brand-700 text-white font-medium">
            <File className="w-4 h-4" />
            Browse Files
          </span>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-brand-500">
            {['JPG', 'PNG', 'WEBP', 'AVIF'].map((label) => (
              <span key={label} className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700">
                {label}
              </span>
            ))}
            <span className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700 text-brand-400">
              Max {maxSizeMB} MB
            </span>
          </div>

          {isAnalyzing && (
            <div className="mt-6 flex items-center justify-center gap-3 text-brand-400" role="status">
              <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              <span>Analyzing image…</span>
            </div>
          )}
        </div>
      </div>

      {error && <InlineError message={error} />}
      {/* Kept outside the clickable dropzone so the programmatic click does not
          bubble back into openPicker and re-open the dialog. */}
      {input}
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-3 bg-brand-900/50 rounded-lg border border-brand-800">
      <p className="text-xs text-brand-500 uppercase tracking-wide">{label}</p>
      <p className="text-base font-mono font-medium text-white truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm"
      role="alert"
    >
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
