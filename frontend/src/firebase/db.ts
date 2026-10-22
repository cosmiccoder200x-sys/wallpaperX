import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './config';

// Sync user profile to Firestore
export const syncUserProfile = async (user: any) => {
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  const userData: any = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'Wallpaper Creator',
    photoURL: user.photoURL || null,
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (!userSnap.exists()) {
    userData.createdAt = serverTimestamp();
    userData.plan = 'free';
    userData.credits = 100;
    userData.dailyOptimizations = 0;
  }

  await setDoc(userRef, userData, { merge: true });
  return userData;
};

// Save a wallpaper optimization preset
export const savePreset = async (userId: string, presetData: any) => {
  try {
    const docRef = await addDoc(collection(db, 'presets'), {
      userId,
      name: presetData.name || 'Custom Preset',
      aspectRatio: presetData.aspectRatio || '16:9',
      width: presetData.width || 1920,
      height: presetData.height || 1080,
      targetDevice: presetData.targetDevice || 'Desktop',
      format: presetData.format || 'image/webp',
      quality: presetData.quality || 0.9,
      applyGlassmorphism: presetData.applyGlassmorphism || false,
      colorVibrance: presetData.colorVibrance || 100,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, success: true };
  } catch (error: any) {
    return { id: null, success: false, error: error.message };
  }
};

// Get all saved presets for a user
export const getUserPresets = async (userId: string) => {
  try {
    const q = query(collection(db, 'presets'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const presets: any[] = [];
    snapshot.forEach((d) => presets.push({ id: d.id, ...d.data() }));
    return presets;
  } catch (error) {
    return [];
  }
};

// Delete a saved preset
export const deletePreset = async (presetId: string) => {
  try {
    await deleteDoc(doc(db, 'presets', presetId));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// Save wallpaper optimization history log
export const saveWallpaperLog = async (userId: string, wallpaperData: any) => {
  try {
    const docRef = await addDoc(collection(db, 'wallpapers'), {
      userId,
      title: wallpaperData.title || 'Optimized Wallpaper',
      originalSizeKB: wallpaperData.originalSizeKB || 0,
      optimizedSizeKB: wallpaperData.optimizedSizeKB || 0,
      reductionPercent: wallpaperData.reductionPercent || 0,
      dimensions: wallpaperData.dimensions || '1920x1080',
      format: wallpaperData.format || 'WEBP',
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, success: true };
  } catch (error: any) {
    return { id: null, success: false, error: error.message };
  }
};

// Get wallpaper optimization history for a user
export const getUserWallpapers = async (userId: string) => {
  try {
    const q = query(collection(db, 'wallpapers'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const list: any[] = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    return list;
  } catch (error) {
    return [];
  }
};
