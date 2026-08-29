import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi } from '../services/api';
import { setAuthToken } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  supabaseLogin: (accessToken: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isPro: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.data.data);
    } catch {
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('x_token');
    if (token) {
      setAuthToken(token);
      refreshUser();
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const { user: userData, token } = response.data.data!;
    setAuthToken(token);
    localStorage.setItem('x_token', token);
    setUser(userData);
  };

  const register = async (email: string, password: string, name?: string) => {
    const response = await authApi.register(email, password, name);
    const { user: userData, token } = response.data.data!;
    setAuthToken(token);
    localStorage.setItem('x_token', token);
    setUser(userData);
  };

  const supabaseLogin = async (accessToken: string) => {
    const response = await authApi.supabaseAuth(accessToken);
    const { user: userData, token } = response.data.data!;
    setAuthToken(token);
    localStorage.setItem('x_token', token);
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem('x_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        supabaseLogin,
        refreshUser,
        isAuthenticated: !!user,
        isPro: user?.plan === 'pro' || user?.plan === 'admin',
        isAdmin: user?.plan === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}