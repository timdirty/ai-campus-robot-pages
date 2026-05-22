/**
 * RobotDisplaySync — App2 主控端機器人表情同步面板
 *
 * - POST /api/display/emotion → 橋接伺服器 → WebSocket /display → iPad robot_app2
 * - GET /api/display/info    → 取得 LAN IP，自動產生 QR Code 讓 iPad 掃描連線
 */

import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Bot, ChevronDown, ChevronUp, Copy, Check, ExternalLink, QrCode, RefreshCw, Smile, Wifi, WifiOff} from 'lucide-react';
import {useAppState} from '../state/AppStateProvider';
import {BRIDGE_URL, STATIC_DEMO} from '../services/hardwareBridge';

type EmotionKey =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised'
  | 'love' | 'sleepy' | 'cool' | 'thinking' | 'wink' | 'excited' | 'crying';

interface EmotionMeta { label: string; symbol: string; color: string; bg: string; }

const EMOTIONS: Record<EmotionKey, EmotionMeta> = {
  neutral:   { label: '平靜',  symbol: '○',  color: '#475569', bg: '#e2e8f0' },
  happy:     { label: '開心',  symbol: '✦',  color: '#c2410c', bg: '#fde68a' },
  sad:       { label: '難過',  symbol: '◌',  color: '#1e3a8a', bg: '#cbd5e1' },
  angry:     { label: '生氣',  symbol: '⚡', color: '#7f1d1d', bg: '#fca5a5' },
  surprised: { label: '驚訝',  symbol: '!',  color: '#6d28d9', bg: '#a5f3fc' },
  love:      { label: '愛心',  symbol: '♥',  color: '#9d174d', bg: '#fbcfe8' },
  sleepy:    { label: '想睡',  symbol: 'z',  color: '#a5b4fc', bg: '#312e81' },
  cool:      { label: '酷',    symbol: '◆',  color: '#06b6d4', bg: '#1e293b' },
  thinking:  { label: '思考',  symbol: '?',  color: '#047857', bg: '#bbf7d0' },
  wink:      { label: '眨眼',  symbol: '✦',  color: '#be185d', bg: '#fef9c3' },
  excited:   { label: '興奮',  symbol: '✦',  color: '#9a3412', bg: '#fef08a' },
  crying:    { label: '哭哭',  symbol: '◍',  color: '#1e3a8a', bg: '#bfdbfe' },
};

const EMOTION_KEYS = Object.keys(EMOTIONS) as EmotionKey[];

function taskEmotion(hasActiveDelivery: boolean): EmotionKey {
  if (hasActiveDelivery) return 'thinking';
  return 'happy';
}

function isClassroomBehaviorMessage(message: string): boolean {
  return /滑手機|手機|睡覺|趴睡|趴在桌|長時間低頭/.test(message);
}

function estimateSpeechHoldMs(message: string): number {
  const readableLength = message.replace(/\s+/g, '').length;
  const speechMs = readableLength * 240;
  return Math.max(2600, Math.min(9000, speechMs)) + 3000;
}

function createRobotDisplayUrl() {
  const url = new URL('robot-display.html', window.location.href);
  try {
    const bridge = new URL(BRIDGE_URL);
    url.searchParams.set('bridge', `${window.location.hostname || bridge.hostname || 'localhost'}:${bridge.port || '3204'}`);
  } catch {
    url.searchParams.set('bridge', `${window.location.hostname || 'localhost'}:3204`);
  }
  return url.toString();
}

