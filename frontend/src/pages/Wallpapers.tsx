import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, Eye, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';
import { wallpapersApi } from '../services/api';
import { handleApiError } from '../services/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatBytes } from '../utils/format';
import type { Wallpaper, Category } from '../types';

export function Wallpapers() {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const requestRef = useRef(0);
  const loadingRef = useRef(false);

  const loadCategories = useCallback(async () => {
    try {
      const response = await wallpapersApi.categories();
      setCategories(response.data.data || []);
    } catch {
      // Categories are optional; the library still loads without them.
    }
  }, []);

  const loadWallpapers = useCallback(
    async (reset = false) => {
      // "Load more" must not double-append, but a filter change always resets.
      if (!reset && loadingRef.current) return;
      loadingRef.current = true;
      const request = requestRef.current + 1;
      requestRef.current = request;
      setLoading(true);
      setError(null);

      try {
        const pageNum = reset ? 1 : pageRef.current;
        const response = await wallpapersApi.list({
          category: selectedCategory || undefined,
          limit: 20,
          offset: (pageNum - 1) * 20,
        });
        // A newer filter change has superseded this response.
        if (request !== requestRef.current) return;

        const data = response.data.data || [];
        setWallpapers((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(data.length === 20);
        pageRef.current = pageNum + 1;
      } catch (err) {
        if (request === requestRef.current) setError(handleApiError(err).message);
      } finally {
        if (request === requestRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [selectedCategory]
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    pageRef.current = 1;
    void loadWallpapers(true);
  }, [loadWallpapers]);

  const handleDownload = async (wallpaper: Wallpaper) => {
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
    }
  };

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
                <Link to="/pricing" className="text-sm text-brand-400 hover:text-white transition-colors">Pricing</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-brand-300 hover:text-white transition-colors">Sign in</Link>
              <Link to="/optimizer" className="btn-primary text-sm">Optimize</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Wallpaper Library</h1>
          <p className="text-lg text-brand-400 max-w-2xl">
            Discover thousands of optimized wallpapers across categories. All wallpapers are compressed
            to under 10 MB while maintaining 4K quality.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-64 flex-shrink-0">
            <Card variant="hover" padding="lg" className="sticky top-24">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Categories</h3>
                  <span className="text-sm text-brand-400">{categories.length}</span>
                </div>
                
                <Input
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                />
                
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-left text-sm transition-colors',
                      selectedCategory === null
                        ? 'bg-accent-500/10 text-accent-400'
                        : 'text-brand-300 hover:bg-brand-800 hover:text-white'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>All Categories</span>
                      <span className="text-xs text-brand-500">
                        {wallpapers.length}
                      </span>
                    </div>
                  </button>
                  
                  {categories
                    .filter(cat => 
                      searchQuery === '' || cat.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((cat) => (
                      <button
                        key={cat.slug}
                        onClick={() => setSelectedCategory(cat.slug)}
                        className={cn(
                          'w-full px-3 py-2 rounded-lg text-left text-sm transition-colors',
                          selectedCategory === cat.slug
                            ? 'bg-accent-500/10 text-accent-400'
                            : 'text-brand-300 hover:bg-brand-800 hover:text-white'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span>{cat.name}</span>
                          <span className="text-xs text-brand-500">{cat.count}</span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </Card>
          </aside>

          <div className="flex-1">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
              {wallpapers.map((wallpaper) => (
                <Link key={wallpaper.id} to={`/wallpapers/${wallpaper.slug}`} className="card card-hover group overflow-hidden">
                  <div className="relative aspect-[16/10] overflow-hidden bg-brand-900">
                    <img
                      src={wallpaper.thumbnail_url}
                      alt={wallpaper.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-3 left-3 right-3 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 flex gap-2">
                      <Button size="sm" variant="primary" onClick={(e) => { e.preventDefault(); handleDownload(wallpaper); }}>
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                      <Button size="sm" variant="secondary">
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                    </div>
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge variant="accent" size="sm">{wallpaper.resolution_label}</Badge>
                      <Badge variant="outline" size="sm">{wallpaper.format}</Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-white truncate group-hover:text-accent-400 transition-colors">
                      {wallpaper.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-brand-500">
                      <span>{wallpaper.width} × {wallpaper.height}</span>
                      <span>•</span>
                      <span>{formatBytes(wallpaper.file_size)}</span>
                      <span>•</span>
                      <span>{wallpaper.aspect_ratio}</span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="outline" size="sm">{wallpaper.category}</Badge>
                      <span className="text-xs text-brand-500">{formatNumber(wallpaper.downloads)} downloads</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {wallpapers.length === 0 && !loading && (
              <div className="text-center py-16">
                <p className="text-brand-400">No wallpapers found</p>
              </div>
            )}

            {hasMore && (
              <div className="text-center">
                <Button 
                  variant="secondary" 
                  onClick={() => loadWallpapers(false)}
                  loading={loading}
                  className="w-full sm:w-auto"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load More'}
                </Button>
              </div>
            )}
          </div>
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

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}