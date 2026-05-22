import {memo} from 'react';
import type React from 'react';
import type {HardwareSocketStatus} from '../hooks/useHardwareSocket';

interface Props {
  status: HardwareSocketStatus;
}

const BANNER_CLASS =
  'fixed left-3 right-3 top-[4.75rem] z-[55] mx-auto flex min-h-7 max-w-3xl items-center justify-center gap-2 rounded-full px-3 transition-all md:left-[17.25rem] md:right-6 md:top-[4.75rem]';

const GREEN_BAR_CLASS =
  'fixed left-0 right-0 top-[4.25rem] z-[55] h-1 transition-all md:left-65 md:top-18';

const TEXT_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
  letterSpacing: '0.04em',
  textShadow: '0 1px 2px rgba(0,0,0,0.25)',
};

export const HardwareStatusBanner = memo(function HardwareStatusBanner({status}: Props) {
  const {connected, simulated, mode, reconnecting} = status;

  if (connected && !simulated) {
    return (
      <div
        aria-hidden="true"
        className={GREEN_BAR_CLASS}
        style={{backgroundColor: mode === 'ws' ? '#22c55e' : '#86efac'}}
      />
    );
  }

  if (reconnecting) {
    return (
      <div role="status" aria-live="polite" className={BANNER_CLASS} style={{backgroundColor: '#6366f1'}}>
        <span className="truncate" style={TEXT_STYLE}>↺ 正在偵測硬體；所有操作仍保留任務與指令紀錄</span>
      </div>
    );
  }

  const bg = connected ? '#0f766e' : '#2563eb';
  const text = connected
    ? '展示操作模式 · 橋接服務已啟動，接上 Arduino 後自動切換真機'
    : '展示操作模式 · 未接 Arduino 仍可完整操作、辨識與紀錄';

  return (
    <div role="status" aria-live="polite" className={BANNER_CLASS} style={{backgroundColor: bg}}>
      <span className="truncate" style={TEXT_STYLE}>{text}</span>
    </div>
  );
});
