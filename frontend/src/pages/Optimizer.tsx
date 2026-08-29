import { useState, useCallback, useEffect } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { UploadArea } from '../components/optimizer/UploadArea';
import { UrlInput } from '../components/optimizer/UrlInput';
import { OptimizationControls } from '../components/optimizer/OptimizationControls';
import { Comparison } from '../components/optimizer/Comparison';
import { optimizeApi } from '../services/api';
import { handleApiError } from '../services/api';
import { cn } from '../utils/cn';
import type { ImageAnalysis, ImageFormat, OptimizationResult } from '../types';

const RESOLUTION_PRESETS: Record<string, { width: number; height: number } | null> = {
  original: null,
  '4k': { width: 3840, height: 2160 },
  '2k': { width: 2560, height: 1440 },
  '1080p': { width: 1920, height: 1080 },
  custom: null,
};

export function Optimizer() {
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult | null>(null);
  const [urlAnalysis, setUrlAnalysis] = useState<any>(null);
  const [urlOptimized, setUrlOptimized] = useState<OptimizationResult | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isUrlLoading, setIsUrlLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [targetSize, setTargetSize] = useState(10 * 1024 * 1024);
  const [outputFormat, setOutputFormat] = useState<ImageFormat>('AUTO');
  const [targetResolution, setTargetResolution] = useState('original');
  const [customWidth, _setCustomWidth] = useState('');
  const [customHeight, _setCustomHeight] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [planLimits, setPlanLimits] = useState({ max_output_mb: 10, daily_remaining: 5 });
  
  const activeTab = analysis ? 'upload' : urlAnalysis ? 'url' : 'upload';

  useEffect(() => {
    loadLimits();
  }, []);

  const loadLimits = async () => {
    try {
      const response = await optimizeApi.limits();
      setPlanLimits(response.data.data);
    } catch {
      // Use defaults
    }
  };

  const handleFileSelect = useCallback((_file: File) => {
    setError(null);
    setAnalysis(null);
    setOptimized(null);
    setUrlAnalysis(null);
    setUrlOptimized(null);
  }, []);

  const handleAnalyze = useCallback(async (file: File) => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await optimizeApi.analyze(file);
      setAnalysis(response.data.data);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message);
      setAnalysis(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleUrlOptimize = useCallback(async (url: string) => {
    setIsUrlLoading(true);
    setError(null);
    
    try {
      const response = await optimizeApi.optimizeUrl(url, {
        target_size_mb: targetSize / 1024 / 1024,
        output_format: outputFormat === 'AUTO' ? undefined : outputFormat,
        target_width: targetResolution !== 'original' && targetResolution !== 'custom' 
          ? RESOLUTION_PRESETS[targetResolution]?.width 
          : customWidth ? parseInt(customWidth) : undefined,
        target_height: targetResolution !== 'original' && targetResolution !== 'custom' 
          ? RESOLUTION_PRESETS[targetResolution]?.height 
          : customHeight ? parseInt(customHeight) : undefined,
      });
      
      const blob = response.data;
      const result: OptimizationResult = {
        success: true,
        output_size: blob.size,
        output_width: 0,
        output_height: 0,
        output_format: outputFormat === 'AUTO' ? 'WEBP' : outputFormat,
        quality_used: 85,
        processing_time_ms: 0,
        compression_ratio: 0,
        saved_bytes: 0,
        blob,
      };
      
      setUrlOptimized(result);
      setUrlAnalysis({ filename: url.split('/').pop() || 'image.jpg', size: blob.size });
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message);
    } finally {
      setIsUrlLoading(false);
    }
  }, [targetSize, outputFormat, targetResolution, customWidth, customHeight]);

  const handleOptimize = useCallback(async () => {
    if (!analysis) return;
    
    setIsOptimizing(true);
    setError(null);
    
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('target_size_mb', (targetSize / 1024 / 1024).toString());
    if (outputFormat !== 'AUTO') formData.append('output_format', outputFormat);
    
    const resolution = RESOLUTION_PRESETS[targetResolution];
    if (resolution) {
      formData.append('target_width', resolution.width.toString());
      formData.append('target_height', resolution.height.toString());
    } else if (targetResolution === 'custom') {
      if (customWidth) formData.append('target_width', customWidth);
      if (customHeight) formData.append('target_height', customHeight);
    }

    try {
      const response = await optimizeApi.optimize(file, {
        target_size_mb: targetSize / 1024 / 1024,
        output_format: outputFormat === 'AUTO' ? undefined : outputFormat,
        target_width: resolution?.width || (customWidth ? parseInt(customWidth) : undefined),
        target_height: resolution?.height || (customHeight ? parseInt(customHeight) : undefined),
      });
      
      const blob = response.data;
      const result: OptimizationResult = {
        success: true,
        output_size: blob.size,
        output_width: 0,
        output_height: 0,
        output_format: outputFormat === 'AUTO' ? 'WEBP' : outputFormat,
        quality_used: 85,
        processing_time_ms: 0,
        compression_ratio: 0,
        saved_bytes: 0,
        blob,
      };
      
      setOptimized(result);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message);
    } finally {
      setIsOptimizing(false);
    }
  }, [analysis, targetSize, outputFormat, targetResolution, customWidth, customHeight]);

  const handleDownload = useCallback(async () => {
    const result = optimized || urlOptimized;
    if (!result) return;
    
    setIsDownloading(true);
    
    try {
      let blob: Blob;
      if (result.blob) {
        blob = result.blob;
      } else {
        const response = await fetch(URL.createObjectURL(result as any));
        blob = await response.blob();
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `x-optimized.${(result.output_format || 'webp').toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [optimized, urlOptimized]);

  const clearFile = useCallback(() => {
    setAnalysis(null);
    setOptimized(null);
    setError(null);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, []);

  const clearUrl = useCallback(() => {
    setUrlAnalysis(null);
    setUrlOptimized(null);
  }, []);

  const currentAnalysis = analysis || urlAnalysis;
  const currentOptimized = optimized || urlOptimized;
  const currentIsOptimizing = isOptimizing || isUrlLoading;

  return (
    <div className="min-h-screen bg-brand-950">
      <header className="border-b border-brand-800 bg-brand-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <a href="/" className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">WALLPAPER10</span>
              </a>
              <nav className="hidden md:flex items-center gap-6">
                <a href="/" className="text-sm text-brand-400 hover:text-white transition-colors">Home</a>
                <a href="/optimizer" className="text-sm text-accent-400 font-medium">Optimize</a>
                <a href="/wallpapers" className="text-sm text-brand-400 hover:text-white transition-colors">Library</a>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <a href="/login" className="text-sm text-brand-300 hover:text-white transition-colors">Sign in</a>
              <a href="/register" className="btn-primary text-sm">Get Started</a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Optimize Your Wallpaper
              </h1>
              <p className="text-brand-400 text-lg">
                Upload an image or paste a URL. We'll compress it to your target size
                while preserving maximum visual quality.
              </p>
            </div>

            <div className="card card-hover">
              <div className="p-6">
                <div className="flex gap-4 mb-6 border-b border-brand-800">
                  <button
                    onClick={() => {}}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                      activeTab === 'upload'
                        ? 'border-accent-500 text-white'
                        : 'border-transparent text-brand-400 hover:text-brand-200'
                    )}
                  >
                    Upload File
                  </button>
                  <button
                    onClick={() => {}}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                      activeTab === 'url'
                        ? 'border-accent-500 text-white'
                        : 'border-transparent text-brand-400 hover:text-brand-200'
                    )}
                  >
                    From URL
                  </button>
                </div>

                {activeTab === 'upload' ? (
                  <UploadArea
                    onFileSelect={handleFileSelect}
                    onAnalyze={handleAnalyze}
                    analysis={analysis}
                    isAnalyzing={isAnalyzing}
                    isOptimizing={currentIsOptimizing}
                    maxSizeMB={planLimits.max_output_mb * 5}
                    clearFile={clearFile}
                  />
                ) : (
                  <UrlInput
                    onOptimize={handleUrlOptimize}
                    isLoading={isUrlLoading}
                    analysis={urlAnalysis}
                    clearUrl={clearUrl}
                  />
                )}
              </div>
            </div>

            {analysis && !currentOptimized && (
              <div className="card card-hover">
                <div className="p-6">
                  <OptimizationControls
                    analysis={analysis}
                    targetSize={targetSize}
                    onTargetSizeChange={setTargetSize}
                    outputFormat={outputFormat}
                    onOutputFormatChange={setOutputFormat}
                    targetResolution={targetResolution}
                    onTargetResolutionChange={setTargetResolution}
                    isOptimizing={currentIsOptimizing}
                    onOptimize={handleOptimize}
                    planLimits={planLimits}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="card border-red-500/30 bg-red-500/10">
                <div className="p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-red-300">{error}</p>
                </div>
              </div>
            )}

            {currentOptimized && currentAnalysis && (
              <Comparison
                original={currentAnalysis}
                optimized={currentOptimized}
                onDownload={handleDownload}
                isDownloading={isDownloading}
              />
            )}
          </div>

          <aside className="lg:col-span-5 space-y-6">
            <div className="card card-hover sticky top-24">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">How it works</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent-400 font-bold text-sm">01</span>
                    </div>
                    <div>
                      <p className="font-medium text-white">Upload</p>
                      <p className="text-sm text-brand-400">Drag & drop or paste a URL</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent-400 font-bold text-sm">02</span>
                    </div>
                    <div>
                      <p className="font-medium text-white">Optimize</p>
                      <p className="text-sm text-brand-400">Smart compression to target size</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent-400 font-bold text-sm">03</span>
                    </div>
                    <div>
                      <p className="font-medium text-white">Download</p>
                      <p className="text-sm text-brand-400">Get your optimized wallpaper</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-hover">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Target Size Presets</h3>
                <div className="space-y-3">
                  {[
                    { label: '1 MB', desc: 'Mobile optimized', size: 1 },
                    { label: '5 MB', desc: 'Balanced quality', size: 5 },
                    { label: '10 MB', desc: 'High quality desktop', size: 10 },
                  ].map(({ label, desc, size }) => (
                    <button
                      key={size}
                      onClick={() => setTargetSize(size * 1024 * 1024)}
                      className={cn(
                        'w-full p-4 rounded-lg border text-left transition-all',
                        targetSize === size * 1024 * 1024
                          ? 'bg-accent-500/10 border-accent-500'
                          : 'border-brand-700 hover:border-brand-600'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-white">{label}</p>
                          <p className="text-xs text-brand-400">{desc}</p>
                        </div>
                        {targetSize === size * 1024 * 1024 && (
                          <CheckCircle className="w-5 h-5 text-accent-400" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card card-hover">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Features</h3>
                <ul className="space-y-3">
                  {[
                    'Exact target file size',
                    '4K resolution support',
                    'Smart compression algorithm',
                    'JPG / PNG / WebP / AVIF',
                    'URL optimization',
                    'Fast processing',
                    'No unnecessary quality loss',
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-brand-300">
                      <CheckCircle className="w-4 h-4 text-accent-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-brand-800 bg-brand-950/50 backdrop-blur-sm mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-semibold text-white mb-4">Wallpaper10</h4>
              <p className="text-brand-400 text-sm">
                Any wallpaper. Perfect size. Optimize your wallpapers to the smallest
                possible size without sacrificing visible quality.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-brand-400">
                <li><a href="/optimizer" className="hover:text-white transition-colors">Optimizer</a></li>
                <li><a href="/wallpapers" className="hover:text-white transition-colors">Wallpaper Library</a></li>
                <li><a href="/pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-brand-400">
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="/blog" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="/careers" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-brand-400">
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/cookies" className="hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-brand-800 text-center text-sm text-brand-500">
            © 2024 Wallpaper10. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}