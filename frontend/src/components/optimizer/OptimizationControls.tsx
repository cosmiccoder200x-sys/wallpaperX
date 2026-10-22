import { useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { formatBytes } from '../../utils/format';
import type { ImageAnalysis, OutputFormat } from '../../types';

const MB = 1024 * 1024;
const PRESETS = [1, 5, 10];

interface OptimizationControlsProps {
  analysis: ImageAnalysis | null;
  targetSize: number;
  onTargetSizeChange: (size: number) => void;
  outputFormat: OutputFormat;
  onOutputFormatChange: (format: OutputFormat) => void;
  targetResolution: string;
  onTargetResolutionChange: (resolution: string) => void;
  customWidth: string;
  customHeight: string;
  onCustomWidthChange: (value: string) => void;
  onCustomHeightChange: (value: string) => void;
  isOptimizing: boolean;
  onOptimize: () => void;
  planLimits: { max_output_mb: number; daily_remaining: number };
  /** URL mode submits from the URL form, so the file button is hidden. */
  showOptimizeButton?: boolean;
}

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
  customWidth,
  customHeight,
  onCustomWidthChange,
  onCustomHeightChange,
  isOptimizing,
  onOptimize,
  planLimits,
  showOptimizeButton = true,
}: OptimizationControlsProps) {
  const [unit, setUnit] = useState<'MB' | 'KB'>('MB');
  const [customValue, setCustomValue] = useState('1');
  const [customMode, setCustomMode] = useState(
    () => !PRESETS.some((mb) => targetSize === mb * MB)
  );
  const maxOutputBytes = planLimits.max_output_mb * MB;

  const isPreset = !customMode && PRESETS.some((mb) => targetSize === mb * MB);
  const recommendedFormat = analysis?.estimated_optimization.recommended_format ?? 'WEBP';

  const boundaryError = useMemo(() => {
    if (customMode && targetSize > maxOutputBytes) {
      return `Your plan allows at most ${planLimits.max_output_mb} MB per output.`;
    }
    return null;
  }, [customMode, maxOutputBytes, planLimits.max_output_mb, targetSize]);

  const selectPreset = (mb: number) => {
    setCustomMode(false);
    onTargetSizeChange(mb * MB);
    setUnit('MB');
    setCustomValue(String(mb));
  };

  const selectCustom = () => {
    setCustomMode(true);
    if (isPreset) {
      setUnit('MB');
      setCustomValue((targetSize / MB).toFixed(2).replace(/\.?0+$/, ''));
    }
    // Keep the current target so the form stays valid until the user edits it.
  };

  const applyCustomValue = (raw: string, nextUnit: 'MB' | 'KB') => {
    setCustomValue(raw);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const bytes = nextUnit === 'MB' ? parsed * MB : parsed * 1024;
    onTargetSizeChange(Math.min(bytes, maxOutputBytes));
  };

  const canOptimize = Boolean(analysis) && !isOptimizing && !boundaryError && targetSize >= 1024;

  return (
    <div className="space-y-6 animate-in" style={{ animationDelay: '100ms' }}>
      <div>
        <label className="block text-sm font-medium text-brand-300 mb-3">Target Size</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((mb) => (
            <button
              key={mb}
              type="button"
              onClick={() => selectPreset(mb)}
              disabled={isOptimizing}
              aria-pressed={targetSize === mb * MB}
              className={cn(
                'px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 border min-w-[80px]',
                targetSize === mb * MB
                  ? 'bg-accent-600 border-accent-500 text-white shadow-sm shadow-accent-500/20'
                  : 'bg-brand-900 border-brand-700 text-brand-300 hover:border-brand-600 hover:text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {mb} MB
            </button>
          ))}
          <button
            type="button"
            onClick={selectCustom}
            disabled={isOptimizing}
            aria-pressed={customMode}
            className={cn(
              'px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 border min-w-[80px]',
              customMode
                ? 'bg-accent-600 border-accent-500 text-white shadow-sm shadow-accent-500/20'
                : 'bg-brand-900 border-brand-700 text-brand-300 hover:border-brand-600 hover:text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Custom
          </button>
        </div>

        {customMode && (
          <div className="mt-3 flex items-center gap-3 max-w-xs">
            <input
              type="number"
              min={unit === 'MB' ? 0.01 : 1}
              max={unit === 'MB' ? planLimits.max_output_mb : planLimits.max_output_mb * 1024}
              step={unit === 'MB' ? 0.1 : 10}
              value={customValue}
              onChange={(event) => applyCustomValue(event.target.value, unit)}
              disabled={isOptimizing}
              className="flex-1 px-4 py-2.5 rounded-lg bg-brand-900 border border-brand-700 text-white focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
              aria-label={`Custom target size in ${unit}`}
              data-testid="custom-size"
            />
            <select
              value={unit}
              onChange={(event) => {
                const nextUnit = event.target.value as 'MB' | 'KB';
                setUnit(nextUnit);
                applyCustomValue(customValue, nextUnit);
              }}
              disabled={isOptimizing}
              className="px-3 py-2.5 rounded-lg bg-brand-900 border border-brand-700 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              aria-label="Custom target size unit"
            >
              <option value="MB">MB</option>
              <option value="KB">KB</option>
            </select>
          </div>
        )}

        <p className="mt-2 text-xs text-brand-500">
          Current target: {targetSize > 0 ? formatBytes(targetSize) : 'not set'} • Max output:{' '}
          {planLimits.max_output_mb} MB
          {planLimits.daily_remaining > -1 &&
            ` • ${planLimits.daily_remaining} optimization${planLimits.daily_remaining === 1 ? '' : 's'} left today`}
        </p>
        {boundaryError && (
          <p className="mt-1 text-xs text-red-400" role="alert">
            {boundaryError}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-brand-300 mb-3" htmlFor="output-format">
          Output Format
        </label>
        <Select
          id="output-format"
          value={outputFormat}
          onChange={(event) => onOutputFormatChange(event.target.value as OutputFormat)}
          options={FORMAT_OPTIONS}
          disabled={isOptimizing}
          className="max-w-xs"
        />
        {analysis && (
          <p className="mt-2 text-xs text-brand-500">
            Recommended: <span className="text-brand-300 font-medium">{recommendedFormat}</span>
            {outputFormat === 'AUTO' && ' — the server picks the best encoder for this image.'}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-brand-300 mb-3" htmlFor="target-resolution">
          Resolution
        </label>
        <Select
          id="target-resolution"
          value={targetResolution}
          onChange={(event) => onTargetResolutionChange(event.target.value)}
          options={RESOLUTION_OPTIONS}
          disabled={isOptimizing}
          className="max-w-xs"
        />

        {targetResolution === 'custom' && (
          <div className="mt-3 flex items-center gap-3 max-w-sm">
            <div className="flex-1">
              <label className="block text-xs text-brand-500 mb-1" htmlFor="custom-width">
                Max width
              </label>
              <input
                id="custom-width"
                type="number"
                min={16}
                max={16384}
                value={customWidth}
                onChange={(event) => onCustomWidthChange(event.target.value)}
                disabled={isOptimizing}
                className="w-full px-3 py-2 rounded-lg bg-brand-900 border border-brand-700 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                placeholder="3840"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-brand-500 mb-1" htmlFor="custom-height">
                Max height
              </label>
              <input
                id="custom-height"
                type="number"
                min={16}
                max={16384}
                value={customHeight}
                onChange={(event) => onCustomHeightChange(event.target.value)}
                disabled={isOptimizing}
                className="w-full px-3 py-2 rounded-lg bg-brand-900 border border-brand-700 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                placeholder="2160"
              />
            </div>
          </div>
        )}

        {analysis && (
          <p className="mt-2 text-xs text-brand-500">
            Original:{' '}
            <span className="font-mono text-brand-300">
              {analysis.width} × {analysis.height}
            </span>
            {analysis.megapixels > 8 && (
              <Badge variant="accent" size="sm" className="ml-2">
                High resolution
              </Badge>
            )}
          </p>
        )}
        <p className="mt-1 text-xs text-brand-500">
          Width and height are upper bounds. Aspect ratio is preserved and images are never upscaled.
        </p>
      </div>

      {showOptimizeButton && (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={onOptimize}
          disabled={!canOptimize}
          loading={isOptimizing}
        >
          <Wand2 className="w-4 h-4" />
          {isOptimizing ? 'Optimizing…' : 'Optimize Wallpaper'}
        </Button>
      )}
    </div>
  );
}
