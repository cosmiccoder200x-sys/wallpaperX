import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, Info, Sparkles, X } from 'lucide-react';
import { UploadArea } from '../components/optimizer/UploadArea';
import { UrlInput } from '../components/optimizer/UrlInput';
import { OptimizationControls } from '../components/optimizer/OptimizationControls';
import { Comparison } from '../components/optimizer/Comparison';
import { optimizeApi, handleApiError } from '../services/api';
import { formatBytes } from '../utils/format';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import type {
  ImageAnalysis,
  ImageFormat,
  OptimizationResult,
  OutputFormat,
  PlanLimits,
} from '../types';

const MB = 1024 * 1024;

const RESOLUTION_PRESETS: Record<string, { width: number; height: number } | undefined> = {
  '4k': { width: 3840, height: 2160 },
  '2k': { width: 2560, height: 1440 },
  '1080p': { width: 1920, height: 1080 },
};

const DEFAULT_LIMITS: PlanLimits = {
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

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function analysisFromResult(result: OptimizationResult): ImageAnalysis {
  const divisor = gcd(result.original_width, result.original_height) || 1;
  return {
    filename: result.filename,
    format: result.original_format,
    mime_type: result.mimeType,
    size: result.original_size,
    size_formatted: formatBytes(result.original_size),
    width: result.original_width,
    height: result.original_height,
    dimensions: `${result.original_width} × ${result.original_height}`,
    aspect_ratio: `${result.original_width / divisor}:${result.original_height / divisor}`,
    megapixels: (result.original_width * result.original_height) / 1_000_000,
    has_transparency: false,
    mode: 'unknown',
    estimated_optimization: {
      recommended_format: result.output_format,
      estimated_size_mb: result.output_size / MB,
      estimated_compression_pct: result.compression_ratio,
      can_reach_1mb: result.target_met && result.target_size <= MB,
      can_reach_5mb: result.target_met && result.target_size <= 5 * MB,
      can_reach_10mb: result.target_met && result.target_size <= 10 * MB,
    },
  };
}

export function Optimizer() {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult | null>(null);
  const [optimizedUrl, setOptimizedUrl] = useState<string | null>(null);
  const [urlSource, setUrlSource] = useState<string | null>(null);
  const [urlAnalysis, setUrlAnalysis] = useState<ImageAnalysis | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isUrlLoading, setIsUrlLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetSize, setTargetSize] = useState(10 * MB);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('AUTO');
  const [targetResolution, setTargetResolution] = useState('original');
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [planLimits, setPlanLimits] = useState<PlanLimits>(DEFAULT_LIMITS);

  const analyzeAbort = useRef<AbortController | null>(null);
  const optimizeAbort = useRef<AbortController | null>(null);
  const analyzeSeq = useRef(0);
  const optimizeSeq = useRef(0);

  // Preview of the real selected file; revoked whenever the file changes.
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // Preview of the optimized blob; revoked whenever the result changes.
  useEffect(() => {
    if (!optimized) {
      setOptimizedUrl(null);
      return;
    }
    const url = URL.createObjectURL(optimized.blob);
    setOptimizedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [optimized]);

  // A result is only valid for the settings that produced it.
  useEffect(() => {
    setOptimized(null);
  }, [targetSize, outputFormat, targetResolution, customWidth, customHeight]);

  useEffect(() => {
    let cancelled = false;
    optimizeApi
      .limits()
      .then((response) => {
        if (cancelled) return;
        const data = response.data.data;
        if (data) setPlanLimits({ ...DEFAULT_LIMITS, ...data });
      })
      .catch(() => {
        /* keep safe defaults; the optimizer still works anonymously */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      analyzeAbort.current?.abort();
      optimizeAbort.current?.abort();
    };
  }, []);

  const cancelRequests = useCallback(() => {
    analyzeAbort.current?.abort();
    optimizeAbort.current?.abort();
    analyzeSeq.current += 1;
    optimizeSeq.current += 1;
    setIsAnalyzing(false);
    setIsOptimizing(false);
    setIsUrlLoading(false);
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    const seq = analyzeSeq.current + 1;
    analyzeSeq.current = seq;
    analyzeAbort.current?.abort();
    const controller = new AbortController();
    analyzeAbort.current = controller;

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await optimizeApi.analyze(file, controller.signal);
      if (seq !== analyzeSeq.current) return;
      const data = response.data.data;
      if (!data) throw new Error('The server did not return image details');
      setAnalysis(data);
    } catch (err) {
      if (axios.isCancel(err) || seq !== analyzeSeq.current) return;
      setAnalysis(null);
      setError(handleApiError(err).message);
    } finally {
      if (seq === analyzeSeq.current) {
        setIsAnalyzing(false);
      }
    }
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      cancelRequests();
      setMode('upload');
      setSelectedFile(file);
      setAnalysis(null);
      setOptimized(null);
      setUrlSource(null);
      setUrlAnalysis(null);
      setError(null);
      void analyzeFile(file);
    },
    [analyzeFile, cancelRequests]
  );

  const handleValidationError = useCallback((message: string) => {
    setError(message);
  }, []);

  const clearFile = useCallback(() => {
    cancelRequests();
    setSelectedFile(null);
    setAnalysis(null);
    setOptimized(null);
    setError(null);
  }, [cancelRequests]);

  const switchMode = useCallback(
    (next: 'upload' | 'url') => {
      if (next === mode) return;
      cancelRequests();
      setMode(next);
      setError(null);
      setOptimized(null);
      if (next === 'upload') {
        setUrlSource(null);
        setUrlAnalysis(null);
      } else {
        setSelectedFile(null);
        setAnalysis(null);
      }
    },
    [cancelRequests, mode]
  );

  const resolutionBounds = useCallback((): { targetWidth?: number; targetHeight?: number } => {
    if (targetResolution === 'original') return {};
    if (targetResolution === 'custom') {
      const width = Number(customWidth);
      const height = Number(customHeight);
      return {
        targetWidth: Number.isFinite(width) && width > 0 ? width : undefined,
        targetHeight: Number.isFinite(height) && height > 0 ? height : undefined,
      };
    }
    const preset = RESOLUTION_PRESETS[targetResolution];
    return preset ? { targetWidth: preset.width, targetHeight: preset.height } : {};
  }, [customHeight, customWidth, targetResolution]);

  const validateSettings = useCallback((): string | null => {
    if (targetSize < 1024) return 'Choose a target size of at least 1 KB.';
    if (targetSize > planLimits.max_output_mb * MB) {
      return `Your plan allows a maximum output of ${planLimits.max_output_mb} MB.`;
    }
    if (targetResolution === 'custom') {
      const width = Number(customWidth);
      const height = Number(customHeight);
      const hasWidth = customWidth.trim() !== '';
      const hasHeight = customHeight.trim() !== '';
      if (!hasWidth && !hasHeight) {
        return 'Enter a maximum width, a maximum height, or both.';
      }
      for (const [label, raw, present] of [
        ['width', width, hasWidth],
        ['height', height, hasHeight],
      ] as const) {
        if (present && (!Number.isFinite(raw) || raw < 16 || raw > 16384)) {
          return `Custom ${label} must be between 16 and 16384 pixels.`;
        }
      }
    }
    return null;
  }, [customHeight, customWidth, planLimits.max_output_mb, targetResolution, targetSize]);

  const handleOptimize = useCallback(async () => {
    if (!selectedFile || !analysis || isOptimizing || isAnalyzing) return;

    const settingsError = validateSettings();
    if (settingsError) {
      setError(settingsError);
      return;
    }

    const seq = optimizeSeq.current + 1;
    optimizeSeq.current = seq;
    optimizeAbort.current?.abort();
    const controller = new AbortController();
    optimizeAbort.current = controller;

    setIsOptimizing(true);
    setError(null);
    setOptimized(null);

    try {
      const result = await optimizeApi.optimize(
        selectedFile,
        {
          targetSizeBytes: targetSize,
          outputFormat,
          ...resolutionBounds(),
        },
        controller.signal
      );
      if (seq !== optimizeSeq.current) return;
      setOptimized(result);
      setPlanLimits((current) => ({
        ...current,
        daily_remaining:
          current.daily_remaining > 0 ? current.daily_remaining - 1 : current.daily_remaining,
      }));
    } catch (err) {
      if (axios.isCancel(err) || seq !== optimizeSeq.current) return;
      setError(handleApiError(err).message);
    } finally {
      if (seq === optimizeSeq.current) {
        setIsOptimizing(false);
      }
    }
  }, [
    analysis,
    isAnalyzing,
    isOptimizing,
    outputFormat,
    resolutionBounds,
    selectedFile,
    targetSize,
    validateSettings,
  ]);

  const handleUrlOptimize = useCallback(
    async (url: string) => {
      const settingsError = validateSettings();
      if (settingsError) {
        setError(settingsError);
        return;
      }

      const seq = optimizeSeq.current + 1;
      optimizeSeq.current = seq;
      optimizeAbort.current?.abort();
      const controller = new AbortController();
      optimizeAbort.current = controller;

      setIsUrlLoading(true);
      setError(null);
      setOptimized(null);

      try {
        const result = await optimizeApi.optimizeUrl(
          url,
          {
            targetSizeBytes: targetSize,
            outputFormat,
            ...resolutionBounds(),
          },
          controller.signal
        );
        if (seq !== optimizeSeq.current) return;
        setUrlSource(url);
        setUrlAnalysis(analysisFromResult(result));
        setOptimized(result);
        setPlanLimits((current) => ({
          ...current,
          daily_remaining:
            current.daily_remaining > 0 ? current.daily_remaining - 1 : current.daily_remaining,
        }));
      } catch (err) {
        if (axios.isCancel(err) || seq !== optimizeSeq.current) return;
        setError(handleApiError(err).message);
      } finally {
        if (seq === optimizeSeq.current) {
          setIsUrlLoading(false);
        }
      }
    },
    [outputFormat, resolutionBounds, targetSize, validateSettings]
  );

  const clearUrl = useCallback(() => {
    cancelRequests();
    setUrlSource(null);
    setUrlAnalysis(null);
    setOptimized(null);
    setError(null);
  }, [cancelRequests]);

  const handleDownload = useCallback(() => {
    if (!optimized) return;
    setIsDownloading(true);
    try {
      const url = optimizedUrl ?? URL.createObjectURL(optimized.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = optimized.filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (!optimizedUrl) {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      setError('The download could not be prepared. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [optimized, optimizedUrl]);

  const originalAnalysis = analysis ?? urlAnalysis;
  const optimizeInProgress = isOptimizing || isUrlLoading;
  const formatOptions = useMemo<ImageFormat[]>(
    () => ['JPEG', 'PNG', 'WEBP', 'AVIF'],
    []
  );

  return (
    <div className="min-h-screen bg-brand-950">
      <header className="border-b border-brand-800 bg-brand-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">WALLPAPERX</span>
              </Link>
              <nav className="hidden md:flex items-center gap-6">
                <Link to="/" className="text-sm text-brand-400 hover:text-white transition-colors">
                  Home
                </Link>
                <Link to="/optimizer" className="text-sm text-accent-400 font-medium">
                  Optimize
                </Link>
                <Link to="/wallpapers" className="text-sm text-brand-400 hover:text-white transition-colors">
                  Library
                </Link>
                <Link to="/studio" className="text-sm text-brand-400 hover:text-white transition-colors">
                  Studio
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-brand-300 hover:text-white transition-colors">
                Sign in
              </Link>
              <Link to="/register" className="text-sm text-brand-300 hover:text-white transition-colors">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-12 gap-8">
          <section className="lg:col-span-8 space-y-6">
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight flex items-center gap-2">
                <Sparkles className="w-7 h-7 text-accent-400" />
                Optimize Your Wallpaper
              </h1>
              <p className="text-brand-400 text-lg">
                Upload an image or paste a URL. We compress it to your target size while keeping the
                highest quality that fits.
              </p>
            </div>

            {error && (
              <div
                className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200"
                role="alert"
              >
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">Something went wrong</p>
                  <p className="opacity-90 mt-0.5">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-300 hover:text-white"
                  aria-label="Dismiss error"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {!optimized && (
              <div className="card">
                <div className="p-6 space-y-6">
                  <div className="flex gap-2 border-b border-brand-800 pb-2" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'upload'}
                      onClick={() => switchMode('upload')}
                      className={
                        mode === 'upload'
                          ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-600 text-white'
                          : 'px-3 py-1.5 rounded-lg text-sm font-medium text-brand-400 hover:text-white'
                      }
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'url'}
                      onClick={() => switchMode('url')}
                      className={
                        mode === 'url'
                          ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-600 text-white'
                          : 'px-3 py-1.5 rounded-lg text-sm font-medium text-brand-400 hover:text-white'
                      }
                    >
                      From URL
                    </button>
                  </div>

                  {mode === 'upload' ? (
                    <UploadArea
                      selectedFile={selectedFile}
                      previewUrl={previewUrl}
                      analysis={analysis}
                      isAnalyzing={isAnalyzing}
                      isOptimizing={isOptimizing}
                      maxSizeMB={planLimits.max_input_mb}
                      error={null}
                      onFileSelect={handleFileSelect}
                      onValidationError={handleValidationError}
                      onClear={clearFile}
                    />
                  ) : (
                    <UrlInput
                      onOptimize={handleUrlOptimize}
                      isLoading={isUrlLoading}
                      sourceUrl={urlSource}
                      clearUrl={clearUrl}
                      disabled={isOptimizing}
                      maxSizeMB={planLimits.max_input_mb}
                    />
                  )}
                </div>
              </div>
            )}

            {!optimized && (mode === 'url' || analysis) && (
              <div className="card">
                <div className="p-6">
                  <OptimizationControls
                    analysis={analysis}
                    targetSize={targetSize}
                    onTargetSizeChange={setTargetSize}
                    outputFormat={outputFormat}
                    onOutputFormatChange={setOutputFormat}
                    targetResolution={targetResolution}
                    onTargetResolutionChange={setTargetResolution}
                    customWidth={customWidth}
                    customHeight={customHeight}
                    onCustomWidthChange={setCustomWidth}
                    onCustomHeightChange={setCustomHeight}
                    isOptimizing={optimizeInProgress}
                    onOptimize={handleOptimize}
                    planLimits={{
                      max_output_mb: planLimits.max_output_mb,
                      daily_remaining: planLimits.daily_remaining,
                    }}
                    showOptimizeButton={mode === 'upload'}
                  />
                </div>
              </div>
            )}

            {optimized && originalAnalysis && (
              <div className="card">
                <div className="p-6 space-y-6">
                  <Comparison
                    original={originalAnalysis}
                    optimized={optimized}
                    originalUrl={mode === 'url' ? urlSource : previewUrl}
                    optimizedUrl={optimizedUrl}
                    onDownload={handleDownload}
                    isDownloading={isDownloading}
                  />
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setOptimized(null);
                      // Keep the URL so the form comes back pre-filled with the same source.
                      if (mode === 'url') setUrlAnalysis(null);
                    }}
                  >
                    Optimize again
                  </Button>
                </div>
              </div>
            )}
          </section>

          <aside className="lg:col-span-4 space-y-6">
            <div className="card">
              <div className="p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Your plan</h2>
                <div className="flex items-center justify-between">
                  <span className="text-brand-400 text-sm">Plan</span>
                  <Badge variant="accent" className="capitalize">
                    {planLimits.plan}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-brand-400 text-sm">Max input</span>
                  <span className="text-white text-sm">{planLimits.max_input_mb} MB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-brand-400 text-sm">Max output</span>
                  <span className="text-white text-sm">{planLimits.max_output_mb} MB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-brand-400 text-sm">Remaining today</span>
                  <span className="text-white text-sm">
                    {planLimits.daily_remaining < 0 ? 'Unlimited' : planLimits.daily_remaining}
                  </span>
                </div>
                <p className="text-xs text-brand-500">
                  Output formats: {formatOptions.join(', ')}
                </p>
              </div>
            </div>

            <div className="card">
              <div className="p-6 space-y-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-accent-400" />
                  How it works
                </h2>
                <ul className="text-sm text-brand-400 space-y-2 list-disc pl-5">
                  <li>Your target is a maximum, not a guarantee of exact bytes.</li>
                  <li>Quality is searched within the target; the actual encoded size is measured.</li>
                  <li>Transparency is preserved for PNG, WebP and AVIF.</li>
                  <li>Images are never upscaled or stretched.</li>
                  <li>Files are processed in memory and never stored.</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
