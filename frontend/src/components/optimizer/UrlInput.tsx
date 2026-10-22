import { FormEvent, useEffect, useState } from 'react';
import { Link, Loader2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface UrlInputProps {
  onOptimize: (url: string) => Promise<void>;
  isLoading?: boolean;
  sourceUrl?: string | null;
  clearUrl: () => void;
  disabled?: boolean;
  maxSizeMB?: number;
}

export function UrlInput({
  onOptimize,
  isLoading,
  sourceUrl,
  clearUrl,
  disabled,
  maxSizeMB = 25,
}: UrlInputProps) {
  const [url, setUrl] = useState(sourceUrl ?? '');
  const [error, setError] = useState('');

  // The result view unmounts this form; restore the last URL when it comes back.
  useEffect(() => {
    if (sourceUrl && !url) setUrl(sourceUrl);
  }, [sourceUrl, url]);

  const validateUrl = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Please enter a URL';
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return 'Please enter a valid URL, for example https://example.com/image.jpg';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Only http:// and https:// URLs are supported';
    }
    if (parsed.username || parsed.password) {
      return 'URLs containing credentials are not allowed';
    }
    return null;
  };

  const handleClear = () => {
    setUrl('');
    setError('');
    clearUrl();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading || disabled) return;

    const validationError = validateUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    try {
      await onOptimize(url.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The URL could not be optimized');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="flex items-center gap-2 text-sm text-brand-500 uppercase tracking-wide">
        <Link className="w-4 h-4" />
        <span>OR OPTIMIZE FROM URL</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError('');
          }}
          placeholder="https://example.com/image.jpg"
          error={error}
          disabled={isLoading || disabled}
          className="flex-1"
          aria-label="Image URL"
          type="url"
          inputMode="url"
          autoComplete="url"
        />
        <Button
          type="submit"
          variant="primary"
          loading={isLoading}
          disabled={isLoading || disabled || !url.trim()}
          className="whitespace-nowrap"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
          Optimize URL
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-500">
          Direct image links only (JPG, PNG, WebP, AVIF). Private, local and metadata hosts are
          blocked. Maximum {maxSizeMB} MB.
        </p>
        {sourceUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={isLoading}>
            <X className="w-4 h-4" /> Clear URL
          </Button>
        )}
      </div>
    </form>
  );
}