export const RobotDisplaySync = memo(function RobotDisplaySync() {
  const state = useAppState();
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [robotEmotion, setRobotEmotion] = useState<EmotionKey>('happy');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertReplySeqRef = useRef(0);
  const emergencyActiveRef = useRef(false);
  const latestTaskEmotionRef = useRef<EmotionKey>('happy');
  const latestTeachingSignalIdRef = useRef<string | null>(null);
  const latestDeliveryKeyRef = useRef<string | null>(null);
  const latestDispatchKeyRef = useRef<string | null>(null);
  const localChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('app2-robot-display');
    localChannelRef.current = channel;
    return () => {
      channel.close();
      localChannelRef.current = null;
    };
  }, []);

  /* ── 輪詢橋接伺服器狀態 ── */
  useEffect(() => {
    if (STATIC_DEMO) {
      setConnected(true);
      return;
    }

    const poll = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      try {
        const res = await fetch(`${BRIDGE_URL}/api/display/status`, {signal: ctrl.signal});
        if (res.ok) {
          const json = await res.json() as {clients: number};
          setConnected(json.clients > 0);
        } else setConnected(false);
      } catch { setConnected(false); } finally { clearTimeout(t); }
    };
    void poll();
    statusPollRef.current = setInterval(poll, 5000);
    return () => { if (statusPollRef.current) clearInterval(statusPollRef.current); };
  }, []);

  const sendEmotion = useCallback(async (emotion: EmotionKey, message?: string) => {
    const sentAt = new Date();
    localChannelRef.current?.postMessage({type: 'display_emotion', emotion, message, source: 'app2-local', sentAt: sentAt.toISOString()});
    setRobotEmotion(emotion);
    setLastSync(`${String(sentAt.getHours()).padStart(2,'0')}:${String(sentAt.getMinutes()).padStart(2,'0')}:${String(sentAt.getSeconds()).padStart(2,'0')}`);
    if (STATIC_DEMO) {
      setConnected(true);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/display/emotion`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({emotion, message}),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const json = await res.json() as {clients: number};
        setConnected(json.clients > 0);
        setRobotEmotion(emotion);
        const now = new Date();
        setLastSync(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      }
    } catch { /* bridge offline */ } finally { clearTimeout(t); }
  }, []);

  const generateRobotAlertReply = useCallback(async (message: string): Promise<string> => {
    if (STATIC_DEMO) {
      return /跌倒|危險|警示|alert|risk/i.test(message)
        ? '我已收到警示，正在提醒附近同學保持距離，並同步通知老師確認狀況。'
        : '我已同步課堂狀態，會用溫和語音提醒學生回到任務。';
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 11000);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/ai/robot-reply`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({kind: 'classroom-alert', message}),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`robot reply ${res.status}`);
      const data = await res.json() as {message?: string};
      return typeof data.message === 'string' && data.message.trim()
        ? data.message.trim()
        : '上課要專心，先看老師這邊。';
    } catch {
      return /睡|趴/.test(message)
        ? '打起精神，認真上課囉。'
        : '上課不可以玩手機喔。';
    } finally {
      clearTimeout(t);
    }
  }, []);

  /* ── 全校封控最高優先級 ── */
  useEffect(() => {
    if (!autoSync) return;
    if (state.campusStatus.isEmergency) {
      if (emergencyActiveRef.current) return;
      emergencyActiveRef.current = true;
      alertReplySeqRef.current += 1;
      if (alertResetRef.current) {
        clearTimeout(alertResetRef.current);
        alertResetRef.current = null;
      }
      void sendEmotion('angry', '校園進入封控，請留在安全區域。');
      return;
    }

    if (emergencyActiveRef.current) {
      emergencyActiveRef.current = false;
      void sendEmotion('happy');
    }
  }, [state.campusStatus.isEmergency, autoSync, sendEmotion]);

  /* ── 自動同步 ── */
  useEffect(() => {
    if (!autoSync) return;
    const activeDeliveryOrder = state.orders.find((order) => order.status === 'in_transit');
    const hasActiveDelivery = state.tasks.some((task) => task.source === 'delivery' && task.status === 'in_progress');
    const activeDispatchTask = state.tasks.find((task) => task.source === 'dispatch' && task.status === 'in_progress');
    const nextEmotion = taskEmotion(hasActiveDelivery);
    latestTaskEmotionRef.current = nextEmotion;
    if (state.campusStatus.isEmergency) return;
    if (alertResetRef.current) return;

    if (activeDeliveryOrder) {
      const key = `${activeDeliveryOrder.id}:${activeDeliveryOrder.destination}:${activeDeliveryOrder.productName}`;
      if (latestDeliveryKeyRef.current === key) return;
      latestDeliveryKeyRef.current = key;
      void sendEmotion('thinking', `配送任務進行中，我正在把 ${activeDeliveryOrder.productName} 送到 ${activeDeliveryOrder.destination}。`);
      return;
    }

    if (latestDeliveryKeyRef.current) {
      latestDeliveryKeyRef.current = null;
      void sendEmotion('happy', '配送任務已完成，我回到待命狀態。');
      return;
    }

    if (activeDispatchTask) {
      const key = `${activeDispatchTask.id}:${activeDispatchTask.title}:${activeDispatchTask.area}`;
      if (latestDispatchKeyRef.current === key) return;
      latestDispatchKeyRef.current = key;
      const broadcast = /廣播|疏導/.test(`${activeDispatchTask.title} ${activeDispatchTask.detail ?? ''}`);
      void sendEmotion(
        broadcast ? 'surprised' : 'thinking',
        broadcast
          ? `收到校園提醒任務，我正在 ${activeDispatchTask.area} 協助廣播。`
          : `收到巡查任務，我正在前往 ${activeDispatchTask.area}。`,
      );
      return;
    }

    if (latestDispatchKeyRef.current) {
      latestDispatchKeyRef.current = null;
      void sendEmotion('happy', '生活服務任務已完成，我回到待命狀態。');
      return;
    }

    void sendEmotion(nextEmotion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orders, state.tasks, state.campusStatus.isEmergency, autoSync]);

  /* ── 教學訊號優先同步：學生提問 / 課堂警示會同步到 ROBOT.JSX ── */
  useEffect(() => {
    if (!autoSync) return;
    if (state.campusStatus.isEmergency) return;

    const leadSignal = state.teachingSignals[0];
    if (!leadSignal) {
      latestTeachingSignalIdRef.current = null;
      alertReplySeqRef.current += 1;
      if (alertResetRef.current) {
        clearTimeout(alertResetRef.current);
        alertResetRef.current = null;
        void sendEmotion(latestTaskEmotionRef.current);
      }
      return;
    }

    if (latestTeachingSignalIdRef.current === leadSignal.id && alertResetRef.current) return;
    latestTeachingSignalIdRef.current = leadSignal.id;
    if (alertResetRef.current) clearTimeout(alertResetRef.current);
    const seq = alertReplySeqRef.current + 1;
    alertReplySeqRef.current = seq;

    if (leadSignal.type === 'question') {
      const reply = `收到 ${leadSignal.name} 的提問，已同步到教授處置佇列。`;
      void sendEmotion('thinking', reply);
      alertResetRef.current = setTimeout(() => {
        if (alertReplySeqRef.current !== seq) return;
        void sendEmotion(latestTaskEmotionRef.current);
        alertResetRef.current = null;
      }, estimateSpeechHoldMs(reply));
      return;
    }

    const alertMessage = leadSignal.message || '上課有學生分心，請提醒專注。';
    if (!isClassroomBehaviorMessage(alertMessage)) {
      const reply = `收到課堂提醒：${leadSignal.name}。請老師確認現場狀況。`;
      void sendEmotion('surprised', reply);
      alertResetRef.current = setTimeout(() => {
        if (alertReplySeqRef.current !== seq) return;
        void sendEmotion(latestTaskEmotionRef.current);
        alertResetRef.current = null;
      }, estimateSpeechHoldMs(reply));
      return;
    }

    void generateRobotAlertReply(alertMessage).then((reply) => {
      if (alertReplySeqRef.current !== seq) return;
      void sendEmotion('angry', reply);
      alertResetRef.current = setTimeout(() => {
        if (alertReplySeqRef.current !== seq) return;
        void sendEmotion(latestTaskEmotionRef.current);
        alertResetRef.current = null;
      }, estimateSpeechHoldMs(reply));
    });
  }, [state.teachingSignals, state.campusStatus.isEmergency, autoSync, sendEmotion, generateRobotAlertReply]);

  useEffect(() => () => {
    if (alertResetRef.current) clearTimeout(alertResetRef.current);
  }, []);

  /* ── QR code 產生 ── */
  const generateQr = useCallback(async () => {
    setQrLoading(true);
    if (STATIC_DEMO) {
      try {
        const url = createRobotDisplayUrl();
        setQrUrl(url);
        const {default: QRCode} = await import('qrcode');
        const dataUrl = await QRCode.toDataURL(url, {
          width: 240, margin: 2,
          color: {dark: '#0f172a', light: '#ffffff'},
        });
        setQrSrc(dataUrl);
      } finally {
        setQrLoading(false);
      }
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const infoRes = await fetch(`${BRIDGE_URL}/api/display/info`, {signal: ctrl.signal});
      const info = await infoRes.json() as {robotDisplayUrl: string};
      setQrUrl(info.robotDisplayUrl);
      const {default: QRCode} = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(info.robotDisplayUrl, {
        width: 240, margin: 2,
        color: {dark: '#0f172a', light: '#ffffff'},
      });
      setQrSrc(dataUrl);
    } catch { /* ignore */ } finally { clearTimeout(t); setQrLoading(false); }
  }, []);

  const copyUrl = useCallback(() => {
    if (!qrUrl) return;
    void navigator.clipboard.writeText(qrUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [qrUrl]);

  const current = EMOTIONS[robotEmotion];

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left active:bg-surface-container-high/30 transition-colors"
      >
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: current.bg }}>
          <span className="text-base font-black" style={{ color: current.color }}>{current.symbol}</span>
          <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black tracking-widest text-on-surface-variant uppercase">機器人顯示面板</p>
          <p className="text-sm font-bold text-on-surface flex items-center gap-1.5">
            <span>{current.label}</span>
            {connected
              ? <span className="text-[10px] text-emerald-600 font-mono">[iPad 已連線]</span>
              : <span className="text-[10px] text-slate-400 font-mono">[等待 iPad]</span>}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* 狀態列 */}
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest p-2.5 ring-1 ring-outline-variant/20">
            {connected ? <Wifi className="h-4 w-4 text-emerald-500 shrink-0" /> : <WifiOff className="h-4 w-4 text-slate-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-on-surface-variant">
                {connected ? 'iPad 機器人顯示端已連線 (LAN WiFi)' : '等待 iPad 透過 WiFi 連線'}
              </p>
              {lastSync && <p className="text-[10px] font-mono text-on-surface-variant/60">最後推送 {lastSync}</p>}
            </div>
          </div>

          {/* QR Code 區塊 */}
          <div className="rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-outline-variant/10">
              <div className="flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-on-surface-variant" />
                <span className="text-[10px] font-black tracking-widest text-on-surface-variant uppercase">iPad 掃碼連線</span>
              </div>
              <button
                type="button"
                onClick={generateQr}
                disabled={qrLoading}
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:opacity-70 disabled:opacity-40 transition-opacity"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${qrLoading ? 'animate-spin' : ''}`} />
                {qrLoading ? '產生中...' : qrSrc ? '重新產生' : '產生 QR 碼'}
              </button>
            </div>

            {qrSrc ? (
              <div className="flex flex-col items-center gap-2 p-3">
                <img src={qrSrc} alt="Robot Display QR Code" className="w-32 h-32 rounded-lg shadow-sm" />
                <p className="text-[9px] font-mono text-on-surface-variant/60 text-center break-all leading-relaxed px-1">{qrUrl}</p>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary hover:opacity-70 transition-all"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? '已複製！' : '複製連結'}
                </button>
              </div>
            ) : (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-on-surface-variant/70">點「產生 QR 碼」</p>
                <p className="text-[10px] text-on-surface-variant/50">iPad 用相機掃描即可連線</p>
              </div>
            )}
          </div>

          {/* 自動同步開關 */}
          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className="flex items-center justify-between rounded-xl bg-surface-container-lowest px-3 py-2.5 ring-1 ring-outline-variant/20 transition-colors hover:bg-surface-container-low"
          >
            <div className="flex items-center gap-2">
              <Smile className="h-4 w-4 text-on-surface-variant" />
              <span className="text-xs font-bold text-on-surface">依任務狀態自動推送情緒</span>
            </div>
            <div className={`w-9 h-5 rounded-full relative shadow-inner transition-colors ${autoSync ? 'bg-primary' : 'bg-outline-variant'}`}>
              <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${autoSync ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </button>

          {/* 手動情緒觸發 */}
          <div>
            <p className="text-[10px] font-black tracking-widest text-on-surface-variant uppercase mb-2">手動送出情緒</p>
            <div className="grid grid-cols-4 gap-1.5">
              {EMOTION_KEYS.map((key) => {
                const em = EMOTIONS[key];
                const isActive = robotEmotion === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { void sendEmotion(key); setAutoSync(false); }}
                    className="flex flex-col items-center gap-0.5 rounded-xl py-2.5 text-center transition-all active:scale-95 hover:scale-[1.03]"
                    style={{
                      background: isActive ? em.bg : 'transparent',
                      border: `1.5px solid ${isActive ? em.color + '80' : 'rgba(0,0,0,0.08)'}`,
                      boxShadow: isActive ? `0 4px 12px ${em.color}30` : 'none',
                    }}
                    title={em.label}
                  >
                    <span className="text-sm leading-none" style={{ color: em.color }}>{em.symbol}</span>
                    <span className="text-[9px] font-black tracking-tight leading-tight" style={{ color: em.color }}>{em.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <a
            href={createRobotDisplayUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-surface-container-lowest px-4 py-2.5 text-xs font-bold text-on-surface-variant ring-1 ring-outline-variant/30 transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <Bot className="h-3.5 w-3.5" />
            <span>在新分頁預覽機器人顯示</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
});
