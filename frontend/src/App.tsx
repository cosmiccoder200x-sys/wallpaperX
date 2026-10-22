import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/AuthProvider';
import { useAuth } from './hooks/useAuth';
import { Home } from './pages/Home';
import { Optimizer } from './pages/Optimizer';
import { Studio } from './pages/Studio';
import { Wallpapers } from './pages/Wallpapers';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { WallpaperDetail } from './pages/WallpaperDetail';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminLayout } from './components/admin/AdminLayout';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/optimizer" element={<Optimizer />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/wallpapers" element={<Wallpapers />} />
      <Route path="/wallpapers/:slug" element={<WallpaperDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      <Route element={<PrivateRoute><AdminDashboard /></PrivateRoute>}>
        <Route path="/dashboard" element={<AdminDashboard />} />
      </Route>
      
      <Route element={<AdminLayout><AdminRoute><AdminDashboard /></AdminRoute></AdminLayout>}>
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}