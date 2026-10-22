import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Download, Sparkles, Sliders, Smartphone, Monitor, Image as ImageIcon, Save } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { savePreset, getUserPresets, deletePreset, saveWallpaperLog, getUserWallpapers } from '../firebase/db';

const DEVICE_PRESETS = [
  { name: 'Desktop 4K', ratio: '16:9', width: 3840, height: 2160, icon: Monitor },
  { name: 'Desktop QHD', ratio: '16:9', width: 2560, height: 1440, icon: Monitor },
  { name: 'iPhone 15/14', ratio: '9:16', width: 1179, height: 2556, icon: Smartphone },
  { name: 'Android Portrait', ratio: '9:16', width: 1080, height: 1920, icon: Smartphone },
  { name: 'Ultrawide 21:9', ratio: '21:9', width: 3440, height: 1440, icon: Monitor },
  { name: 'iPad / Tablet', ratio: '4:3', width: 2048, height: 1536, icon: Monitor },
  { name: 'Smartwatch', ratio: '1:1', width: 1000, height: 1000, icon: Smartphone }
];

export function Studio() {
  const { user } = useAuth();
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [fitMode, setFitMode] = useState<'cover' | 'contain_glass' | 'contain_black'>('contain_glass');
  const [glassBlur, setGlassBlur] = useState(true);
  const [vibrance, setVibrance] = useState(110);
  const [brightness, setBrightness] = useState(100);
  const [format, setFormat] = useState<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const [quality, setQuality] = useState(90);

  const [origSizeKB, setOrigSizeKB] = useState(0);
  const [optSizeKB, setOptSizeKB] = useState(0);
  const [cloudPresets, setCloudPresets] = useState<any[]>([]);
  const [cloudHistory, setCloudHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'presets' | 'history'>('presets');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeDevice = DEVICE_PRESETS[activePresetIndex];

  const loadCloudData = useCallback(async () => {
    if (!user) return;
    try {
      const presets = await getUserPresets(user.uid);
      setCloudPresets(presets);
      const history = await getUserWallpapers(user.uid);
      setCloudHistory(history);
    } catch {
      setStatusMsg('Cloud data could not be loaded. Local editing still works.');
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadCloudData();
  }, [user, loadCloudData]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOrigSizeKB(Math.round(file.size / 1024));
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          setLoadedImage(img);
        };
        if (evt.target?.result) {
          img.src = evt.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!loadedImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = activeDevice.width;
    canvas.height = activeDevice.height;

    ctx.clearRect(0, 0, activeDevice.width, activeDevice.height);
    ctx.filter = `saturate(${vibrance}%) brightness(${brightness}%)`;

    if (fitMode === 'cover') {
      const scale = Math.max(activeDevice.width / loadedImage.width, activeDevice.height / loadedImage.height);
      const x = (activeDevice.width / 2) - (loadedImage.width / 2) * scale;
      const y = (activeDevice.height / 2) - (loadedImage.height / 2) * scale;
      ctx.drawImage(loadedImage, x, y, loadedImage.width * scale, loadedImage.height * scale);
    } else {
      if (glassBlur || fitMode === 'contain_glass') {
        ctx.save();
        ctx.filter = `blur(40px) saturate(${vibrance * 1.2}%) brightness(${brightness * 0.8}%)`;
        const bgScale = Math.max(activeDevice.width / loadedImage.width, activeDevice.height / loadedImage.height);
        const bgX = (activeDevice.width / 2) - (loadedImage.width / 2) * bgScale;
        const bgY = (activeDevice.height / 2) - (loadedImage.height / 2) * bgScale;
        ctx.drawImage(loadedImage, bgX, bgY, loadedImage.width * bgScale, loadedImage.height * bgScale);
        ctx.restore();

        ctx.fillStyle = 'rgba(9, 13, 22, 0.4)';
        ctx.fillRect(0, 0, activeDevice.width, activeDevice.height);
      } else {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, activeDevice.width, activeDevice.height);
      }

      const scale = Math.min(activeDevice.width / loadedImage.width, activeDevice.height / loadedImage.height);
      const x = (activeDevice.width / 2) - (loadedImage.width / 2) * scale;
      const y = (activeDevice.height / 2) - (loadedImage.height / 2) * scale;
      ctx.drawImage(loadedImage, x, y, loadedImage.width * scale, loadedImage.height * scale);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        setOptSizeKB(Math.round(blob.size / 1024));
      }
    }, format, quality / 100);
  }, [loadedImage, activeDevice, fitMode, glassBlur, vibrance, brightness, format, quality]);

  const handleExport = () => {
    if (!canvasRef.current || !loadedImage) return;
    const canvas = canvasRef.current;
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WallpaperX_${activeDevice.name}_${activeDevice.width}x${activeDevice.height}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (user) {
        saveWallpaperLog(user.uid, {
          title: `${activeDevice.name} (${activeDevice.ratio})`,
          originalSizeKB: origSizeKB,
          optimizedSizeKB: optSizeKB,
          reductionPercent: origSizeKB > 0 ? Math.max(0, Math.round(((origSizeKB - optSizeKB) / origSizeKB) * 100)) : 0,
          dimensions: `${activeDevice.width}x${activeDevice.height}`,
          format: ext.toUpperCase()
        }).then(() => loadCloudData());
      }
    }, format, quality / 100);
  };

  const handleSavePreset = async () => {
    if (!user) {
      setStatusMsg('Please sign in to save cloud presets.');
      return;
    }
    const res = await savePreset(user.uid, {
      name: `${activeDevice.name} - ${fitMode}`,
      aspectRatio: activeDevice.ratio,
      width: activeDevice.width,
      height: activeDevice.height,
      targetDevice: activeDevice.name,
      format,
      quality: quality / 100,
      applyGlassmorphism: glassBlur,
      colorVibrance: vibrance
    });
    if (res.success) {
      setStatusMsg('Preset saved to Firebase!');
      loadCloudData();
    }
  };

  return (
    <div className="min-h-screen bg-brand-950 text-white p-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-brand-800">
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-indigo-500" /> WallpaperX Studio
        </h1>
        <Link to="/optimizer" className="text-sm text-indigo-300 hover:text-white underline">
          Go to size optimizer
        </Link>
      </header>

      {statusMsg && (
        <div className="mb-4 p-3 bg-indigo-500/20 border border-indigo-500/40 rounded-lg text-indigo-200 text-sm flex items-center justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="text-white font-bold ml-4">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Sidebar */}
        <div className="lg:col-span-4 bg-brand-900/60 backdrop-blur-md p-6 rounded-2xl border border-brand-800 space-y-6">
          <h2 className="text-lg font-bold flex items-center gap-2 border-b border-brand-800 pb-2">
            <Smartphone className="w-5 h-5 text-indigo-400" /> Target Screen Ratio
          </h2>

          <div className="grid grid-cols-2 gap-2">
            {DEVICE_PRESETS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => setActivePresetIndex(idx)}
                className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all ${
                  activePresetIndex === idx
                    ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-brand-950/40 border-brand-800 text-brand-300 hover:bg-brand-800/40'
                }`}
              >
                <div>{p.name}</div>
                <div className="text-brand-500 text-[10px] mt-1">{p.ratio} ({p.width}x{p.height})</div>
              </button>
            ))}
          </div>

          <h2 className="text-lg font-bold flex items-center gap-2 border-b border-brand-800 pb-2 pt-2">
            <Sliders className="w-5 h-5 text-indigo-400" /> Optimization Filters
          </h2>

          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-brand-400 font-medium mb-1">Aspect Fit Mode</label>
              <select
                value={fitMode}
                onChange={(e: any) => setFitMode(e.target.value)}
                className="w-full bg-brand-950 border border-brand-800 rounded-lg p-2 text-white"
              >
                <option value="cover">Smart Crop (Fill Screen)</option>
                <option value="contain_glass">Glassmorphism Backdrop (Fit)</option>
                <option value="contain_black">Solid Padding (Fit)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-brand-400 font-medium">Glass Blur Fill</span>
              <input
                type="checkbox"
                checked={glassBlur}
                onChange={(e) => setGlassBlur(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded"
              />
            </div>

            <div>
              <div className="flex justify-between text-brand-400 font-medium mb-1">
                <span>Color Vibrance</span>
                <span>{vibrance}%</span>
              </div>
              <input
                type="range"
                min="80"
                max="180"
                value={vibrance}
                onChange={(e) => setVibrance(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-brand-400 font-medium mb-1">
                <span>Brightness</span>
                <span>{brightness}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="130"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <div>
              <label className="block text-brand-400 font-medium mb-1">Export Format</label>
              <select
                value={format}
                onChange={(e: any) => setFormat(e.target.value)}
                className="w-full bg-brand-950 border border-brand-800 rounded-lg p-2 text-white"
              >
                <option value="image/webp">WebP (SaaS Speed & Size)</option>
                <option value="image/jpeg">JPEG (Standard Photo)</option>
                <option value="image/png">PNG (Lossless Quality)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-brand-400 font-medium mb-1">
                <span>Quality Compression</span>
                <span>{quality}%</span>
              </div>
              <input
                type="range"
                min="40"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <button
              onClick={handleSavePreset}
              className="w-full mt-4 bg-brand-800 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 border border-brand-700 transition"
            >
              <Save className="w-4 h-4" /> Save Preset to Firebase
            </button>
          </div>
        </div>

        {/* Canvas Center Preview */}
        <div className="lg:col-span-5 bg-brand-900/60 backdrop-blur-md p-6 rounded-2xl border border-brand-800 flex flex-col items-center justify-center min-h-[460px]">
          {!loadedImage ? (
            <label className="w-full h-full border-2 border-dashed border-brand-700 hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-brand-950/20">
              <ImageIcon className="w-12 h-12 text-indigo-400 mb-3" />
              <span className="text-lg font-bold text-white mb-1">Drop Image to Optimize</span>
              <span className="text-xs text-brand-400 mb-4">Supports PNG, JPG, WebP</span>
              <span className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg">
                Browse File
              </span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          ) : (
            <div className="relative w-full flex flex-col items-center">
              <canvas ref={canvasRef} className="max-h-[420px] max-w-full rounded-lg shadow-2xl object-contain border border-brand-800" />
              <button
                onClick={() => setLoadedImage(null)}
                className="mt-4 text-xs text-brand-400 hover:text-white underline"
              >
                Upload Different Image
              </button>
            </div>
          )}
        </div>

        {/* Stats & History Sidebar */}
        <div className="lg:col-span-3 bg-brand-900/60 backdrop-blur-md p-6 rounded-2xl border border-brand-800 space-y-4">
          <h2 className="text-lg font-bold border-b border-brand-800 pb-2">Optimization Stats</h2>

          <div className="bg-brand-950/60 p-3 rounded-xl border border-brand-800">
            <div className="text-xs text-brand-400">Target Canvas</div>
            <div className="text-lg font-extrabold text-white">{activeDevice.width} x {activeDevice.height}</div>
          </div>

          <div className="bg-brand-950/60 p-3 rounded-xl border border-brand-800">
            <div className="text-xs text-brand-400">Original Size</div>
            <div className="text-lg font-extrabold text-white">{origSizeKB > 0 ? `${origSizeKB} KB` : '-- KB'}</div>
          </div>

          <div className="bg-brand-950/60 p-3 rounded-xl border border-brand-800">
            <div className="text-xs text-brand-400">Optimized Size</div>
            <div className="text-lg font-extrabold text-emerald-400">{optSizeKB > 0 ? `${optSizeKB} KB` : '-- KB'}</div>
          </div>

          <button
            disabled={!loadedImage}
            onClick={handleExport}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition disabled:opacity-50"
          >
            <Download className="w-5 h-5" /> Export Wallpaper
          </button>

          <div className="pt-4 border-t border-brand-800">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setActiveTab('presets')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg ${activeTab === 'presets' ? 'bg-indigo-600 text-white' : 'text-brand-400'}`}
              >
                Cloud Presets
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg ${activeTab === 'history' ? 'bg-indigo-600 text-white' : 'text-brand-400'}`}
              >
                History
              </button>
            </div>

            {activeTab === 'presets' ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cloudPresets.length === 0 ? (
                  <p className="text-xs text-brand-500 text-center py-2">No cloud presets saved yet.</p>
                ) : (
                  cloudPresets.map((p) => (
                    <div key={p.id} className="text-xs bg-brand-950/40 p-2 rounded-lg border border-brand-800 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] text-brand-400">{p.width}x{p.height}</div>
                      </div>
                      <button onClick={async () => { await deletePreset(p.id); loadCloudData(); }} className="text-red-400 hover:text-red-300">🗑️</button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cloudHistory.length === 0 ? (
                  <p className="text-xs text-brand-500 text-center py-2">No wallpaper history recorded.</p>
                ) : (
                  cloudHistory.map((h) => (
                    <div key={h.id} className="text-xs bg-brand-950/40 p-2 rounded-lg border border-brand-800">
                      <div className="font-semibold text-white">{h.title}</div>
                      <div className="text-[10px] text-emerald-400">{h.dimensions} • {h.optimizedSizeKB} KB</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
