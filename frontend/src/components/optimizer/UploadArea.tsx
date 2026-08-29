import { useCallback, useState, DragEvent, ChangeEvent } from 'react';
import { Upload, File, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import type { ImageAnalysis } from '../../types';

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  onAnalyze: (file: File) => Promise<void>;
  analysis?: ImageAnalysis | null;
  isAnalyzing?: boolean;
  isOptimizing?: boolean;
  maxSizeMB?: number;
  acceptedFormats?: string[];
  clearFile: () => void;
}

export function UploadArea({
  onFileSelect,
  onAnalyze,
  analysis,
  isAnalyzing,
  isOptimizing,
  maxSizeMB = 50,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  clearFile,
}: UploadAreaProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.style.display = 'none';
  }, []);

  const validateFile = (file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return `Unsupported format. Please use JPG, PNG, WebP, or AVIF.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File too large. Maximum size is ${maxSizeMB} MB.`;
    }
    return null;
  };

  const handleFile = useCallback(async (file: File) => {
    const error = validateFile(file);
    if (error) {
      alert(error);
      return;
    }
    onFileSelect(file);
    await onAnalyze(file);
  }, [onFileSelect, onAnalyze]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(d => d - 1);
    if (dragDepth === 1) setIsDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [dragDepth, handleFile]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(d => d + 1);
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(d => d - 1);
    if (dragDepth === 1) setIsDragActive(false);
  }, [dragDepth]);

  const handleClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptedFormats.join(',');
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  }, [acceptedFormats, handleFile]);

  if (analysis) {
    return (
      <div className="animate-in space-y-4">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
          {analysis.estimated_optimization && (
            <div className="absolute top-3 right-3 z-10 flex gap-1.5">
              <span className="px-2 py-1 text-xs font-medium bg-black/60 backdrop-blur-sm rounded-full text-white border border-white/10">
                {analysis.format}
              </span>
              <span className="px-2 py-1 text-xs font-medium bg-black/60 backdrop-blur-sm rounded-full text-white border border-white/10">
                {analysis.width}×{analysis.height}
              </span>
            </div>
          )}
          <img
            src={URL.createObjectURL(analysis as any)}
            alt={analysis.filename}
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="text-center p-3 bg-brand-900/50 rounded-lg border border-brand-800">
            <p className="text-xs text-brand-500 uppercase tracking-wide">Format</p>
            <p className="text-lg font-mono font-medium">{analysis.format}</p>
          </div>
          <div className="text-center p-3 bg-brand-900/50 rounded-lg border border-brand-800">
            <p className="text-xs text-brand-500 uppercase tracking-wide">Dimensions</p>
            <p className="text-lg font-mono font-medium">{analysis.width} × {analysis.height}</p>
          </div>
          <div className="text-center p-3 bg-brand-900/50 rounded-lg border border-brand-800">
            <p className="text-xs text-brand-500 uppercase tracking-wide">Size</p>
            <p className="text-lg font-mono font-medium">
              {(analysis.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <div className="text-center p-3 bg-brand-900/50 rounded-lg border border-brand-800">
            <p className="text-xs text-brand-500 uppercase tracking-wide">Ratio</p>
            <p className="text-lg font-mono font-medium">{analysis.aspect_ratio}</p>
          </div>
        </div>

        <Button variant="ghost" onClick={clearFile} className="w-full" disabled={isOptimizing}>
          <X className="w-4 h-4" />
          Remove image
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={fileInputRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={cn(
        'relative rounded-2xl border-2 border-dashed transition-all duration-300',
        'cursor-pointer overflow-hidden',
        isDragActive
          ? 'border-accent-500 bg-accent-500/10 scale-[1.01] shadow-[0_0_40px_rgba(217,70,239,0.15)]'
          : 'border-brand-700 hover:border-brand-600 hover:bg-brand-900/50',
        isAnalyzing && 'opacity-60 pointer-events-none'
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      aria-label="Upload wallpaper"
    >
      <input
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isAnalyzing || isOptimizing}
        aria-hidden="true"
      />
      
      <div className="p-12 sm:p-16 text-center">
        <div className="mx-auto mb-6 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-800/50 flex items-center justify-center border border-brand-700 transition-colors duration-300 group-hover:border-accent-500">
          <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-brand-400 group-hover:text-accent-400 transition-colors" />
        </div>
        
        <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2">
          DROP WALLPAPER HERE
        </h3>
        
        <p className="text-brand-400 mb-6 max-w-md mx-auto">
          Drag & drop your image or click to browse
        </p>
        
        <Button variant="secondary" className="mb-6" disabled={isAnalyzing}>
          <File className="w-4 h-4" />
          Browse Files
        </Button>
        
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-brand-500">
          <span className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700">JPG</span>
          <span className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700">PNG</span>
          <span className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700">WEBP</span>
          <span className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700">AVIF</span>
          <span className="px-2 py-1 bg-brand-800 rounded-lg border border-brand-700 text-brand-400">
            Max {maxSizeMB} MB
          </span>
        </div>
        
        {isAnalyzing && (
          <div className="mt-6 flex items-center justify-center gap-3 text-brand-400">
            <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            <span>Analyzing image...</span>
          </div>
        )}
      </div>
    </div>
  );
}