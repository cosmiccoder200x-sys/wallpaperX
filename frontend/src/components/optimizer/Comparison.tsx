import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { formatBytes } from '../../utils/format';
import { Badge } from '../ui/Badge';
import type { ImageAnalysis, OptimizationResult } from '../../types';

interface ComparisonProps {
  original: ImageAnalysis;
  optimized: OptimizationResult;
  onDownload: () => void;
  isDownloading?: boolean;
}

export function Comparison({ original, optimized, onDownload, isDownloading }: ComparisonProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider' | 'stacked'>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSliderMove = (e: MouseEvent | TouchEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const position = ((clientX - rect.left) / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, position)));
  };

  const handleMouseDown = () => {
    window.addEventListener('mousemove', handleSliderMove as EventListener);
    window.addEventListener('touchmove', handleSliderMove as EventListener, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
  };

  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleSliderMove as EventListener);
    window.removeEventListener('touchmove', handleSliderMove as EventListener);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('touchend', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      handleMouseUp();
    };
  }, []);

  const compressionRatio = ((original.size - optimized.output_size) / original.size * 100).toFixed(1);
  const savedBytes = original.size - optimized.output_size;

  return (
    <div className="animate-in space-y-6" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Optimization Complete</h2>
          <p className="text-brand-400 mt-1">
            Your wallpaper has been optimized to {formatBytes(optimized.output_size)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" size="lg">
            {compressionRatio}% smaller
          </Badge>
          <Badge variant="accent" size="lg">
            {formatBytes(savedBytes)} saved
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="text-center p-4 bg-brand-900/50 rounded-lg border border-brand-800">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Before</p>
          <p className="text-2xl font-mono font-medium text-white mt-1">
            {formatBytes(original.size)}
          </p>
          <p className="text-xs text-brand-500 mt-1">
            {original.width} × {original.height} • {original.format}
          </p>
        </div>
        <div className="text-center p-4 bg-brand-900/50 rounded-lg border border-brand-800">
          <p className="text-xs text-brand-500 uppercase tracking-wide">After</p>
          <p className="text-2xl font-mono font-medium text-accent-400 mt-1">
            {formatBytes(optimized.output_size)}
          </p>
          <p className="text-xs text-brand-500 mt-1">
            {optimized.output_width} × {optimized.output_height} • {optimized.output_format}
          </p>
        </div>
        <div className="text-center p-4 bg-brand-900/50 rounded-lg border border-brand-800">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Quality</p>
          <p className="text-2xl font-mono font-medium text-green-400 mt-1">
            Q{optimized.quality_used}
          </p>
          <p className="text-xs text-brand-500 mt-1">
            {optimized.output_format}
          </p>
        </div>
        <div className="text-center p-4 bg-brand-900/50 rounded-lg border border-brand-800">
          <p className="text-xs text-brand-500 uppercase tracking-wide">Time</p>
          <p className="text-2xl font-mono font-medium text-white mt-1">
            {optimized.processing_time_ms}ms
          </p>
          <p className="text-xs text-brand-500 mt-1">
            Processing time
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setViewMode('side-by-side')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'side-by-side'
                ? 'bg-accent-600 text-white'
                : 'bg-brand-800 text-brand-300 hover:text-white hover:bg-brand-700'
            )}
          >
            Side by Side
          </button>
          <button
            type="button"
            onClick={() => setViewMode('slider')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'slider'
                ? 'bg-accent-600 text-white'
                : 'bg-brand-800 text-brand-300 hover:text-white hover:bg-brand-700'
            )}
          >
            Slider
          </button>
          <button
            type="button"
            onClick={() => setViewMode('stacked')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              viewMode === 'stacked'
                ? 'bg-accent-600 text-white'
                : 'bg-brand-800 text-brand-300 hover:text-white hover:bg-brand-700'
            )}
          >
            Stacked
          </button>
        </div>

        {viewMode === 'side-by-side' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
              <div className="absolute top-3 left-3 z-10">
                <Badge variant="outline" size="sm">BEFORE</Badge>
              </div>
              <img
                src={URL.createObjectURL(original as any)}
                alt="Original"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
              <div className="absolute top-3 left-3 z-10">
                <Badge variant="accent" size="sm">AFTER</Badge>
              </div>
              <img
                src={URL.createObjectURL(optimized as any)}
                alt="Optimized"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {viewMode === 'slider' && (
          <div 
            ref={containerRef}
            className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800"
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
          >
            <img
              src={URL.createObjectURL(original as any)}
              alt="Original"
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
              <img
                src={URL.createObjectURL(optimized as any)}
                alt="Optimized"
                className="w-full h-full object-cover"
              />
            </div>
            <div
              ref={sliderRef}
              className="absolute top-0 bottom-0 w-1 bg-white/80 pointer-events-none transition-transform duration-75"
              style={{ 
                left: `${sliderPosition}%`,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 20px rgba(0,0,0,0.5)'
              }}
              role="slider"
              aria-label="Comparison slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPosition)}
              tabIndex={0}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 10 : 1;
                if (e.key === 'ArrowLeft') setSliderPosition(p => Math.max(0, p - step));
                if (e.key === 'ArrowRight') setSliderPosition(p => Math.min(100, p + step));
              }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-3 h-3 text-brand-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="absolute top-3 left-3 z-10">
              <Badge variant="outline" size="sm">BEFORE</Badge>
            </div>
            <div className="absolute top-3 right-3 z-10">
              <Badge variant="accent" size="sm">AFTER</Badge>
            </div>
          </div>
        )}

        {viewMode === 'stacked' && (
          <div className="space-y-4">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
              <div className="absolute top-3 left-3 z-10">
                <Badge variant="outline" size="sm">BEFORE</Badge>
              </div>
              <img
                src={URL.createObjectURL(original as any)}
                alt="Original"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
              <div className="absolute top-3 left-3 z-10">
                <Badge variant="accent" size="sm">AFTER</Badge>
              </div>
              <img
                src={URL.createObjectURL(optimized as any)}
                alt="Optimized"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-brand-800">
        <button
          onClick={onDownload}
          disabled={isDownloading}
          className="w-full btn-primary py-4 text-lg font-semibold"
          style={{ 
            background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
            boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)'
          }}
        >
          {isDownloading ? 'Preparing download...' : 'DOWNLOAD OPTIMIZED WALLPAPER'}
        </button>
      </div>
    </div>
  );
}