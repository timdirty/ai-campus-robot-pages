import {memo, useEffect, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gauge,
  HeartHandshake,
  Loader2,
  MapPin,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCw,
  Shield,
  ShieldOff,
  Siren,
  Sparkles,
  Square,
  WifiOff,
  Zap,
} from 'lucide-react';
import type {GuardianState, ZoneSensorReading} from '../types';
import type {SchoolZoneStatus} from '../services/schoolSpaces';
import {sendGuardianDriveCommand, sendGuardianHardwareCommand} from '../services/hardwareBridge';
import {ExternalRobotPanel} from './ExternalRobotPanel';

const DRIVE_LABELS: Record<string, string> = {
  FORWARD: '前進',
  BACKWARD: '後退',
  LEFT: '左轉',
  RIGHT: '右轉',
  STOP: '停止',
};

const SPEED_PRESETS = [
  {label: '巡邏', value: 110},
  {label: '穩定', value: 180},
  {label: '到場', value: 235},
] as const;

// ── command catalog ────────────────────────────────────────────────────────────
const QUICK_CMDS = [
  {
    cmd: 'ALERT_SIGNAL',
    label: '警示信號',
    sub: '啟動警示燈號',
    icon: Siren,
    ring: 'ring-rose-400',
    active: 'bg-rose-500 text-white shadow-rose-200',
    idle: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  },
  {
    cmd: 'CARE_DEPLOYED',
    label: '部署關懷',
    sub: '發送關懷機器人',
    icon: HeartHandshake,
    ring: 'ring-teal-400',
    active: 'bg-teal-500 text-white shadow-teal-200',
    idle: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
  },
  {
    cmd: 'PATROL_START',
    label: '開始巡查',
    sub: '機器人校園巡邏',
    icon: Shield,
    ring: 'ring-blue-400',
    active: 'bg-blue-500 text-white shadow-blue-200',
    idle: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
  {
    cmd: 'ROBOT_PAUSE',
    label: '暫停機器人',
    sub: '暫停當前任務',
    icon: PauseCircle,
    ring: 'ring-amber-400',
    active: 'bg-amber-500 text-white shadow-amber-200',
    idle: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
  {
    cmd: 'ROBOT_RESUME',
    label: '繼續任務',
    sub: '恢復機器人運行',
    icon: PlayCircle,
    ring: 'ring-emerald-400',
    active: 'bg-emerald-500 text-white shadow-emerald-200',
    idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  },
  {
    cmd: 'SAFETY_LOCKDOWN',
    label: '安全鎖定',
    sub: '啟動全校安全程序',
    icon: ShieldOff,
    ring: 'ring-red-400',
    active: 'bg-red-600 text-white shadow-red-200',
    idle: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  },
  {
    cmd: 'FIREWORK',
    label: '慶祝動畫',
    sub: '正面強化回饋',
    icon: Sparkles,
    ring: 'ring-violet-400',
    active: 'bg-violet-500 text-white shadow-violet-200',
    idle: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  },
  {
    cmd: 'NODE_RESTART',
    label: '重啟節點',
    sub: '重新連線硬體節點',
    icon: RotateCw,
    ring: 'ring-slate-400',
    active: 'bg-slate-500 text-white shadow-slate-200',
    idle: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
  },
] as const;

const ZONE_META: Record<string, {emoji: string; dispatch: string}> = {
  'zone-library': {emoji: '📚', dispatch: 'CARE_DEPLOYED'},
  'zone-hall': {emoji: '🚶', dispatch: 'PATROL_START'},
  'zone-classroom': {emoji: '✏️', dispatch: 'CARE_DEPLOYED'},
  'zone-gym': {emoji: '🏀', dispatch: 'ALERT_SIGNAL'},
  'zone-field': {emoji: '⚽', dispatch: 'CARE_DEPLOYED'},
};

// ── types ──────────────────────────────────────────────────────────────────────
interface HwResult {
  ok: boolean;
  title: string;
  detail: string;
  cmd: string;
}

interface Props {
  bridgeOnline: boolean;
  zones: SchoolZoneStatus[];
  sensors: ZoneSensorReading[];
  state: GuardianState;
  onDispatchRobot: (zone: SchoolZoneStatus) => void;
}

// ── component ─────────────────────────────────────────────────────────────────
export function GuardianControlPanel({bridgeOnline, zones, sensors, state, onDispatchRobot}: Props) {
  const [busy, setBusy] = useState(false);
  const [driveActive, setDriveActive] = useState<string | null>(null);
  const [driveSpeed, setDriveSpeed] = useState(180);
  const [activeCmds, setActiveCmds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<HwResult>({
    ok: true,
    cmd: '',
    title: '守護機器人待命',
    detail: '選擇指令或直接派遣到校園空間，結果會即時顯示。',
  });
  const [logOpen, setLogOpen] = useState(false);
  const speedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const driveActiveRef = useRef<string | null>(null);

  const connectedSensorCount = sensors.filter((s) => s.connected).length;
  const avgTemp = (() => {
    const live = sensors.filter((s) => s.connected && s.temp !== null);
    if (!live.length) return null;
    return (live.reduce((s, r) => s + r.temp!, 0) / live.length).toFixed(1);
  })();

  const flash = (cmd: string) => {
    setActiveCmds((p) => new Set([...p, cmd]));
    const t = setTimeout(() => setActiveCmds((p) => {const n = new Set(p); n.delete(cmd); return n;}), 800);
    flashTimers.current.push(t);
  };

  const sendDrive = async (cmd: string, announce = false) => {
    const result = await sendGuardianDriveCommand(cmd);
    if (announce || !result.ok) {
      setFeedback({
        ok: result.ok,
        cmd,
        title: result.ok ? `底盤指令已接收：${cmd}` : '底盤指令已記錄',
        detail: result.ok ? '四輪 L293D 底盤正在依照方向與速度移動。' : result.message,
      });
    }
    return result;
  };

  const startDrive = (dir: string) => {
    driveActiveRef.current = dir;
    setDriveActive(dir);
    void sendDrive(dir, true);
  };

  const stopDrive = () => {
    if (!driveActiveRef.current) return;
    driveActiveRef.current = null;
    setDriveActive(null);
    void sendDrive('STOP', true);
  };

  const handleSpeedChange = (value: number) => {
    setDriveSpeed(value);
    if (speedTimer.current) clearTimeout(speedTimer.current);
    speedTimer.current = setTimeout(() => {
      void sendDrive(`SPEED:${value}`);
    }, 120);
  };

  useEffect(() => {
    void sendDrive(`SPEED:${driveSpeed}`);
    return () => {
      if (speedTimer.current) clearTimeout(speedTimer.current);
      flashTimers.current.forEach(clearTimeout);
      flashTimers.current = [];
      void sendGuardianDriveCommand('STOP').catch(() => {});
    };
  }, []);

  const send = async (cmd: string, source = 'control-panel') => {
    if (busy) return;
    setBusy(true);
    const meta = QUICK_CMDS.find((c) => c.cmd === cmd);
    setFeedback({ok: true, cmd, title: meta?.label ?? cmd, detail: '正在送出指令⋯⋯'});
    try {
      const result = await sendGuardianHardwareCommand(cmd, `app3:${source}`);
      flash(cmd);
      setFeedback({
        ok: result.ok,
        cmd,
        title: result.ok ? `${meta?.label ?? cmd} 已接收` : `${meta?.label ?? cmd} 已記錄`,
        detail: result.ok
          ? '實體機器人已收到指令，即時執行中。'
          : '目前使用本機備援模式，任務仍完整記錄。',
      });
    } catch {
      setFeedback({ok: false, cmd, title: '指令未送出', detail: '橋接伺服器未回應，請確認連線後再試。'});
    } finally {
      setBusy(false);
    }
  };

  const dispatchToZone = (zone: SchoolZoneStatus) => {
    onDispatchRobot(zone);
    // CARE_DEPLOYED hardware cue is sent by App.tsx dispatchRobotToZone to avoid duplicate sends
  };

  return (
    <div className="space-y-4">

      {/* ── Connection status card ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">連線狀態</p>
        <div className="grid grid-cols-3 gap-2">
          {/* Bridge */}
          <div className={`flex flex-col items-center gap-1.5 rounded-xl p-3 ${bridgeOnline ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${bridgeOnline ? 'bg-emerald-500' : 'bg-red-400'}`}>
              {bridgeOnline
                ? <CheckCircle2 className="h-4 w-4 text-white" />
                : <WifiOff className="h-4 w-4 text-white" />}
            </span>
            <p className={`text-[10px] font-black ${bridgeOnline ? 'text-emerald-700' : 'text-red-600'}`}>
              {bridgeOnline ? '橋接在線' : '橋接離線'}
            </p>
          </div>
          {/* Sensor */}
          <div className={`flex flex-col items-center gap-1.5 rounded-xl p-3 ${connectedSensorCount > 0 ? 'bg-teal-50' : 'bg-slate-100'}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${connectedSensorCount > 0 ? 'bg-teal-500 text-white' : 'bg-slate-400 text-white'}`}>
              {connectedSensorCount}
            </span>
            <p className={`text-[10px] font-black ${connectedSensorCount > 0 ? 'text-teal-700' : 'text-slate-500'}`}>
              感測器在線
            </p>
            {avgTemp && (
              <p className="text-[9px] font-semibold text-teal-600">均溫 {avgTemp}°C</p>
            )}
          </div>
          {/* Robot */}
          <div className={`flex flex-col items-center gap-1.5 rounded-xl p-3 ${state.hardwareEvents[0]?.status === 'sent' ? 'bg-blue-50' : 'bg-slate-100'}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${state.hardwareEvents[0]?.status === 'sent' ? 'bg-blue-500' : 'bg-slate-400'}`}>
              <Bot className="h-4 w-4 text-white" />
            </span>
            <p className={`text-[10px] font-black ${state.hardwareEvents[0]?.status === 'sent' ? 'text-blue-700' : 'text-slate-500'}`}>
              {state.hardwareEvents[0]?.status === 'sent' ? '機器人在線' : '本機模式'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Feedback banner ── */}
      <motion.div
        layout
        className={`flex items-center gap-4 rounded-2xl border p-4 transition-colors ${
          feedback.ok ? 'border-teal-100 bg-teal-50' : 'border-amber-100 bg-amber-50'
        }`}
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${feedback.ok ? 'bg-white' : 'bg-white'}`}>
          {busy
            ? <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            : feedback.ok
              ? <Bot className="h-5 w-5 text-teal-600" />
              : <AlertTriangle className="h-5 w-5 text-amber-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">即時回饋</p>
          <p className="mt-0.5 text-sm font-black text-slate-800">{feedback.title}</p>
          <p className="text-xs text-slate-500">{feedback.detail}</p>
        </div>
      </motion.div>

      {/* ── Drive base ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">巡邏底盤</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">M1/M4 左側，M2/M3 右側</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
            <Gauge className="h-3.5 w-3.5" />
            {driveSpeed}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="grid grid-cols-3 gap-1.5 select-none" style={{touchAction: 'none'}}>
            <div />
            <DriveButton dir="FORWARD" icon={ArrowUp} active={driveActive === 'FORWARD'} onStart={startDrive} onStop={stopDrive} />
            <div />
            <DriveButton dir="LEFT" icon={ArrowLeft} active={driveActive === 'LEFT'} onStart={startDrive} onStop={stopDrive} />
            <button
              type="button"
              onPointerDown={() => {
                setDriveActive(null);
                void sendDrive('STOP', true);
              }}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
              title="立即停止"
              style={{touchAction: 'none'}}
            >
              <Square className="h-5 w-5" />
            </button>
            <DriveButton dir="RIGHT" icon={ArrowRight} active={driveActive === 'RIGHT'} onStart={startDrive} onStop={stopDrive} />
            <div />
            <DriveButton dir="BACKWARD" icon={ArrowDown} active={driveActive === 'BACKWARD'} onStart={startDrive} onStop={stopDrive} />
            <div />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-500">
              <span>移動速度</span>
              <span className="tabular-nums">{driveSpeed} / 255</span>
            </div>
            <input
              type="range"
              min={70}
              max={255}
              value={driveSpeed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-teal-600"
            />
            <div className="flex justify-between text-[10px] font-bold text-slate-400">
              <span>穩定巡邏</span>
              <span>快速到場</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick command grid ── */}
      <div>
        <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">守護指令</p>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_CMDS.map(({cmd, label, sub, icon: Icon, idle, active, ring}) => {
            const isActive = activeCmds.has(cmd);
            return (
              <motion.button
                key={cmd}
                whileTap={{scale: 0.96}}
                onClick={() => send(cmd)}
                disabled={busy}
                className={[
                  'flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl border-2 p-3.5 text-left transition-all',
                  isActive ? `${active} border-transparent ring-2 ${ring} shadow-lg` : idle,
                  busy ? 'opacity-60' : '',
                ].join(' ')}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-black leading-tight">{label}</p>
                  <p className={`text-[10px] font-medium ${isActive ? 'opacity-80' : 'opacity-60'}`}>{sub}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Zone dispatch ── */}
      <div>
        <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400">派遣到空間</p>
        <div className="space-y-2">
          {zones.map((zone) => {
            const meta = ZONE_META[zone.id];
            const sensor = sensors.find((s) => s.zoneId === zone.id);
            const riskColor =
              zone.riskLevel === 'high'
                ? 'border-rose-200 bg-rose-50'
                : zone.riskLevel === 'medium'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-white';
            const btnColor =
              zone.riskLevel === 'high'
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : zone.riskLevel === 'medium'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-teal-600 hover:bg-teal-700 text-white';

            return (
              <div key={zone.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${riskColor}`}>
                <span className="text-xl">{meta?.emoji ?? '📍'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800">{zone.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-black ${
                      zone.riskLevel === 'high' ? 'text-rose-600' :
                      zone.riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {zone.riskLevel === 'high' ? '⚠ 高風險' : zone.riskLevel === 'medium' ? '• 注意' : '✓ 正常'}
                    </span>
                    {sensor?.connected && sensor.temp !== null && (
                      <span className="text-[10px] text-slate-400 tabular-nums">{sensor.temp.toFixed(1)}°C · {sensor.hum}%</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => dispatchToZone(zone)}
                  disabled={busy}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all active:scale-95 disabled:opacity-50 ${btnColor}`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  派遣
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hardware event log ── */}
      <div>
        <button
          onClick={() => setLogOpen((v) => !v)}
          className="flex w-full items-center justify-between py-3 text-sm font-black text-slate-500 hover:text-slate-800 transition-colors"
        >
          <span>硬體紀錄{state.hardwareEvents.length > 0 ? ` (${state.hardwareEvents.length})` : ''}</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${logOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {logOpen && (
            <motion.div
              initial={{height: 0, opacity: 0}}
              animate={{height: 'auto', opacity: 1}}
              exit={{height: 0, opacity: 0}}
              transition={{duration: 0.2}}
              className="overflow-hidden"
            >
              <div className="space-y-2 pb-2">
                {state.hardwareEvents.length === 0 && (
                  <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">尚無硬體事件</p>
                )}
                {state.hardwareEvents.slice(0, 10).map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-800" title={event.command}>
                        {QUICK_CMDS.find((c) => c.cmd === event.command)?.label ?? event.command}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        event.status === 'sent' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {event.status === 'sent' ? '已送出' : '備援'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">{event.source} · {event.createdAt}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Refresh button helper (exported for header use) ────────────────────────────
export const BridgeRefreshButton = memo(function BridgeRefreshButton({onClick}: {onClick: () => void}) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-200 hover:text-teal-700"
      title="重新偵測連線"
    >
      <RefreshCw className="h-4 w-4" />
    </button>
  );
});

// ── Connection pill (exported for header use) ──────────────────────────────────
export const BridgeStatusPill = memo(function BridgeStatusPill({online, sensorCount}: {online: boolean; sensorCount: number}) {
  return (
    <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black md:flex transition-colors ${
      online
        ? sensorCount > 0
          ? 'border-teal-200 bg-teal-50 text-teal-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-red-200 bg-red-50 text-red-600'
    }`}>
      <span className={`h-2 w-2 rounded-full ${online ? sensorCount > 0 ? 'bg-teal-500 animate-pulse' : 'bg-emerald-500' : 'bg-red-400'}`} />
      {online
        ? sensorCount > 0
          ? `感測器 ${sensorCount} 個在線`
          : '橋接已連線'
        : '橋接離線'}
    </div>
  );
});

// ── Drive controls ──────────────────────────────────
function DriveButton({dir, icon: Icon, active, onStart, onStop}: {
  dir: string;
  icon: typeof ArrowUp;
  active: boolean;
  onStart: (dir: string) => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      title={dir}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onStart(dir);
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onPointerLeave={onStop}
      className={[
        'flex h-10 w-10 items-center justify-center rounded-xl border transition-all active:scale-95',
        active
          ? 'border-teal-500 bg-teal-600 text-white shadow-sm shadow-teal-200'
          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700',
      ].join(' ')}
      style={{touchAction: 'none'}}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const DRIVE_DOCK_EXPANDED_KEY = 'guardian-drive-dock-expanded';

export function GuardianDriveDock({bridgeOnline}: {bridgeOnline: boolean}) {
  const [driveActive, setDriveActive] = useState<string | null>(null);
  const [driveSpeed, setDriveSpeed] = useState(180);
  const [lastResult, setLastResult] = useState<{ok: boolean; text: string}>({
    ok: true,
    text: '底盤待命',
  });
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DRIVE_DOCK_EXPANDED_KEY) === '1';
  });
  const speedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DRIVE_DOCK_EXPANDED_KEY, expanded ? '1' : '0');
  }, [expanded]);

  const sendDrive = async (cmd: string, announce = true) => {
    const result = await sendGuardianDriveCommand(cmd);
    if (announce || !result.ok) {
      const label = DRIVE_LABELS[cmd] ?? (cmd.startsWith('SPEED:') ? '速度' : cmd);
      setLastResult({
        ok: result.ok,
        text: result.ok ? `${label} 已送出` : result.message,
      });
    }
    return result;
  };

  const startDrive = (dir: string) => {
    activeRef.current = dir;
    setDriveActive(dir);
    void sendDrive(dir);
  };

  const stopDrive = () => {
    if (!activeRef.current) return;
    activeRef.current = null;
    setDriveActive(null);
    void sendDrive('STOP');
  };

  const setSpeed = (value: number, announce = false) => {
    setDriveSpeed(value);
    if (speedTimer.current) clearTimeout(speedTimer.current);
    speedTimer.current = setTimeout(() => {
      void sendDrive(`SPEED:${value}`, announce);
    }, 120);
  };

  useEffect(() => {
    void sendDrive(`SPEED:${driveSpeed}`, false);
    return () => {
      if (speedTimer.current) clearTimeout(speedTimer.current);
      void sendGuardianDriveCommand('STOP').catch(() => {});
    };
  }, []);

  // Heartbeat: keep firmware watchdog alive while a drive command is active.
  useEffect(() => {
    if (!driveActive || driveActive === 'STOP') return;
    const id = setInterval(() => {
      void sendGuardianDriveCommand('HEARTBEAT').catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [driveActive]);

  useEffect(() => {
    const commandForKey: Record<string, string> = {
      ArrowUp: 'FORWARD',
      ArrowDown: 'BACKWARD',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
    };
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return Boolean(el?.closest('input, textarea, select, [contenteditable="true"]'));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const command = commandForKey[event.key];
      if (!command || activeRef.current === command) return;
      event.preventDefault();
      startDrive(command);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!commandForKey[event.key]) return;
      event.preventDefault();
      stopDrive();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', stopDrive);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', stopDrive);
    };
  }, []);

  const emergencyStop = () => {
    activeRef.current = null;
    setDriveActive(null);
    void sendDrive('STOP');
  };

  const statusText = driveActive ? DRIVE_LABELS[driveActive] : (!bridgeOnline && !lastResult.ok) ? '本機模式・未連接裝置' : lastResult.text;

  return (
    <div className="fixed inset-x-0 bottom-0 z-35 border-t border-slate-200/80 bg-white/95 shadow-[0_-12px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="guardian-drive-dock-panel"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-1 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bridgeOnline ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">巡邏底盤</p>
              <p className="truncate text-xs font-black text-slate-900">{statusText}</p>
            </div>
            <span className={`hidden rounded-full px-2 py-0.5 text-[9px] font-black sm:inline-flex ${lastResult.ok ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}>
              {bridgeOnline ? '橋接' : '備援'}
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </span>
          </button>
          <button
            type="button"
            onPointerDown={emergencyStop}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-rose-500 px-2.5 text-[11px] font-black text-white shadow-sm transition hover:bg-rose-600 active:scale-95"
            title="立即停止"
            style={{touchAction: 'none'}}
          >
            <Square className="h-3 w-3" />
            停止
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id="guardian-drive-dock-panel"
              key="panel"
              initial={{height: 0, opacity: 0}}
              animate={{height: 'auto', opacity: 1}}
              exit={{height: 0, opacity: 0}}
              transition={{duration: 0.22, ease: 'easeOut'}}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-2.5 lg:flex-nowrap">
                {/* D-Pad */}
                <div className="grid grid-cols-3 gap-1 shrink-0 select-none" style={{touchAction: 'none'}}>
                  <div />
                  <DriveButton dir="FORWARD" icon={ArrowUp} active={driveActive === 'FORWARD'} onStart={startDrive} onStop={stopDrive} />
                  <div />
                  <DriveButton dir="LEFT" icon={ArrowLeft} active={driveActive === 'LEFT'} onStart={startDrive} onStop={stopDrive} />
                  <button
                    type="button"
                    onPointerDown={emergencyStop}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                    title="立即停止"
                    style={{touchAction: 'none'}}
                  >
                    <Square className="h-4 w-4" />
                  </button>
                  <DriveButton dir="RIGHT" icon={ArrowRight} active={driveActive === 'RIGHT'} onStart={startDrive} onStop={stopDrive} />
                  <div />
                  <DriveButton dir="BACKWARD" icon={ArrowDown} active={driveActive === 'BACKWARD'} onStart={startDrive} onStop={stopDrive} />
                  <div />
                </div>

                {/* Speed + quick actions */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-500">
                    <span>速度</span>
                    <span className="tabular-nums text-slate-900">{driveSpeed}</span>
                  </div>
                  <input
                    type="range"
                    min={70}
                    max={255}
                    value={driveSpeed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-teal-600"
                  />
                  <div className="flex gap-1.5">
                    {SPEED_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setSpeed(preset.value, true)}
                        className={`h-7 flex-1 rounded-lg border text-[10px] font-black transition active:scale-95 ${
                          driveSpeed === preset.value
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-200 hover:bg-teal-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void sendDrive('PATROL_START')}
                      className="h-7 flex-1 rounded-lg border border-teal-600 bg-teal-600 px-2 text-[10px] font-black text-white transition hover:bg-teal-700 active:scale-95"
                    >
                      巡邏
                    </button>
                  </div>
                </div>

                {/* EV3 / SPIKE Prime */}
                <div className="w-full border-t border-slate-100 pt-2.5 lg:w-auto lg:border-t-0 lg:pt-0 lg:border-l lg:pl-3">
                  <ExternalRobotPanel />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
