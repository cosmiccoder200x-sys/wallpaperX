import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, githubProvider, firebaseConfigured } from '../firebase/config';
import type { PlanType, User } from '../types';

import { AuthContext } from './useAuth';

function normalisePlan(value: unknown): PlanType {
  return value === 'pro' || value === 'admin' ? value : 'free';
}

function toDate(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in (value as object)) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return Date.now();
    }
  }
  return typeof value === 'number' ? value : Date.now();
}

function baseUser(authUser: FirebaseUser, plan: PlanType = 'free'): User {
  return {
    uid: authUser.uid,
    email: authUser.email,
    displayName: authUser.displayName,
    photoURL: authUser.photoURL,
    plan,
    dailyOptimizations: 0,
    credits: 100,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
}

async function profileFor(authUser: FirebaseUser): Promise<User> {
  const fallback = baseUser(authUser);
  try {
    const snapshot = await getDoc(doc(db, 'users', authUser.uid));
    if (!snapshot.exists()) {
      await setDoc(
        doc(db, 'users', authUser.uid),
        {
          uid: authUser.uid,
          email: authUser.email,
          displayName:
            authUser.displayName || authUser.email?.split('@')[0] || 'Wallpaper Creator',
          photoURL: authUser.photoURL,
          plan: 'free',
          dailyOptimizations: 0,
          credits: 100,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        },
        { merge: true }
      );
      return fallback;
    }

    const data = snapshot.data();
    return {
      ...fallback,
      displayName: authUser.displayName || data.displayName || fallback.displayName,
      plan: normalisePlan(data.plan),
      dailyOptimizations: Number(data.dailyOptimizations) || 0,
      credits: Number(data.credits) || 0,
      createdAt: toDate(data.createdAt),
    };
  } catch (error) {
    // Network/permission problems must not lock the user out of the app.
    console.warn('Could not load the user profile; continuing with the auth identity.', error);
    return fallback;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (authUser) => {
        if (cancelled) return;
        if (authUser) {
          const profile = await profileFor(authUser);
          if (!cancelled) setUser(profile);
        } else {
          setUser(null);
        }
        if (!cancelled) setLoading(false);
      },
      (error) => {
        console.error('Auth state listener failed:', error);
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const requireFirebase = useCallback(() => {
    if (!firebaseConfigured) {
      throw new Error(
        'Sign-in is not configured in this deployment. You can still optimize images anonymously.'
      );
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      requireFirebase();
      await signInWithEmailAndPassword(auth, email, password);
    },
    [requireFirebase]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      requireFirebase();
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (name && result.user) {
        await updateProfile(result.user, { displayName: name });
      }
      if (result.user) {
        const profile = await profileFor(result.user);
        setUser(profile);
      }
    },
    [requireFirebase]
  );

  const loginWithGoogle = useCallback(async () => {
    requireFirebase();
    await signInWithPopup(auth, googleProvider);
  }, [requireFirebase]);

  const loginWithGithub = useCallback(async () => {
    requireFirebase();
    await signInWithPopup(auth, githubProvider);
  }, [requireFirebase]);

  const logout = useCallback(async () => {
    if (firebaseConfigured) {
      await signOut(auth);
    }
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      return;
    }
    setUser(await profileFor(auth.currentUser));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        loginWithGithub,
        logout,
        refreshUser,
        isAuthenticated: Boolean(user),
        isPro: user?.plan === 'pro' || user?.plan === 'admin',
        isAdmin: user?.plan === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
