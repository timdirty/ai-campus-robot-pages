// 校園服務機器人「手動遙控中心」
// 跟 App 3 那種「永遠掛在底部的可收折 D-pad 抽屜」風格刻意區隔：
// - 平常隱藏，靠右下浮動「遙控」FAB 召喚
// - 打開後是 BottomSheet 全寬面板，主控制是「虛擬搖桿」(analog joystick)
//   不是按鈕陣列；放手回中央自動 STOP
// - 滾筒區獨立卡片，包含開/關、正反向、速度，跟底盤分開操作
import {useEffect, useRef, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Bot, Cable, Gamepad2, Power, RefreshCw, Sparkles, Square} from 'lucide-react';
import {BottomSheet} from './ui';
import {getHardwareHealth, sendHardwareCommand, type HardwareHealthResult} from '../services/hardwareBridge';
import {ExternalRobotPanel} from './ExternalRobotPanel';

const STORAGE_KEY = 'app2-remote-prefs';
const JOY_SIZE = 240; // 直徑 (px)
const JOY_DEAD_ZONE = 28; // 從中心起的死區半徑，內部視為 STOP

type DriveCommand = 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT' | 'STOP';

const DRIVE_LABELS: Record<DriveCommand, string> = {
  FORWARD: '前進',
  BACKWARD: '後退',
  LEFT: '左轉',
  RIGHT: '右轉',
  STOP: '停止',
};

interface Prefs {
  driveSpeed: number;
  sweepSpeed: number;
  sweepReversed: boolean;
}

const DEFAULTS: Prefs = {driveSpeed: 90, sweepSpeed: 255, sweepReversed: false};
const OFFLINE_HEALTH: HardwareHealthResult = {
  bridgeOnline: false,
  arduinoConnected: false,
  activePath: null,
  lastError: null,
  message: '尚未檢查硬體連線',
};

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      driveSpeed: clamp(Number(parsed.driveSpeed) || DEFAULTS.driveSpeed, 70, 255),
      sweepSpeed: clamp(Number(parsed.sweepSpeed) || DEFAULTS.sweepSpeed, 180, 255),
      sweepReversed: Boolean(parsed.sweepReversed),
    };
  } catch {
    return DEFAULTS;
  }
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

function vectorToCommand(dx: number, dy: number): DriveCommand {
  const distance = Math.hypot(dx, dy);
  if (distance < JOY_DEAD_ZONE) return 'STOP';
  // 螢幕座標：dy 正向是「下」→ 翻轉成「往上是前進」
  const upY = -dy;
  if (Math.abs(upY) >= Math.abs(dx)) {
    return upY > 0 ? 'FORWARD' : 'BACKWARD';
  }
  return dx > 0 ? 'RIGHT' : 'LEFT';
}

export function RemoteControlFab({onOpen}: {onOpen: () => void}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="開啟手動遙控"
      className="fixed bottom-30 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-white shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 active:scale-95 md:bottom-6 md:right-6"
    >
      <Gamepad2 className="h-5 w-5" />
      <span className="text-sm font-black tracking-wide">手動遙控</span>
    </button>
  );
}

