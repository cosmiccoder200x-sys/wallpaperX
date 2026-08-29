import { useMemo } from 'react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import type { ImageFormat, ImageAnalysis } from '../../types';

interface OptimizationControlsProps {
  analysis: ImageAnalysis | null;
  targetSize: number;
  onTargetSizeChange: (size: number) => void;
  outputFormat: ImageFormat;
  onOutputFormatChange: (format: ImageFormat) => void;
  targetResolution: string;
  onTargetResolutionChange: (resolution: string) => void;
  isOptimizing: boolean;
  onOptimize: () => Promise<void>;
  planLimits: { max_output_mb: number; daily_remaining: number };
}

const TARGET_SIZES = [
  { value: 1, label: '1 MB', unit: 'MB' },
  { value: 5, label: '5 MB', unit: 'MB' },
  { value: 10, label: '10 MB', unit: 'MB' },
  { value: 0, label: 'Custom', unit: 'MB' },
];

const FORMAT_OPTIONS = [
  { value: 'AUTO', label: 'Auto (Recommended)' },
  { value: 'WEBP', label: 'WebP' },
  { value: 'JPEG', label: 'JPG' },
  { value: 'AVIF', label: 'AVIF' },
  { value: 'PNG', label: 'PNG' },
];

const RESOLUTION_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: '4k', label: '4K (3840×2160)' },
  { value: '2k', label: '2K (2560×1440)' },
  { value: '1080p', label: '1080p (1920×1080)' },
  { value: 'custom', label: 'Custom' },
];

export function OptimizationControls({
  analysis,
  targetSize,
  onTargetSizeChange,
  outputFormat,
  onOutputFormatChange,
  targetResolution,
  onTargetResolutionChange,
  isOptimizing,
  onOptimize,
  planLimits,
}: OptimizationControlsProps) {
  const recommendedFormat = useMemo(() => {
    if (!analysis) return 'AUTO';
    return analysis.estimated_optimization.recommended_format;
  }, [analysis]);

  const canOptimize = analysis && !isOptimizing;
  const showCustomSize = targetSize === 0;

  const handleCustomSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    const size = e.target.dataset.unit === 'kb' ? value * 1024 : value * 1024 * 1024;
    onTargetSizeChange(Math.min(size, planLimits.max_output_mb * 1024 * 1024));
  };

  return (
    <div className="space-y-6 animate-in" style={{ animationDelay: '100ms' }}>
      <div>
        <label className="block text-sm font-medium text-brand-300 mb-3">
          Target Size
        </label>
        <div className="flex flex-wrap gap-2">
          {TARGET_SIZES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onTargetSizeChange(value === 0 ? 0 : value * 1024 * 1024)}
              disabled={isOptimizing}
              className={cn(
                'px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200',
                'border min-w-[80px]',
                targetSize === (value === 0 ? 0 : value * 1024 * 1024)
                  ? 'bg-accent-600 border-accent-500 text-white shadow-sm shadow-accent-500/20'
                  : 'bg-brand-900 border-brand-700 text-brand-300 hover:border-brand-600 hover:text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        
        {showCustomSize && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 max-w-xs">
              <input
                type="number"
                min="1"
                max={planLimits.max_output_mb}
                step="0.1"
                data-unit="mb"
                value={(targetSize / 1024 / 1024).toFixed(1)}
                onChange={handleCustomSizeChange}
                className="w-full px-4 py-2.5 rounded-lg bg-brand-900 border border-brand-700 text-white placeholder-brand-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
                placeholder="Custom MB"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-brand-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={(e) => {
                    const input = e.target as HTMLInputElement;
                    const currentValue = parseFloat(
                      (document.querySelector('input[data-unit]') as HTMLInputElement)?.value || '0'
                    );
                    if (input.checked) {
                      onTargetSizeChange(currentValue * 1024);
                      (document.querySelector('input[data-unit]') as HTMLInputElement).setAttribute('data-unit', 'kb');
                    } else {
                      onTargetSizeChange(currentValue * 1024 * 1024);
                      (document.querySelector('input[data-unit]') as HTMLInputElement).setAttribute('data-unit', 'mb');
                    }
                  }}
                  className="w-4 h-4 rounded border-brand-700 bg-brand-900 text-accent-600 focus:ring-accent-500"
                />
                <span>KB</span>
              </label>
            </div>
          </div>
        )}
        
        <p className="mt-2 text-xs text-brand-500">
          Max output: {planLimits.max_output_mb} MB {planLimits.daily_remaining > -1 && `• {planLimits.daily_remaining} optimizations left today`}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-brand-300 mb-3">
          Output Format
        </label>
        <Select
          value={outputFormat}
          onChange={(e) => onOutputFormatChange(e.target.value as ImageFormat)}
          options={FORMAT_OPTIONS}
          disabled={isOptimizing}
          className="max-w-xs"
        />
        {analysis && (
          <p className="mt-2 text-xs text-brand-500">
            Recommended: <span className="text-brand-300 font-medium">{recommendedFormat}</span>
            {recommendedFormat !== 'AUTO' && recommendedFormat !== outputFormat && outputFormat !== 'AUTO' && (
              <span className="text-accent-400 ml-2">(Different from auto)</span>
            )}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-brand-300 mb-3">
          Resolution
        </label>
        <Select
          value={targetResolution}
          onChange={(e) => onTargetResolutionChange(e.target.value)}
          options={RESOLUTION_OPTIONS}
          disabled={isOptimizing}
          className="max-w-xs"
        />
        {analysis && (
          <p className="mt-2 text-xs text-brand-500">
            Original: <span className="font-mono text-brand-300">{analysis.width} × {analysis.height}</span>
            {analysis.estimated_optimization && analysis.megapixels > 8 && (
              <Badge variant="accent" size="sm" className="ml-2">
                High resolution - downscaling may help reach target size
              </Badge>
            )}
          </p>
        )}
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onOptimize}
        disabled={!canOptimize}
        loading={isOptimizing}
      >
        <span className="flex items-center justify-center gap-2">
          <span>Optimize Wallpaper</span>
        </span>
      </Button>
    </div>
  );
}