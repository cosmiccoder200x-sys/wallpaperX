import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, User, Chrome, Github } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { login, register, loginWithGoogle, loginWithGithub } = useAuth();

  const runAuth = async (action: () => Promise<void>, fallback: string) => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await action();
      navigate('/optimizer');
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => runAuth(loginWithGoogle, 'Google login failed. Please try again.');
  const handleGithubLogin = () => runAuth(loginWithGithub, 'GitHub login failed. Please try again.');

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    void runAuth(() => login(email, password), 'Login failed. Please try again.');
  };

  const handleEmailSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    void runAuth(() => register(email, password, name), 'Sign up failed. Please try again.');
  };

  return (
    <div className="min-h-screen bg-brand-950 flex items-center justify-center px-4 py-12">
      <Card variant="glass" padding="lg" className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <span className="text-2xl font-bold text-white">WALLPAPERX</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">
            {isSignUpMode ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-brand-400 mt-2">
            {isSignUpMode ? 'Sign up to sync wallpapers with Firebase' : 'Sign in to access your optimization history'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 mb-6">
          <Button onClick={handleGoogleLogin} className="flex-1" type="button" loading={loading}>
            <Chrome className="w-5 h-5 mr-2" />
            Google
          </Button>
          <Button onClick={handleGithubLogin} variant="secondary" className="flex-1" type="button" disabled={loading}>
            <Github className="w-5 h-5 mr-2" />
            GitHub
          </Button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-brand-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-brand-950 text-brand-500">Or continue with email</span>
          </div>
        </div>

        {!isSignUpMode ? (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              leftIcon={<Mail className="w-5 h-5" />}
            />
            
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              leftIcon={<Lock className="w-5 h-5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-brand-500 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
            />

            <Button type="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>
        ) : (
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Morgan"
              required
              leftIcon={<User className="w-5 h-5" />}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              leftIcon={<Mail className="w-5 h-5" />}
            />
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              leftIcon={<Lock className="w-5 h-5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-brand-500 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
            />
            <Button type="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-brand-400">
          {isSignUpMode ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => setIsSignUpMode(!isSignUpMode)}
            className="text-accent-400 hover:text-accent-300 font-medium transition-colors ml-1"
          >
            {isSignUpMode ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </Card>
    </div>
  );
}