export function RemoteControlPanel({isOpen, onClose}: {isOpen: boolean; onClose: () => void}) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [hardwareHealth, setHardwareHealth] = useState<HardwareHealthResult>(OFFLINE_HEALTH);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [activeCommand, setActiveCommand] = useState<DriveCommand>('STOP');
  const [knobOffset, setKnobOffset] = useState({x: 0, y: 0});
  const [lastResult, setLastResult] = useState<{ok: boolean; text: string}>({ok: true, text: '待機中'});
  const [chassisTesting, setChassisTesting] = useState(false);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lastSentRef = useRef<DriveCommand>('STOP');
  const driveSpeedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sweepSpeedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 持久化偏好
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const refreshHardwareHealth = async () => {
    const health = await getHardwareHealth();
    setHardwareHealth(health);
    return health;
  };

  // 橋接 / Arduino health 輪詢
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const ping = async () => {
      const health = await getHardwareHealth();
      if (!cancelled) setHardwareHealth(health);
    };
    void ping();
    const id = setInterval(ping, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isOpen]);

  // 開啟時對齊速度給 firmware
  useEffect(() => {
    if (!isOpen) return;
    void send(`WHEEL_SPEED:${prefs.driveSpeed}`, false);
    void send(`BLADE_SPEED:${prefs.sweepSpeed}`, false);
    return () => {
      // 關閉時保證馬達停止
      void sendHardwareCommand('STOP', 'app2:remote-close').catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Heartbeat: keep firmware watchdog alive while joystick is held active.
  useEffect(() => {
    if (!isOpen || activeCommand === 'STOP') return;
    const id = setInterval(() => {
      void sendHardwareCommand('HEARTBEAT', 'app2:heartbeat').catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, activeCommand]);

  const send = async (cmd: string, announce = true): Promise<void> => {
    const result = await sendHardwareCommand(cmd, 'app2:remote');
    if (announce || !result.ok) {
      setLastResult({
        ok: result.ok,
        text: result.ok ? `${prettifyCommand(cmd)} ${result.simulated ? '已離線記錄' : '已送出'}` : result.message,
      });
    }
  };

  const testChassis = async () => {
    if (chassisTesting) return;
    setChassisTesting(true);
    const health = await refreshHardwareHealth();
    const simulated = !health.bridgeOnline || !health.arduinoConnected;

    setLastResult({ok: true, text: simulated ? '底盤校驗：指令已記錄' : '底盤校驗：短暫前進中'});
    try {
      const speed = await sendHardwareCommand(`WHEEL_SPEED:${Math.max(100, prefs.driveSpeed)}`, 'app2:chassis-test');
      if (!speed.ok) throw new Error(speed.message);
      const test = await sendHardwareCommand('CHASSIS_TEST', 'app2:chassis-test');
      if (!test.ok) throw new Error(test.message);
      setLastResult({ok: true, text: test.simulated || speed.simulated ? '底盤校驗完成：指令已記錄' : '底盤校驗完成：已停止'});
      await refreshHardwareHealth();
    } catch (error) {
      await sendHardwareCommand('STOP', 'app2:chassis-test-cleanup').catch(() => {});
      setLastResult({ok: false, text: error instanceof Error ? error.message : '底盤校驗失敗'});
    } finally {
      setChassisTesting(false);
    }
  };

  // ── Joystick 拖曳處理 ────────────────────────────────────────────────────
  const updateJoystick = (clientX: number, clientY: number) => {
    const root = joystickRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const distance = Math.hypot(dx, dy);
    const maxRadius = rect.width / 2 - 24;
    if (distance > maxRadius) {
      const ratio = maxRadius / distance;
      dx *= ratio;
      dy *= ratio;
    }
    setKnobOffset({x: dx, y: dy});
    const command = vectorToCommand(dx, dy);
    setActiveCommand(command);
    if (command !== lastSentRef.current) {
      lastSentRef.current = command;
      void send(command);
    }
  };

  const releaseJoystick = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setKnobOffset({x: 0, y: 0});
    setActiveCommand('STOP');
    if (lastSentRef.current !== 'STOP') {
      lastSentRef.current = 'STOP';
      void send('STOP');
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    updateJoystick(event.clientX, event.clientY);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateJoystick(event.clientX, event.clientY);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    releaseJoystick();
  };

  // ── 速度 / 滾筒 ─────────────────────────────────────────────────────────
  const setDriveSpeed = (value: number) => {
    setPrefs((prev) => ({...prev, driveSpeed: value}));
    if (driveSpeedTimer.current) clearTimeout(driveSpeedTimer.current);
    driveSpeedTimer.current = setTimeout(() => {
      void send(`WHEEL_SPEED:${value}`, false);
    }, 120);
  };

  const setSweepSpeed = (value: number) => {
    setPrefs((prev) => ({...prev, sweepSpeed: value}));
    if (sweepSpeedTimer.current) clearTimeout(sweepSpeedTimer.current);
    sweepSpeedTimer.current = setTimeout(() => {
      void send(`BLADE_SPEED:${value}`, false);
    }, 120);
  };

  const toggleSweep = () => {
    const next = !sweepRunning;
    setSweepRunning(next);
    void send(next ? 'BLADES_START' : 'BLADES_STOP');
  };

  const reverseSweep = () => {
    setPrefs((prev) => ({...prev, sweepReversed: !prev.sweepReversed}));
    void send('BLADES_REVERSE');
  };

  const testBlades = async () => {
    setLastResult({ok: true, text: '葉片校驗：M3/M4 滿速直驅中'});
    try {
      const m3 = await sendHardwareCommand('M3_FWD', 'app2:blades-test');
      if (!m3.ok) throw new Error(m3.message);
      const m4 = await sendHardwareCommand('M4_FWD', 'app2:blades-test');
      if (!m4.ok) throw new Error(m4.message);
      await new Promise((resolve) => setTimeout(resolve, 800));
      const m3Back = await sendHardwareCommand('M3_BACK', 'app2:blades-test');
      if (!m3Back.ok) throw new Error(m3Back.message);
      const m4Back = await sendHardwareCommand('M4_BACK', 'app2:blades-test');
      if (!m4Back.ok) throw new Error(m4Back.message);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await sendHardwareCommand('M3_OFF', 'app2:blades-test-cleanup');
      await sendHardwareCommand('M4_OFF', 'app2:blades-test-cleanup');
      const simulated = m3.simulated || m4.simulated || m3Back.simulated || m4Back.simulated;
      setLastResult({ok: true, text: simulated ? '葉片校驗完成：指令已記錄' : '葉片校驗完成：M3/M4 已停止'});
    } catch (error) {
      await sendHardwareCommand('M3_OFF', 'app2:blades-test-cleanup').catch(() => {});
      await sendHardwareCommand('M4_OFF', 'app2:blades-test-cleanup').catch(() => {});
      setLastResult({ok: false, text: error instanceof Error ? error.message : '葉片校驗失敗'});
    }
  };

  const emergencyStop = () => {
    releaseJoystick();
    setSweepRunning(false);
    void send('STOP');
    void sendHardwareCommand('BLADES_STOP', 'app2:remote-emergency');
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="手動遙控中心">
      <div className="flex flex-col gap-5 p-4 pb-8 sm:p-5">
        {/* 狀態列 */}
        <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-low/60 p-3 sm:flex-row sm:items-center">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${hardwareHealth.arduinoConnected ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">當前指令</p>
            <p className="min-w-0 text-base font-black text-on-surface sm:truncate">
              {DRIVE_LABELS[activeCommand]}
              <span className="ml-2 break-words text-xs font-bold text-on-surface-variant">{lastResult.text}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={testChassis}
            disabled={chassisTesting}
            className={`flex min-h-11 w-full shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left transition active:scale-95 disabled:opacity-70 sm:w-auto ${
              hardwareHealth.arduinoConnected
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15'
                : hardwareHealth.bridgeOnline
                  ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100'
                  : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100'
            }`}
            title={hardwareHealth.activePath ?? hardwareHealth.lastError ?? hardwareHealth.message}
          >
            {chassisTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-black">
                {hardwareHealth.arduinoConnected ? 'Arduino 已連線' : hardwareHealth.bridgeOnline ? '等待 Arduino' : 'Bridge 離線'}
              </span>
              <span className="max-w-36 truncate text-[10px] font-bold opacity-75">
                {chassisTesting ? '底盤校驗中...' : hardwareHealth.arduinoConnected ? '點我校驗底盤' : '點我重新檢查'}
              </span>
            </span>
          </button>
        </div>

        {/* Joystick + Sweeper 雙欄 */}
        <div className="grid grid-cols-1 gap-5 min-[680px]:grid-cols-[minmax(220px,260px)_minmax(260px,1fr)] min-[680px]:items-start">
          {/* Virtual joystick */}
          <div className="flex min-w-0 flex-col items-center gap-3 justify-self-center">
            <div
              ref={joystickRef}
              role="application"
              aria-label="虛擬搖桿"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative grid aspect-square w-[min(72vw,240px)] place-items-center rounded-full border-4 border-outline-variant/30 bg-linear-to-br from-surface-container-low to-surface-container-high shadow-inner"
              style={{touchAction: 'none'}}
            >
              {/* 軸標示 */}
              <span className="pointer-events-none absolute top-3 text-[10px] font-black tracking-widest text-on-surface-variant/60">前</span>
              <span className="pointer-events-none absolute bottom-3 text-[10px] font-black tracking-widest text-on-surface-variant/60">後</span>
              <span className="pointer-events-none absolute left-3 text-[10px] font-black tracking-widest text-on-surface-variant/60">左</span>
              <span className="pointer-events-none absolute right-3 text-[10px] font-black tracking-widest text-on-surface-variant/60">右</span>
              {/* 死區圈 */}
              <div className="pointer-events-none absolute h-14 w-14 rounded-full border border-dashed border-outline-variant/40" />
              {/* Knob */}
              <motion.div
                animate={{x: knobOffset.x, y: knobOffset.y}}
                transition={{type: 'spring', damping: 30, stiffness: 600, mass: 0.4}}
                className={`pointer-events-none flex h-20 w-20 items-center justify-center rounded-full shadow-lg ${
                  activeCommand === 'STOP' ? 'bg-surface-container-highest text-on-surface' : 'bg-primary text-white'
                }`}
              >
                <span className="text-xs font-black tracking-wider">{DRIVE_LABELS[activeCommand]}</span>
              </motion.div>
            </div>
            <p className="text-[11px] font-bold text-on-surface-variant">放開 = 自動 STOP</p>
          </div>

          {/* 控制側欄 */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* 底盤速度 */}
            <div className="space-y-2 rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4">
              <div className="flex items-center justify-between text-xs font-black text-on-surface-variant">
                <span>底盤速度</span>
                <span className="tabular-nums text-on-surface">{prefs.driveSpeed} / 255</span>
              </div>
              <input
                type="range"
                min={60}
                max={255}
                value={prefs.driveSpeed}
                onChange={(event) => setDriveSpeed(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-primary"
              />
            </div>

            {/* 前方掃地葉片 */}
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
                  <Sparkles className="h-3.5 w-3.5" />
                  前方掃地葉片
                </span>
                <span className="tabular-nums text-xs font-bold text-emerald-900/80">{prefs.sweepSpeed} / 255</span>
              </div>
              <input
                type="range"
                min={180}
                max={255}
                value={prefs.sweepSpeed}
                onChange={(event) => setSweepSpeed(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-emerald-500"
              />
              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
                <button
                  type="button"
                  onClick={toggleSweep}
                  className={`flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black leading-none transition active:scale-95 sm:gap-2 sm:text-sm ${
                    sweepRunning
                      ? 'bg-emerald-500 text-white shadow-md hover:bg-emerald-600'
                      : 'bg-surface-container-lowest text-on-surface ring-1 ring-outline-variant/40 hover:ring-emerald-300'
                  }`}
                >
                  <Power className="h-4 w-4" />
                  {sweepRunning ? '葉片運轉中' : '啟動葉片'}
                </button>
                <button
                  type="button"
                  onClick={reverseSweep}
                  className={`flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black leading-none transition active:scale-95 sm:gap-2 sm:text-sm ${
                    prefs.sweepReversed
                      ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                      : 'bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant/40 hover:ring-emerald-300'
                  }`}
                  title="切換葉片旋轉方向（吸入 ↔ 推出）"
                >
                  <RefreshCw className="h-4 w-4" />
                  {prefs.sweepReversed ? '反向旋轉' : '正向旋轉'}
                </button>
                <button
                  type="button"
                  onClick={testBlades}
                  className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-surface-container-lowest px-2 text-xs font-black leading-none text-on-surface-variant ring-1 ring-outline-variant/40 transition hover:ring-emerald-300 active:scale-95 sm:gap-2 sm:text-sm"
                  title="滿速短暫校驗 M3/M4 葉片"
                >
                  <Sparkles className="h-4 w-4" />
                  校驗葉片
                </button>
              </div>
            </div>

            {/* EV3 / SPIKE 外部機器人 */}
            <ExternalRobotPanel />

            {/* 緊急停止 */}
            <button
              type="button"
              onPointerDown={emergencyStop}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-rose-500 text-base font-black text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-600 active:scale-95"
              style={{touchAction: 'none'}}
            >
              <Square className="h-5 w-5" />
              緊急全停
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

function prettifyCommand(cmd: string): string {
  if (cmd in DRIVE_LABELS) return DRIVE_LABELS[cmd as DriveCommand];
  if (cmd.startsWith('SPEED:') || cmd.startsWith('WHEEL_SPEED:')) return '後輪速度';
  if (cmd.startsWith('SWEEP_SPEED:') || cmd.startsWith('BLADE_SPEED:')) return '葉片速度';
  switch (cmd) {
    case 'SWEEP_START': return '啟動滾筒';
    case 'SWEEP_STOP': return '停止滾筒';
    case 'SWEEP_REVERSE': return '滾筒反向';
    case 'BLADES_START': return '啟動葉片';
    case 'BLADES_STOP': return '停止葉片';
    case 'BLADES_REVERSE': return '葉片反向';
    case 'CHASSIS_TEST': return '底盤校驗';
    default: return cmd;
  }
}

// 整合元件：FAB + Sheet。直接放在 App.tsx 即可。
export function RemoteControlLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <AnimatePresence>
      <RemoteControlFab onOpen={() => setOpen(true)} />
      <RemoteControlPanel isOpen={open} onClose={() => setOpen(false)} />
    </AnimatePresence>
  );
}

// 平板側邊欄專用按鈕（不浮動）
export function RemoteControlSidebarButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-bold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all"
      >
        <Gamepad2 size={22} />
        <span>手動遙控</span>
      </button>
      <RemoteControlPanel isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
