import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Firebase web configuration is public by design (it is not a secret). When the
 * environment is missing, the app still works anonymously for optimization and
 * sign-in surfaces a clear error instead of silently failing.
 */
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

if (!firebaseConfigured && import.meta.env.DEV) {
  console.warn(
    'Firebase is not configured. Set VITE_FIREBASE_* variables to enable sign-in and cloud presets.'
  );
}

const app = initializeApp({
  apiKey: firebaseConfig.apiKey || 'unconfigured',
  authDomain: firebaseConfig.authDomain || 'unconfigured.firebaseapp.com',
  projectId: firebaseConfig.projectId || 'unconfigured',
  storageBucket: firebaseConfig.storageBucket || 'unconfigured.appspot.com',
  messagingSenderId: firebaseConfig.messagingSenderId || '0',
  appId: firebaseConfig.appId || '1:0:web:unconfigured',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const githubProvider = new GithubAuthProvider();
githubProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
