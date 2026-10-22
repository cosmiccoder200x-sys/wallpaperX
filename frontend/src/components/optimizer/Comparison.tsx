import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Download, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatBytes } from '../../utils/format';
import { Badge } from '../ui/Badge';
import type { ImageAnalysis, OptimizationResult } from '../../types';

interface ComparisonProps {
  original: ImageAnalysis;
  optimized: OptimizationResult;
  originalUrl: string | null;
  optimizedUrl: string | null;
  onDownload: () => void;
  isDownloading?: boolean;
}

export function Comparison({
  original,
  optimized,
  originalUrl,
  optimizedUrl,
  onDownload,
  isDownloading,
}: ComparisonProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider' | 'stacked'>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const savedBytes = original.size - optimized.output_size;
  const ratio = original.size > 0 ? (savedBytes / original.size) * 100 : 0;
  const isLarger = savedBytes < 0;

  const updateFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSliderPosition(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClientX(event.clientX);
  };

  const stopDragging = () => {
    draggingRef.current = false;
  };

  return (
    <div className="animate-in space-y-6" style={{ animationDelay: '200ms' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Optimization Complete</h2>
          <p className="text-brand-400 mt-1">
            {optimized.reencoded
              ? `Encoded as ${optimized.output_format} at ${formatBytes(optimized.output_size)}`
              : 'The original file already met your target and was returned unchanged'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={isLarger ? 'warning' : 'success'} size="lg">
            {isLarger
              ? `${formatBytes(Math.abs(savedBytes))} larger`
              : `${ratio.toFixed(1)}% smaller`}
          </Badge>
          <Badge variant="accent" size="lg">
            {isLarger ? 'No bytes saved' : `${formatBytes(savedBytes)} saved`}
          </Badge>
        </div>
      </div>

      <div
        className={cn(
          'flex items-start gap-2 p-3 rounded-lg border text-sm',
          optimized.target_met
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
        )}
        role="status"
      >
        {optimized.target_met ? (
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        )}
        <div className="space-y-1">
          <p>
            {optimized.target_met
              ? `Target met: ${formatBytes(optimized.output_size)} ≤ ${formatBytes(optimized.target_size)}`
              : `Target not met: ${formatBytes(optimized.output_size)} exceeds ${formatBytes(optimized.target_size)}`}
          </p>
          {optimized.message && <p className="text-xs opacity-90">{optimized.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Before" value={formatBytes(original.size)} sub={`${original.width} × ${original.height} • ${original.format}`} />
        <Stat
          label="After"
          value={formatBytes(optimized.output_size)}
          sub={`${optimized.output_width} × ${optimized.output_height} • ${optimized.output_format}`}
          accent
        />
        <Stat
          label="Quality"
          value={optimized.quality_used !== null ? `Q${optimized.quality_used}` : 'Original'}
          sub={optimized.output_format}
        />
        <Stat label="Time" value={`${optimized.processing_time_ms} ms`} sub="Processing time" />
      </div>

      <div className="relative">
        <div className="flex gap-2 mb-4" role="tablist" aria-label="Comparison view">
          {(['side-by-side', 'slider', 'stacked'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              role="tab"
              aria-selected={viewMode === mode}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                viewMode === mode
                  ? 'bg-accent-600 text-white'
                  : 'bg-brand-800 text-brand-300 hover:text-white hover:bg-brand-700'
              )}
            >
              {mode === 'side-by-side' ? 'Side by Side' : mode === 'slider' ? 'Slider' : 'Stacked'}
            </button>
          ))}
        </div>

        {viewMode !== 'slider' && (
          <div className={viewMode === 'stacked' ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>
            <PreviewPanel label="BEFORE" src={originalUrl} alt="Original" />
            <PreviewPanel label="AFTER" src={optimizedUrl} alt="Optimized" accent />
          </div>
        )}

        {viewMode === 'slider' && (
          <div
            ref={containerRef}
            className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800 touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onPointerLeave={stopDragging}
          >
            <img src={originalUrl ?? ''} alt="Original" className="absolute inset-0 w-full h-full object-contain" />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
              <img
                src={optimizedUrl ?? ''}
                alt="Optimized"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
            <div
              className="absolute top-0 bottom-0 w-1 bg-white/80 pointer-events-none"
              style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
            >
              <button
                type="button"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                role="slider"
                aria-label="Comparison slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sliderPosition)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 10 : 2;
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    setSliderPosition((value) => Math.max(0, value - step));
                  }
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    setSliderPosition((value) => Math.min(100, value + step));
                  }
                }}
              >
                <span className="sr-only">Drag or use arrow keys</span>
              </button>
            </div>
            <div className="absolute top-3 left-3 z-10">
              <Badge variant="outline" size="sm">BEFORE</Badge>
            </div>
            <div className="absolute top-3 right-3 z-10">
              <Badge variant="accent" size="sm">AFTER</Badge>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-brand-800">
        <button
          type="button"
          onClick={onDownload}
          disabled={isDownloading}
          className="w-full py-4 text-lg font-semibold rounded-lg text-white transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
            boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)',
          }}
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Preparing download…
            </>
          ) : (
            <>
              <Download className="w-5 h-5" /> DOWNLOAD OPTIMIZED WALLPAPER
            </>
          )}
        </button>
        <p className="mt-2 text-xs text-brand-500 text-center">
          {optimized.filename} • {optimized.mimeType}
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="text-center p-4 bg-brand-900/50 rounded-lg border border-brand-800">
      <p className="text-xs text-brand-500 uppercase tracking-wide">{label}</p>
      <p className={cn('text-2xl font-mono font-medium mt-1', accent ? 'text-accent-400' : 'text-white')}>
        {value}
      </p>
      <p className="text-xs text-brand-500 mt-1">{sub}</p>
    </div>
  );
}

function PreviewPanel({
  label,
  src,
  alt,
  accent,
}: {
  label: string;
  src: string | null;
  alt: string;
  accent?: boolean;
}) {
  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
      <div className="absolute top-3 left-3 z-10">
        <Badge variant={accent ? 'accent' : 'outline'} size="sm">{label}</Badge>
      </div>
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-brand-600 text-sm">
          Preview unavailable
        </div>
      )}
    </div>
  );
}
