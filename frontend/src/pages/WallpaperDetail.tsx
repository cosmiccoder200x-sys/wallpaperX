import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, ChevronLeft, Share2, AlertCircle } from 'lucide-react';
import { wallpapersApi } from '../services/api';
import { handleApiError } from '../services/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { formatBytes } from '../utils/format';
import type { Wallpaper } from '../types';

export function WallpaperDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [related, setRelated] = useState<Wallpaper[]>([]);

  useEffect(() => {
    if (!slug) return;
    
    const fetchWallpaper = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [detailRes, relatedRes] = await Promise.all([
          wallpapersApi.get(slug),
          wallpapersApi.list({ limit: 8, published: true }),
        ]);
        
        setWallpaper(detailRes.data.data);
        const relatedData = relatedRes.data.data || [];
        setRelated(relatedData.filter(w => w.id !== detailRes.data.data?.id).slice(0, 4));
      } catch (err) {
        setError(handleApiError(err).message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchWallpaper();
  }, [slug]);

  const handleDownload = async () => {
    if (!wallpaper || downloading) return;
    setDownloading(true);
    
    try {
      const response = await wallpapersApi.download(wallpaper.id);
      const downloadData = response.data.data;
      if (!downloadData) throw new Error('Download failed');
      const { download_url, filename } = downloadData;
      
      const a = document.createElement('a');
      a.href = download_url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!wallpaper) return;
    
    const shareData = {
      title: wallpaper.title,
      text: `Check out this wallpaper: ${wallpaper.title} (${wallpaper.width}×${wallpaper.height})`,
      url: window.location.href,
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !wallpaper) {
    return (
      <div className="min-h-screen bg-brand-950 flex items-center justify-center px-4">
        <Card variant="glass" padding="lg" className="max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Wallpaper not found</h1>
          <p className="text-brand-400 mb-6">{error || 'The requested wallpaper does not exist.'}</p>
          <Link to="/wallpapers">
            <Button variant="primary">Browse Wallpapers</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // SEO metadata
  useEffect(() => {
    document.title = `${wallpaper.title} | Wallpaper10`;
    
    const metaTags = [
      { property: 'og:title', content: wallpaper.title },
      { property: 'og:description', content: `${wallpaper.width}×${wallpaper.height} • ${formatBytes(wallpaper.file_size)} • ${wallpaper.format}` },
      { property: 'og:image', content: wallpaper.image_url },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: window.location.href },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: wallpaper.title },
      { name: 'twitter:description', content: `${wallpaper.width}×${wallpaper.height} • ${formatBytes(wallpaper.file_size)}` },
      { name: 'twitter:image', content: wallpaper.image_url },
    ];
    
    metaTags.forEach(({ property, name, content }) => {
      const selector = property ? `meta[property="${property}"]` : `meta[name="${name}"]`;
      let tag = document.querySelector(selector) as HTMLMetaElement;
      if (!tag) {
        tag = document.createElement('meta');
        if (property) tag.setAttribute('property', property);
        if (name) tag.setAttribute('name', name);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    });
    
    // Cleanup on unmount
    return () => {
      document.title = 'Wallpaper10 — Any wallpaper. Perfect size.';
    };
  }, [wallpaper]);

  return (
    <div className="min-h-screen bg-brand-950">
      <header className="border-b border-brand-800 bg-brand-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">WALLPAPER10</span>
              </Link>
              <nav className="hidden md:flex items-center gap-6">
                <Link to="/" className="text-sm text-brand-400 hover:text-white transition-colors">Home</Link>
                <Link to="/optimizer" className="text-sm text-brand-400 hover:text-white transition-colors">Optimize</Link>
                <Link to="/wallpapers" className="text-sm text-accent-400 font-medium">Library</Link>
              </nav>
            </div>
            <Link to="/optimizer" className="btn-primary text-sm hidden sm:block">Optimize</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link to="/wallpapers" className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-white mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back to Library
        </Link>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-brand-900 border border-brand-800">
              <img
                src={wallpaper.image_url}
                alt={wallpaper.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">{wallpaper.resolution_label}</Badge>
              <Badge variant="outline">{wallpaper.format}</Badge>
              <Badge variant="outline">{wallpaper.category}</Badge>
              <Badge variant="outline">{wallpaper.aspect_ratio}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-brand-800">
              <Button onClick={handleDownload} loading={downloading} className="flex-1 sm:flex-none" style={{ 
                background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
                boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)'
              }}>
                <Download className="w-5 h-5" />
                Download ({formatBytes(wallpaper.file_size)})
              </Button>
              <Button variant="secondary" onClick={handleShare}>
                <Share2 className="w-5 h-5" />
                Share
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-brand-800">
              {[
                ['Dimensions', `${wallpaper.width} × ${wallpaper.height}`],
                ['File Size', formatBytes(wallpaper.file_size)],
                ['Aspect Ratio', wallpaper.aspect_ratio],
                ['Downloads', wallpaper.downloads.toLocaleString()],
              ].map(([label, value]) => (
                <Card key={label} variant="default" padding="md" className="text-center">
                  <p className="text-xs text-brand-500 uppercase tracking-wide">{label}</p>
                  <p className="text-lg font-mono font-medium text-white mt-1">{value}</p>
                </Card>
              ))}
            </div>

            {wallpaper.description && (
              <div className="prose prose-invert max-w-none">
                <h3 className="text-lg font-semibold text-white mb-3">Description</h3>
                <p className="text-brand-400 whitespace-pre-wrap">{wallpaper.description}</p>
              </div>
            )}
          </div>

          <aside className="lg:col-span-1 space-y-8">
            <Card variant="hover" padding="lg">
              <h3 className="text-xl font-bold text-white mb-2">{wallpaper.title}</h3>
              <p className="text-brand-400 text-sm mb-6">
                {wallpaper.width} × {wallpaper.height} • {formatBytes(wallpaper.file_size)} • {wallpaper.format}
              </p>
              
              <div className="space-y-3">
                {[
                  ['Resolution', wallpaper.resolution_label],
                  ['Dimensions', `${wallpaper.width} × ${wallpaper.height}`],
                  ['File Size', formatBytes(wallpaper.file_size)],
                  ['Format', wallpaper.format],
                  ['Aspect Ratio', wallpaper.aspect_ratio],
                  ['Category', wallpaper.category],
                  ['Downloads', wallpaper.downloads.toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-brand-500">{label}</span>
                    <span className="font-mono text-white">{value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {related.length > 0 && (
              <Card variant="hover" padding="lg">
                <h3 className="text-lg font-semibold text-white mb-4">Related Wallpapers</h3>
                <div className="space-y-3">
                  {related.map((relatedWp) => (
                    <Link key={relatedWp.id} to={`/wallpapers/${relatedWp.slug}`} className="flex items-center gap-3 group">
                      <img
                        src={relatedWp.thumbnail_url}
                        alt={relatedWp.title}
                        className="w-16 h-10 rounded-lg object-cover border border-brand-800 transition-opacity group-hover:opacity-80"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate group-hover:text-accent-400 transition-colors">
                          {relatedWp.title}
                        </p>
                        <p className="text-xs text-brand-500">
                          {relatedWp.width}×{relatedWp.height} • {formatBytes(relatedWp.file_size)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </aside>
        </div>
      </main>

      <footer className="border-t border-brand-800 bg-brand-950/50 backdrop-blur-sm mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-brand-500">
          © 2024 Wallpaper10. All rights reserved.
        </div>
      </footer>
    </div>
  );
}