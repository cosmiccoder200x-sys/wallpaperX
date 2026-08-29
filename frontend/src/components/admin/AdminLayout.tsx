import { useState } from 'react';
import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Image, BarChart2, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';

const NAV_ITEMS = [
  { path: '/admin', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/wallpapers', label: 'Wallpapers', icon: Image },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-brand-950 flex">
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 bg-brand-900 border-r border-brand-800 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-brand-800 flex items-center justify-between">
            <Link to="/admin" className="flex items-center gap-2">
              <span className={cn('font-bold text-white tracking-tight transition-opacity', sidebarOpen ? 'opacity-100' : 'opacity-0')}>
                Wallpaper10 Admin
              </span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden"
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </Button>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== '/admin' && location.pathname.startsWith(item.path));
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent-500/10 text-accent-400'
                      : 'text-brand-400 hover:bg-brand-800 hover:text-white'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-brand-800">
            <Link to="/" className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-400 hover:bg-brand-800 hover:text-white transition-colors',
              !sidebarOpen && 'justify-center'
            )}>
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>Back to Site</span>}
            </Link>
          </div>
        </div>
      </aside>

      <div className={cn('flex-1 lg:ml-64', sidebarOpen ? 'lg:ml-64' : 'lg:ml-20')}>
        <header className="sticky top-0 z-40 bg-brand-950/80 backdrop-blur-sm border-b border-brand-800">
          <div className="flex items-center justify-between h-16 px-6">
            <h1 className="text-xl font-semibold text-white">
              {NAV_ITEMS.find(item => location.pathname === item.path || 
                (item.path !== '/admin' && location.pathname.startsWith(item.path)))?.label || 'Admin'}
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-brand-500 hidden sm:block">Administrator</span>
            </div>
          </div>
        </header>

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}