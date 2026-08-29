import { Link } from 'react-router-dom';
import { ArrowRight, Download, Zap, Shield, Eye, Settings, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

export function Home() {
  const features = [
    {
      icon: Zap,
      title: 'Exact Target Size',
      desc: 'Specify 1 MB, 5 MB, 10 MB, or any custom size. Our smart algorithm hits it precisely.',
    },
    {
      icon: Eye,
      title: '4K Quality Preserved',
      desc: 'Maintain 3840×2160 resolution. Only reduce dimensions when absolutely necessary.',
    },
    {
      icon: Settings,
      title: 'Smart Compression',
      desc: 'Binary search quality optimization. WebP, AVIF, JPEG, PNG — auto-selected for best results.',
    },
    {
      icon: Download,
      title: 'URL Optimization',
      desc: 'Paste any image URL. We fetch, validate, optimize, and deliver — no download needed.',
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      desc: 'SSRF protection, rate limiting, automatic cleanup. Your images never stored permanently.',
    },
    {
      icon: ArrowRight,
      title: 'Instant Download',
      desc: 'One click. Optimized file downloads immediately. No accounts required for basic use.',
    },
  ];

  const howItWorks = [
    { step: '01', title: 'Upload', desc: 'Drag & drop your wallpaper or paste an image URL. Supports JPG, PNG, WebP, AVIF up to 50 MB.' },
    { step: '02', title: 'Optimize', desc: 'Choose target size (1/5/10 MB or custom). Our algorithm finds the highest quality within your limit.' },
    { step: '03', title: 'Download', desc: 'Compare before/after side-by-side. Download instantly with one click.' },
  ];

  const categories = [
    { name: '4K', count: '240+', slug: '4k', icon: '🖥️' },
    { name: 'Anime', count: '180+', slug: 'anime', icon: '🎌' },
    { name: 'Gaming', count: '200+', slug: 'gaming', icon: '🎮' },
    { name: 'Nature', count: '150+', slug: 'nature', icon: '🌲' },
    { name: 'Cars', count: '120+', slug: 'cars', icon: '🚗' },
    { name: 'Space', count: '160+', slug: 'space', icon: '🌌' },
    { name: 'Minimal', count: '100+', slug: 'minimal', icon: '⚪' },
    { name: 'Abstract', count: '140+', slug: 'abstract', icon: '🎨' },
    { name: 'Cyberpunk', count: '110+', slug: 'cyberpunk', icon: '🌃' },
    { name: 'Architecture', count: '90+', slug: 'architecture', icon: '🏛️' },
    { name: 'Mobile', count: '130+', slug: 'mobile', icon: '📱' },
    { name: 'Ultrawide', count: '80+', slug: 'ultrawide', icon: '📺' },
  ];

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
                <Link to="/" className="text-sm text-accent-400 font-medium">Home</Link>
                <Link to="/optimizer" className="text-sm text-brand-400 hover:text-white transition-colors">Optimize</Link>
                <Link to="/wallpapers" className="text-sm text-brand-400 hover:text-white transition-colors">Library</Link>
                <Link to="/pricing" className="text-sm text-brand-400 hover:text-white transition-colors">Pricing</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-brand-300 hover:text-white transition-colors">Sign in</Link>
              <Link to="/optimizer" className="btn-primary text-sm">Start Optimizing</Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="relative pt-24 pb-32 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm font-medium mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500"></span>
                </span>
                Now in Public Beta
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight mb-6 leading-[1.1]">
                ANY WALLPAPER.<br />
                <span className="text-gradient">PERFECT SIZE.</span>
              </h1>
              
              <p className="text-xl sm:text-2xl text-brand-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                Optimize your wallpaper to the smallest possible size without sacrificing visible quality.
                4K resolution. Under 10 MB. Guaranteed.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                <Link to="/optimizer">
                  <Button size="lg" className="w-full sm:w-auto px-8 py-4 text-lg" style={{ 
                    background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
                    boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)'
                  }}>
                    Upload Wallpaper
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Button variant="secondary" size="lg" className="w-full sm:w-auto px-8 py-4 text-lg">
                  Paste Image URL
                </Button>
              </div>
              
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-brand-500">
                <span>Target size:</span>
                <Badge variant="accent">1 MB</Badge>
                <Badge variant="accent">5 MB</Badge>
                <Badge variant="accent">10 MB</Badge>
                <Badge variant="outline">Custom</Badge>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-brand-900/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">How it works</h2>
              <p className="text-lg text-brand-400 max-w-2xl mx-auto">
                Three simple steps to perfectly sized wallpapers
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {howItWorks.map(({ step, title, desc }) => (
                <Card key={step} variant="hover" padding="lg" className="h-full">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent-400 font-bold text-xl">{step}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
                      <p className="text-brand-400">{desc}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Features</h2>
              <p className="text-lg text-brand-400 max-w-2xl mx-auto">
                Everything you need for perfect wallpaper optimization
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map(({ icon: Icon, title, desc }) => (
                <Card key={title} variant="hover" padding="lg">
                  <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-accent-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                  <p className="text-brand-400 text-sm">{desc}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-brand-900/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Before & After</h2>
              <p className="text-lg text-brand-400 max-w-2xl mx-auto">
                See the difference our optimization makes
              </p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-brand-800 bg-brand-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-24 h-24 mx-auto mb-4 rounded-xl bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center">
                      <ArrowRight className="w-12 h-12 text-white" />
                    </div>
                    <p className="text-brand-400">Visual comparison demo</p>
                    <p className="text-xs text-brand-500 mt-1">Original 18.4 MB → Optimized 9.8 MB (47% smaller)</p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-brand-900/50 rounded-xl border border-brand-800 text-center">
                    <p className="text-3xl font-bold font-mono text-white">18.4 MB</p>
                    <p className="text-xs text-brand-500">Original</p>
                  </div>
                  <div className="p-4 bg-brand-900/50 rounded-xl border border-brand-800 text-center">
                    <ArrowRight className="w-8 h-8 mx-auto text-accent-400" />
                  </div>
                  <div className="p-4 bg-brand-900/50 rounded-xl border border-brand-800 text-center">
                    <p className="text-3xl font-bold font-mono text-accent-400">9.8 MB</p>
                    <p className="text-xs text-brand-500">Optimized</p>
                  </div>
                </div>
                <div className="p-4 bg-accent-500/10 border border-accent-500/20 rounded-xl">
                  <p className="text-center text-accent-300 font-medium">
                    47% smaller • 3840×2160 preserved • PNG → WebP • Quality 85
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Discover Wallpapers</h2>
              <p className="text-lg text-brand-400 max-w-2xl mx-auto">
                Browse our curated library of optimized wallpapers across categories
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <Link key={cat.slug} to={`/wallpapers/${cat.slug}`} className="card card-hover group p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-accent-400 transition-colors">{cat.name}</h3>
                      <p className="text-xs text-brand-500">{cat.count} wallpapers</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" size="sm">Browse</Badge>
                    <ChevronRight className="w-4 h-4 text-brand-500 group-hover:text-accent-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
            
            <div className="text-center mt-10">
              <Link to="/wallpapers">
                <Button variant="secondary" size="lg">
                  View All Categories
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-brand-900/50 to-brand-950">
          <div className="max-w-7xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to optimize?</h2>
            <p className="text-lg text-brand-400 mb-8 max-w-2xl mx-auto">
              Join thousands of users creating perfectly sized wallpapers. No registration required for basic use.
            </p>
            <Link to="/optimizer">
              <Button size="lg" className="px-10 py-4 text-lg" style={{ 
                background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 100%)',
                boxShadow: '0 4px 20px rgba(217, 70, 239, 0.3)'
              }}>
                Start Optimizing Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-800 bg-brand-950/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <span className="text-xl font-bold text-white">WALLPAPER10</span>
              </Link>
              <p className="text-brand-400 text-sm max-w-xs">
                Any wallpaper. Perfect size. The premier wallpaper optimization platform.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-brand-400">
                <li><Link to="/optimizer" className="hover:text-white transition-colors">Optimizer</Link></li>
                <li><Link to="/wallpapers" className="hover:text-white transition-colors">Wallpaper Library</Link></li>
                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link to="/api-docs" className="hover:text-white transition-colors">API Docs</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-brand-400">
                <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link to="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link to="/press" className="hover:text-white transition-colors">Press</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-brand-400">
                <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/cookies" className="hover:text-white transition-colors">Cookie Policy</Link></li>
                <li><Link to="/dmca" className="hover:text-white transition-colors">DMCA</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-brand-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-brand-500">© 2024 Wallpaper10. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm text-brand-500">
              <a href="https://twitter.com/x" className="hover:text-white transition-colors" target="_blank" rel="noopener">Twitter</a>
              <a href="https://github.com/x" className="hover:text-white transition-colors" target="_blank" rel="noopener">GitHub</a>
              <a href="https://discord.gg/x" className="hover:text-white transition-colors" target="_blank" rel="noopener">Discord</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}