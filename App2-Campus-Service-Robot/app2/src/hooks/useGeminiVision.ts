import {useState, useEffect, useRef, useCallback} from 'react';
import {analyzeCampusImageWithGemma, type CampusVisionResult} from '../services/localVision';

// ─── Global rate limiter (singleton) ───────────────────────────────────────
// Ensures at most 1 Gemini vision call every 6s across all active views.
// Updated AFTER each request completes (not before) to avoid Strict Mode pollution.
let _lastGemmaCallMs = 0;
const GEMMA_MIN_INTERVAL_MS = 6000;

async function waitForGemmaSlot(signal: AbortSignal): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, _lastGemmaCallMs + GEMMA_MIN_INTERVAL_MS - now);
  if (waitMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, waitMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      {once: true},
    );
  });
}
// ───────────────────────────────────────────────────────────────────────────

export interface GemmaVisionResult {
  result: (CampusVisionResult & {aiSource?: 'gemini' | 'ollama' | 'pixel'}) | null;
  analyzing: boolean;
  source: 'gemini' | 'ollama' | 'local';
}

/**
 * Continuously captures frames and sends them to Gemini Vision.
 * Uses a loop (not setInterval) to avoid overlapping requests.
 * Updates rate limiter timestamp AFTER request completes (Strict Mode safe).
 */
export function useGeminiVision(
  active: boolean,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  intervalMs = 5000,
): GemmaVisionResult {
  const [result, setResult] = useState<(CampusVisionResult & {aiSource?: 'gemini' | 'ollama' | 'pixel'}) | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [source, setSource] = useState<'gemini' | 'ollama' | 'local'>('local');
  const abortRef = useRef<AbortController | null>(null);

  const captureJpeg = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return null;
    const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65);
  }, [videoRef, canvasRef]);

  useEffect(() => {
    if (!active) {
      abortRef.current?.abort();
      abortRef.current = null;
      setAnalyzing(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    async function loop() {
      while (!ctrl.signal.aborted) {
        try {
          await waitForGemmaSlot(ctrl.signal);
        } catch {
          break;
        }
        if (ctrl.signal.aborted) break;

        const dataUrl = captureJpeg();
        if (!dataUrl) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        setAnalyzing(true);
        try {
          const r = await analyzeCampusImageWithGemma(dataUrl, ctrl.signal);
          // Update rate limiter AFTER request completes (not before)
          _lastGemmaCallMs = Date.now();
          if (!ctrl.signal.aborted) {
            setResult(r);
            setSource(r.aiSource === 'gemini' || r.aiSource === 'ollama' ? r.aiSource : 'local');
          }
        } catch {
          // analyzeCampusImageWithGemma already falls back to local
        } finally {
          if (!ctrl.signal.aborted) setAnalyzing(false);
        }

        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, intervalMs);
          ctrl.signal.addEventListener('abort', () => {clearTimeout(t); reject();}, {once: true});
        }).catch(() => {});
      }
    }

    void loop();

    return () => {
      ctrl.abort();
      abortRef.current = null;
      setAnalyzing(false);
    };
  }, [active, captureJpeg, intervalMs]);

  return {result, analyzing, source};
}

export const useGemmaVision = useGeminiVision;
