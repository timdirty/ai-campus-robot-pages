// EV3 / SPIKE Prime 外部機器人控制面板 (App 3 — 校園心靈守護者)
// 折疊卡片，嵌入 GuardianControlPanel 底部。
// 提供守護巡邏相關指令：巡邏、前往區域、警報、返回、方向控制。

import {memo, useEffect, useState} from 'react';
import {Bot, ChevronDown, ChevronUp, Cpu, MapPin, Navigation2, Siren, TriangleAlert} from 'lucide-react';

const BRIDGE_URL =
  ((import.meta as unknown as {env?: Record<string, string>}).env?.VITE_ARDUINO_BRIDGE_URL) ||
  'http://localhost:3203';

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
  {label: '巡邏', cmd: 'EV3_PATROL', icon: '🔄'},
  {label: '區域 1', cmd: 'EV3_GOTO_ZONE_1', icon: '①'},
  {label: '區域 2', cmd: 'EV3_GOTO_ZONE_2', icon: '②'},
  {label: '區域 3', cmd: 'EV3_GOTO_ZONE_3', icon: '③'},
  {label: '警報', cmd: 'EV3_ALERT', icon: '🚨'},
  {label: '返回', cmd: 'EV3_RETURN', icon: '⏎'},
] as const;

const SPIKE_COMMANDS = [
  {label: '前進', cmd: 'FORWARD', icon: '↑'},
  {label: '後退', cmd: 'BACKWARD', icon: '↓'},
  {label: '左轉', cmd: 'LEFT', icon: '←'},
  {label: '右轉', cmd: 'RIGHT', icon: '→'},
  {label: '停止', cmd: 'STOP', icon: '■', accent: true},
  {label: '巡邏', cmd: 'PATROL', icon: '🔄'},
  {label: '區域 1', cmd: 'GOTO_ZONE_1', icon: '①'},
  {label: '區域 2', cmd: 'GOTO_ZONE_2', icon: '②'},
  {label: '區域 3', cmd: 'GOTO_ZONE_3', icon: '③'},
  {label: '警報', cmd: 'ALERT', icon: '🚨'},
  {label: '返回', cmd: 'RETURN', icon: '⏎'},
] as const;

async function fetchStatus(hw: RobotHW): Promise<HWStatus | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/${hw}/status`, {signal: AbortSignal.timeout(2000)});
    if (!res.ok) return null;
    return res.json() as Promise<HWStatus>;
  } catch {
    return null;
  }
}

async function sendCmd(hw: RobotHW, command: string): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/${hw}/command`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({command}),
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json() as {ok: boolean};
    return data.ok;
  } catch {
    return false;
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
      void sendCmd(hw, 'HEARTBEAT');
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
    setLastResult(ok ? `✓ ${cmd}` : `本機演示 ${cmd}`);
    setBusy(null);
  };

  const commands = hw === 'ev3' ? EV3_COMMANDS : SPIKE_COMMANDS;
  const isConnected = status?.connected ?? false;
  const isSimulated = status?.simulated ?? false;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left active:bg-slate-100"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shrink-0">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">外部機器人</p>
          <p className="text-sm font-bold text-slate-900 truncate">
            {hw === 'ev3' ? 'LEGO EV3' : 'LEGO SPIKE Prime'}
            {isSimulated && <span className="ml-1.5 text-[10px] text-amber-600 font-mono">[SIM]</span>}
            {isConnected && !isSimulated && <span className="ml-1.5 text-[10px] text-emerald-600 font-mono">[連線中]</span>}
            {!isConnected && <span className="ml-1.5 text-[10px] text-amber-600 font-mono">[本機演示]</span>}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {/* HW toggle */}
          <div className="flex gap-2">
            {(['ev3', 'spike'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setHw(t); setStatus(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                  hw === t
                    ? 'bg-violet-600 text-white shadow'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                {t === 'ev3' ? 'EV3' : 'SPIKE'}
              </button>
            ))}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
            <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span className="text-xs font-bold text-slate-500 flex-1">
              {isConnected
                ? isSimulated ? '模擬模式（可送指令）' : `已連線 ${status?.activePath ?? ''}`
                : '未偵測到硬體，已切換本機演示指令'}
            </span>
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[100px]">{lastResult}</span>
          </div>

          {/* Command grid — 4 cols for guardian (11 cmds) */}
          <div className="grid grid-cols-4 gap-1.5">
            {commands.map(({label, cmd, icon, ...rest}) => {
              const isAccent = 'accent' in rest && rest.accent;
              const isNav = ['↑','↓','←','→'].includes(icon);
              const isAlert = cmd.includes('ALERT');
              return (
                <button
                  key={cmd}
                  type="button"
                  disabled={!!busy}
                  onClick={() => handleCmd(cmd)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 text-center transition active:scale-95 disabled:opacity-40 ${
                    isAlert
                      ? 'bg-rose-500 text-white shadow-sm'
                      : isAccent
                      ? 'bg-slate-800 text-white shadow-sm'
                      : isNav
                      ? 'bg-violet-100 text-violet-800 ring-1 ring-violet-200'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  }`}
                >
                  <span className="text-sm leading-none">{busy === cmd ? '…' : icon}</span>
                  <span className="text-[9px] font-black tracking-tight leading-tight">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><Navigation2 className="h-3 w-3" />方向控制</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />前往區域</span>
            <span className="flex items-center gap-1"><Siren className="h-3 w-3" />緊急警報</span>
            <span className="flex items-center gap-1"><TriangleAlert className="h-3 w-3 text-amber-500" />未接硬體也可本機演示</span>
          </div>
        </div>
      )}
    </div>
  );
});
