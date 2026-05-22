import {useState, useEffect, useRef} from 'react';

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  error: string | null;
}

/**
 * Manages camera lifecycle tied to `active` flag.
 * Tries rear camera first, falls back to front (iOS workaround), then any video device.
 * Cleans up stream + srcObject on deactivate.
 */
export function useCamera(active: boolean): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.onloadedmetadata = null;
      }
      setReady(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function startCamera() {
      const constraintSets: MediaStreamConstraints[] = [
        {video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}}, audio: false},
        {video: {facingMode: 'user', width: {ideal: 1280}}, audio: false},
        {video: true, audio: false},
      ];

      let stream: MediaStream | null = null;
      let lastError: Error | null = null;
      for (const c of constraintSets) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
            continue;
          }
          break;
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (!stream) {
        const msg =
          lastError?.name === 'NotAllowedError'
            ? '相機權限被拒絕，請在瀏覽器設定中允許'
            : `相機無法啟動：${lastError?.message ?? '未知錯誤'}`;
        setError(msg);
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          // Guard: only set ready if this stream is still the active one
          if (!cancelled && video.srcObject === stream) setReady(true);
        };
        video.play().catch(() => {});
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.onloadedmetadata = null;
      }
      setReady(false);
    };
  }, [active]);

  return {videoRef, canvasRef, ready, error};
}
