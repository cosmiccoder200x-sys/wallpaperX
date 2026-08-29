import { useState, FormEvent } from 'react';
import { Link, Loader2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface UrlInputProps {
  onOptimize: (url: string) => Promise<void>;
  isLoading?: boolean;
  analysis?: any;
  clearUrl: () => void;
}

export function UrlInput({ onOptimize, isLoading, analysis, clearUrl }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const validateUrl = (value: string): boolean => {
    try {
      new URL(value);
      return value.startsWith('http://') || value.startsWith('https://');
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }
    
    if (!validateUrl(url)) {
      setError('Please enter a valid HTTP/HTTPS URL');
      return;
    }
    
    await onOptimize(url);
  };

  if (analysis) {
    return (
      <div className="animate-in space-y-4">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-brand-900 border border-brand-800">
          <img
            src={URL.createObjectURL(analysis as any)}
            alt="Optimized from URL"
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-brand-400">
            <Link className="w-5 h-5 text-brand-500" />
            <span className="font-mono truncate max-w-[300px]">{url}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearUrl} disabled={isLoading}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-brand-500 uppercase tracking-wide">
        <Link className="w-4 h-4" />
        <span>OR OPTIMIZE FROM URL</span>
      </div>
      
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/image.jpg"
          error={error}
          disabled={isLoading}
          className="flex-1"
          aria-label="Image URL"
        />
        <Button
          type="submit"
          variant="primary"
          loading={isLoading}
          disabled={isLoading || !url.trim()}
          className="whitespace-nowrap"
        >
          <Loader2 className="w-4 h-4" />
          Optimize URL
        </Button>
      </div>
      
      <p className="text-xs text-brand-500">
        Supports direct image links (JPG, PNG, WebP, AVIF). Maximum 50 MB.
      </p>
    </form>
  );
}