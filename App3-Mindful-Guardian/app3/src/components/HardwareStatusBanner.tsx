import {memo} from 'react';
import type React from 'react';
import type {HardwareSocketStatus} from '../hooks/useHardwareSocket';

interface Props {
  status: HardwareSocketStatus;
}

const BANNER_BASE: React.CSSProperties = {
  height: 28,
  width: '100%',
  position: 'sticky',
  top: 0,
  zIndex: 60,
  transition: 'all 0.4s ease',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const GREEN_BAR: React.CSSProperties = {
  height: 4,
  width: '100%',
  position: 'sticky',
  top: 0,
  zIndex: 60,
  transition: 'all 0.4s ease',
  flexShrink: 0,
};

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
        style={{...GREEN_BAR, backgroundColor: mode === 'ws' ? '#22c55e' : '#86efac'}}
      />
    );
  }

  if (reconnecting) {
    return (
      <div role="status" aria-live="polite" style={{...BANNER_BASE, backgroundColor: '#6366f1'}}>
        <span style={TEXT_STYLE}>↺ 橋接重連中… 請稍候</span>
      </div>
    );
  }

  const bg = connected ? '#0f766e' : '#334155';
  const text = connected ? '展示備援模式 · 未連接實體 Arduino，AI 判讀與派遣流程仍可完整展示' : '本機展示模式 · 未連接實體 Arduino，Demo 感測器、AI 備援與派遣流程仍可完整展示';

  return (
    <div role="status" aria-live="polite" style={{...BANNER_BASE, backgroundColor: bg}}>
      <span style={TEXT_STYLE}>{text}</span>
    </div>
  );
});
