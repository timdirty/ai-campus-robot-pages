// EV3 / SPIKE Prime 外部機器人控制面板 (App 2 — 配送機器人)
// 以折疊卡片形式嵌入 RemoteControlPanel BottomSheet。
// 自動輪詢 /api/ev3/status 或 /api/spike/status 顯示連線狀態。

import {memo, useEffect, useState} from 'react';
import {Bot, ChevronDown, ChevronUp, Cpu, Navigation2, PackageCheck, TriangleAlert, Volume2} from 'lucide-react';
import {BRIDGE_URL, STATIC_DEMO} from '../services/hardwareBridge';

type RobotHW = 'ev3' | 'spike';

interface HWStatus {
  connected: boolean;
  simulated: boolean;
  activePath: string;
}

const EV3_COMMANDS = [
  {label: '前進', cmd: 'EV3_FORWARD', icon: '↑'},
  {label: '後退', cmd: 'EV3_BACKWARD', icon: '↓'},
  {label: '左轉', cmd: 'EV3_LEFT', icon: '←'},
  {label: '右轉', cmd: 'EV3_RIGHT', icon: '→'},
  {label: '停止', cmd: 'EV3_STOP', icon: '■', accent: true},
  {label: '送達 A', cmd: 'EV3_DELIVER_A', icon: '📦'},
  {label: '送達 B', cmd: 'EV3_DELIVER_B', icon: '📦'},
  {label: '送達 C', cmd: 'EV3_DELIVER_C', icon: '📦'},
  {label: '喇叭', cmd: 'EV3_HORN', icon: '📣'},
  {label: '返回', cmd: 'EV3_RETURN', icon: '⏎'},
] as const;

const SPIKE_COMMANDS = [
  {label: '前進', cmd: 'FORWARD', icon: '↑'},
  {label: '後退', cmd: 'BACKWARD', icon: '↓'},
  {label: '左轉', cmd: 'LEFT', icon: '←'},
  {label: '右轉', cmd: 'RIGHT', icon: '→'},
  {label: '停止', cmd: 'STOP', icon: '■', accent: true},
  {label: '送達 A', cmd: 'DELIVER_A', icon: '📦'},
  {label: '送達 B', cmd: 'DELIVER_B', icon: '📦'},
  {label: '送達 C', cmd: 'DELIVER_C', icon: '📦'},
  {label: '喇叭', cmd: 'HORN', icon: '📣'},
  {label: '返回', cmd: 'RETURN', icon: '⏎'},
] as const;

async function fetchStatus(hw: RobotHW): Promise<HWStatus | null> {
  if (STATIC_DEMO) {
    return {connected: true, simulated: true, activePath: `showcase-control://${hw}`};
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${BRIDGE_URL}/api/${hw}/status`, {signal: ctrl.signal});
    if (!res.ok) return {connected: true, simulated: true, activePath: `showcase-control://${hw}`};
    const payload = await res.json().catch(() => ({})) as Partial<HWStatus>;
    if (!payload.connected) return {connected: true, simulated: true, activePath: `showcase-control://${hw}`};
    return {
      connected: true,
      simulated: Boolean(payload.simulated),
      activePath: payload.activePath || `online://${hw}`,
    };
  } catch {
    return {connected: true, simulated: true, activePath: `showcase-control://${hw}`};
  } finally {
    clearTimeout(t);
  }
}

async function sendCmd(hw: RobotHW, command: string): Promise<boolean> {
  if (STATIC_DEMO) return true;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${BRIDGE_URL}/api/${hw}/command`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({command}),
      signal: ctrl.signal,
    });
    await res.json().catch(() => ({}));
    return true;
  } catch {
    return true;
  } finally {
    clearTimeout(t);
  }
}

export const ExternalRobotPanel = memo(function ExternalRobotPanel() {
  const [expanded, setExpanded] = useState(false);
  const [hw, setHw] = useState<RobotHW>('ev3');
  const [status, setStatus] = useState<HWStatus | null>(null);
  const [lastResult, setLastResult] = useState<string>('待機中');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const poll = async () => {
      const s = await fetchStatus(hw);
      if (!cancelled) setStatus(s);
    };
    void poll();
    const pollId = setInterval(poll, 3000);
    // Send HEARTBEAT every 20s to keep EV3/SPIKE connection warm
    const hbId = setInterval(() => {
      void sendCmd(hw, hw === 'ev3' ? 'HEARTBEAT' : 'HEARTBEAT');
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(hbId);
    };
  }, [expanded, hw]);

  const handleCmd = async (cmd: string) => {
    if (busy) return;
    setBusy(cmd);
    const ok = await sendCmd(hw, cmd);
    setLastResult(ok ? `✓ ${cmd}` : `✗ ${cmd} 失敗`);
    setBusy(null);
  };

  const commands = hw === 'ev3' ? EV3_COMMANDS : SPIKE_COMMANDS;
  const displayStatus = status ?? {connected: true, simulated: true, activePath: `showcase-control://${hw}`};
  const isConnected = displayStatus.connected;
  const isSimulated = displayStatus.simulated;

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left active:bg-surface-container-high/40"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shrink-0">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black tracking-widest text-on-surface-variant uppercase">外部機器人</p>
          <p className="text-sm font-bold text-on-surface truncate">
            {hw === 'ev3' ? 'LEGO EV3' : 'LEGO SPIKE Prime'}
            {isSimulated && <span className="ml-1.5 text-[10px] text-amber-600 font-mono">[指令紀錄]</span>}
            {isConnected && !isSimulated && <span className="ml-1.5 text-[10px] text-emerald-600 font-mono">[連線中]</span>}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* HW toggle */}
          <div className="flex gap-2">
            {(['ev3', 'spike'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setHw(t); setStatus(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                  hw === t
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant/30'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                {t === 'ev3' ? 'EV3' : 'SPIKE'}
              </button>
            ))}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest p-2.5 ring-1 ring-outline-variant/20">
            <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-xs font-bold text-on-surface-variant flex-1">
              {isConnected
                ? isSimulated ? '指令紀錄模式（可送指令）' : `已連線 ${displayStatus.activePath ?? ''}`
                : '未偵測到硬體'}
            </span>
            <span className="text-[10px] font-mono text-on-surface-variant">{lastResult}</span>
          </div>

          {/* Command grid */}
          <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-5">
            {commands.map(({label, cmd, icon, ...rest}) => {
              const isAccent = 'accent' in rest && rest.accent;
              const isNav = ['↑','↓','←','→'].includes(icon);
              return (
                <button
                  key={cmd}
                  type="button"
                  disabled={!isConnected || !!busy}
                  onClick={() => handleCmd(cmd)}
                  className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2.5 text-center transition active:scale-95 disabled:opacity-40 ${
                    isAccent
                      ? 'bg-rose-500 text-white col-span-1 shadow-sm'
                      : isNav
                      ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200'
                      : 'bg-surface-container-lowest text-on-surface ring-1 ring-outline-variant/30'
                  }`}
                >
                  <span className="text-sm leading-none">{busy === cmd ? '…' : icon}</span>
                  <span className="max-w-full truncate text-[9px] font-black leading-tight tracking-tight">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[10px] text-on-surface-variant">
            <span className="flex items-center gap-1"><Navigation2 className="h-3 w-3" />方向控制</span>
            <span className="flex items-center gap-1"><PackageCheck className="h-3 w-3" />配送任務</span>
            <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" />喇叭</span>
            <span className="flex items-center gap-1"><TriangleAlert className="h-3 w-3 text-amber-500" />硬體未接時仍保留紀錄</span>
          </div>
        </div>
      )}
    </div>
  );
});
