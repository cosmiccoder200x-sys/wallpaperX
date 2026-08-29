import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Image, Download, TrendingUp, Activity, Server, Loader2, Edit, Trash2, Check, X, Plus, Search } from 'lucide-react';
import { cn } from '../utils/cn';
import { adminApi, wallpapersApi } from '../services/api';
import { handleApiError } from '../services/api';
import { AdminLayout } from '../components/admin/AdminLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatBytes, formatNumber } from '../utils/format';

const statCards = [
  { label: 'Total Users', key: 'total_users', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { label: 'Total Optimizations', key: 'total_optimizations', icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10' },
  { label: 'Total Downloads', key: 'total_downloads', icon: Download, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { label: 'Published Wallpapers', key: 'total_wallpapers', icon: Image, color: 'text-accent-400', bg: 'bg-accent-500/10' },
  { label: 'Storage Used', key: 'total_storage_bytes', icon: Server, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { label: 'Daily Active Users', key: 'daily_active_users', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { label: 'Daily Optimizations', key: 'daily_optimizations', icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { label: 'Daily Downloads', key: 'daily_downloads', icon: Download, color: 'text-violet-400', bg: 'bg-violet-500/10' },
];

export function AdminDashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [popularWallpapers, setPopularWallpapers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [wallpapers, setWallpapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'wallpapers' | 'analytics'>('overview');
  const [userPage, setUserPage] = useState(1);
  const [wallpaperPage, setWallpaperPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [wallpaperFilter, setWallpaperFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        adminApi.stats(),
        adminApi.analytics(30),
      ]);
      
      setStats(statsRes.data.data);
      setDailyStats(analyticsRes.data.data.daily_stats || []);
      setPopularWallpapers(analyticsRes.data.data.popular_wallpapers || []);
    } catch (err) {
      setError(handleApiError(err).message);
    }
  };

  const fetchUsers = async (page = 1) => {
    try {
      const res = await adminApi.users({ page, limit: 20, search: userSearch });
      setUsers(res.data.data.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchWallpapers = async (page = 1) => {
    try {
      const published = wallpaperFilter === 'published' ? 'true' : wallpaperFilter === 'draft' ? 'false' : undefined;
      const res = await adminApi.wallpapers({ page, limit: 20, published });
      setWallpapers(res.data.data.wallpapers);
    } catch (err) {
      console.error('Failed to fetch wallpapers:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchUsers();
    fetchWallpapers();
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers(userPage);
  }, [userPage, userSearch]);

  useEffect(() => {
    fetchWallpapers(wallpaperPage);
  }, [wallpaperPage, wallpaperFilter]);

  const handleUserPlanChange = async (userId: string, plan: string) => {
    try {
      await adminApi.updateUserPlan(userId, plan);
      fetchUsers(userPage);
    } catch (err) {
      alert(handleApiError(err).message);
    }
  };

  const handleUserDisable = async (userId: string) => {
    if (!confirm('Disable this user?')) return;
    try {
      await adminApi.disableUser(userId);
      fetchUsers(userPage);
    } catch (err) {
      alert(handleApiError(err).message);
    }
  };

  const handleWallpaperToggle = async (wallpaper: any) => {
    try {
      await wallpapersApi.adminUpdate(wallpaper.id, { is_published: !wallpaper.is_published });
      fetchWallpapers(wallpaperPage);
    } catch (err) {
      alert(handleApiError(err).message);
    }
  };

  const handleWallpaperDelete = async (id: string) => {
    if (!confirm('Delete this wallpaper permanently?')) return;
    try {
      await wallpapersApi.adminDelete(id);
      fetchWallpapers(wallpaperPage);
    } catch (err) {
      alert(handleApiError(err).message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-accent-400" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-brand-400">Manage users, wallpapers, and view analytics</p>
          </div>
        </div>

        <div className="flex gap-2 border-b border-brand-800">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'wallpapers', label: 'Wallpapers', icon: Image },
            { id: 'analytics', label: 'Analytics', icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-accent-500 text-accent-400'
                  : 'border-transparent text-brand-400 hover:text-brand-200'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((stat) => {
                const value = stats[stat.key] ?? 0;
                const displayValue = stat.key === 'total_storage_bytes' 
                  ? formatBytes(value) 
                  : formatNumber(value);
                
                return (
                  <Card key={stat.key} variant="hover" padding="lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-brand-500">{stat.label}</p>
                        <p className="text-3xl font-bold font-mono text-white mt-1">{displayValue}</p>
                      </div>
                      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', stat.bg)}>
                        <stat.icon className={cn('w-6 h-6', stat.color)} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card variant="hover" padding="lg">
                <h3 className="text-lg font-semibold text-white mb-4">Popular Wallpapers</h3>
                <div className="space-y-3">
                  {popularWallpapers.slice(0, 10).map((wp, i) => (
                    <div key={wp.id} className="flex items-center gap-3">
                      <span className="w-6 text-center text-brand-500 font-medium">{i + 1}</span>
                      <img src={wp.thumbnail_url} alt={wp.title} className="w-12 h-8 rounded object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{wp.title}</p>
                        <p className="text-xs text-brand-500">{wp.category} • {formatNumber(wp.downloads)} downloads</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card variant="hover" padding="lg">
                <h3 className="text-lg font-semibold text-white mb-4">Daily Activity (30 days)</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {dailyStats.slice(0, 14).map((day) => (
                    <div key={day.date} className="flex items-center justify-between text-sm">
                      <span className="text-brand-400">{new Date(day.date).toLocaleDateString()}</span>
                      <div className="flex items-center gap-4 text-xs text-brand-500">
                        <span>{day.active_users} users</span>
                        <span>{day.total_optimizations} opts</span>
                        <span>{day.total_bytes_saved ? formatBytes(day.total_bytes_saved) + ' saved' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <Card variant="hover" padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Users ({users.length})</h3>
              <Input
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                leftIcon={<Search className="w-4 h-4" />}
                className="w-64"
              />
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-brand-500 border-b border-brand-800">
                    <th className="pb-3 px-2">User</th>
                    <th className="pb-3 px-2">Plan</th>
                    <th className="pb-3 px-2">Status</th>
                    <th className="pb-3 px-2">Optimizations</th>
                    <th className="pb-3 px-2">Joined</th>
                    <th className="pb-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-brand-800/50">
                      <td className="py-3 px-2">
                        <div>
                          <p className="font-medium text-white">{user.name || 'Unnamed'}</p>
                          <p className="text-xs text-brand-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <select
                          value={user.plan}
                          onChange={(e) => handleUserPlanChange(user.id, e.target.value)}
                          className="px-2 py-1 bg-brand-900 border border-brand-700 rounded text-white text-sm"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={user.is_active ? 'success' : 'danger'} size="sm">
                          {user.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-brand-400">{user.daily_optimizations}</td>
                      <td className="py-3 px-2 text-brand-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2">
                        {!user.is_active ? (
                          <Button variant="ghost" size="sm" onClick={() => handleUserDisable(user.id)} className="text-green-400">
                            Enable
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleUserDisable(user.id)} className="text-red-400">
                            Disable
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex items-center justify-between mt-4">
              <Button variant="secondary" onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1}>
                Previous
              </Button>
              <span className="text-sm text-brand-400">Page {userPage}</span>
              <Button variant="secondary" onClick={() => setUserPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {activeTab === 'wallpapers' && (
          <Card variant="hover" padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Wallpapers</h3>
              <div className="flex items-center gap-3">
                <select
                  value={wallpaperFilter}
                  onChange={(e) => { setWallpaperFilter(e.target.value as any); setWallpaperPage(1); }}
                  className="px-3 py-2 bg-brand-900 border border-brand-700 rounded text-white text-sm"
                >
                  <option value="all">All</option>
                  <option value="published">Published</option>
                  <option value="draft">Drafts</option>
                </select>
                <Link to="/admin/wallpapers/new">
                  <Button variant="primary" size="sm"><Plus className="w-4 h-4" /> Add Wallpaper</Button>
                </Link>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-brand-500 border-b border-brand-800">
                    <th className="pb-3 px-2">Wallpaper</th>
                    <th className="pb-3 px-2">Category</th>
                    <th className="pb-3 px-2">Resolution</th>
                    <th className="pb-3 px-2">Size</th>
                    <th className="pb-3 px-2">Downloads</th>
                    <th className="pb-3 px-2">Status</th>
                    <th className="pb-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wallpapers.map((wp) => (
                    <tr key={wp.id} className="border-b border-brand-800/50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <img src={wp.thumbnail_url} alt={wp.title} className="w-12 h-8 rounded object-cover" />
                          <p className="font-medium text-white truncate max-w-xs">{wp.title}</p>
                        </div>
                      </td>
                      <td className="py-3 px-2"><Badge variant="outline" size="sm">{wp.category}</Badge></td>
                      <td className="py-3 px-2 text-brand-400">{wp.width}×{wp.height}</td>
                      <td className="py-3 px-2 text-brand-400">{formatBytes(wp.file_size)}</td>
                      <td className="py-3 px-2 text-brand-400">{formatNumber(wp.downloads)}</td>
                      <td className="py-3 px-2">
                        <Badge variant={wp.is_published ? 'success' : 'warning'} size="sm">
                          {wp.is_published ? 'Published' : 'Draft'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleWallpaperToggle(wp)}>
                            {wp.is_published ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          </Button>
                          <Link to={`/admin/wallpapers/${wp.id}`}>
                            <Button variant="ghost" size="sm"><Edit className="w-4 h-4" /></Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleWallpaperDelete(wp.id)} className="text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex items-center justify-between mt-4">
              <Button variant="secondary" onClick={() => setWallpaperPage(p => Math.max(1, p - 1))} disabled={wallpaperPage === 1}>
                Previous
              </Button>
              <span className="text-sm text-brand-400">Page {wallpaperPage}</span>
              <Button variant="secondary" onClick={() => setWallpaperPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </Card>
        )}

        {activeTab === 'analytics' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card variant="hover" padding="lg">
              <h3 className="text-lg font-semibold text-white mb-4">Daily Stats (30 days)</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {dailyStats.map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-sm p-3 bg-brand-900/50 rounded-lg">
                    <span className="font-medium text-white">{new Date(day.date).toLocaleDateString()}</span>
                    <div className="flex items-center gap-4 text-xs text-brand-500">
                      <span>{day.active_users} users</span>
                      <span>{day.total_optimizations} optimizations</span>
                      <span>{day.total_bytes_saved ? formatBytes(day.total_bytes_saved) + ' saved' : ''}</span>
                      <span>{day.avg_compression_pct ? day.avg_compression_pct.toFixed(1) + '% avg' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card variant="hover" padding="lg">
              <h3 className="text-lg font-semibold text-white mb-4">Top Wallpapers</h3>
              <div className="space-y-3">
                {popularWallpapers.slice(0, 15).map((wp, i) => (
                  <div key={wp.id} className="flex items-center gap-3">
                    <span className="w-6 text-center text-brand-500 font-medium">{i + 1}</span>
                    <img src={wp.thumbnail_url} alt={wp.title} className="w-12 h-8 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{wp.title}</p>
                      <p className="text-xs text-brand-500">{wp.category} • {formatBytes(wp.file_size)}</p>
                    </div>
                    <Badge variant="accent" size="sm">{formatNumber(wp.downloads)}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}