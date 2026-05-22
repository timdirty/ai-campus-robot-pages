import React from 'react';
import {motion} from 'motion/react';
import {Camera, Users, ShieldAlert, Sparkles, Package, Eye} from 'lucide-react';
import {useCamera} from '../../hooks/useCamera';
import {useGemmaVision} from '../../hooks/useGeminiVision';
import type {CampusVisionResult, VisionScene} from '../../services/localVision';

const SCENE_ACCENTS: Record<VisionScene, string> = {
  crowd: '#f59e0b',
  safety: '#ef4444',
  cleaning: '#14b8a6',
  delivery: '#22c55e',
  patrol: '#3b82f6',
};
const SCENE_ICONS: Record<VisionScene, React.ElementType> = {
  crowd: Users,
  safety: ShieldAlert,
  cleaning: Sparkles,
  delivery: Package,
  patrol: Eye,
};
const SCENE_ACTION_LABELS: Record<VisionScene, string> = {
  crowd: '立即廣播疏導',
  safety: '緊急安全巡查',
  cleaning: '派遣清掃任務',
  delivery: '配送服務派遣',
  patrol: '開始巡邏任務',
};

interface VisionCameraCardProps {
  isOpen: boolean;
  showToast: (msg: string) => void;
  onDispatch: (result: CampusVisionResult) => void;
}

export function VisionCameraCard({isOpen, showToast, onDispatch}: VisionCameraCardProps) {
  const {videoRef, canvasRef, ready, error} = useCamera(isOpen);
  const {result, analyzing, source} = useGemmaVision(isOpen && ready, videoRef, canvasRef, 4000);

  const scene: VisionScene = result?.scene ?? 'patrol';
  const SceneIcon = SCENE_ICONS[scene];
  const accent = SCENE_ACCENTS[scene];

  const handleDispatch = () => {
    if (!result) return;
    // 只透過 props 傳給父層，不直接呼叫 sendHardwareCommand（避免雙送）
    onDispatch(result);
    showToast(`已派遣：${result.label} — ${result.zone}`);
  };

  return (
    <div className="w-full h-full bg-black relative overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      {!ready && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          style={{background: 'linear-gradient(160deg, #0d2137 0%, #1e3a5f 60%, #0a1a2e 100%)'}}
        >
          {error ? (
            <>
              <Camera size={48} className="text-red-400" />
              <p className="text-red-300 text-sm font-mono text-center px-6">{error}</p>
            </>
          ) : (
            <>
              <Camera size={48} className="text-white/40 animate-pulse" />
              <p className="text-white/50 text-sm font-mono">開啟攝影機中…</p>
            </>
          )}
        </div>
      )}
      {ready && (
        <motion.div
          animate={{y: ['0%', '100%', '0%']}}
          transition={{duration: 6, repeat: Infinity, ease: 'linear'}}
          className="absolute inset-x-0 h-0.5 bg-primary/40 shadow-[0_0_8px_rgba(99,102,241,0.8)] pointer-events-none z-10"
        />
      )}
      <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-16 pb-6 px-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-lg truncate">
                {result?.zone ?? '校園即時場域'}
              </p>
              <p className="text-white/60 text-sm font-mono mt-0.5">
                {analyzing
                  ? 'AI 辨識中…'
                  : result?.summary ?? (ready ? 'AI Vision 監控中' : '啟動中')}
              </p>
              {result && !analyzing && (
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full tracking-widest text-white"
                    style={{background: accent + 'cc'}}
                  >
                    {result.label}
                  </span>
                  <span className="text-[10px] text-white/50 font-mono">
                    {source === 'gemini' ? '雲端 AI' : source === 'ollama' ? '本地 AI' : '本地分析'} · {result.confidence}%
                  </span>
                </div>
              )}
            </div>
            <div
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 ${
                ready ? 'bg-red-500/80 text-white' : 'bg-black/60 text-white/40'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-white animate-pulse' : 'bg-white/30'}`} />
              {ready ? '實況' : '待機'}
            </div>
          </div>
          {result && (
            <button
              onClick={handleDispatch}
              className="w-full py-4 font-bold text-white rounded-2xl transition-all active:scale-[0.98]"
              style={{background: accent}}
            >
              <SceneIcon size={18} className="inline mr-2" />
              {SCENE_ACTION_LABELS[scene]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
