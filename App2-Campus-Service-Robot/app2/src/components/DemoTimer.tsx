import {useEffect, useRef, useState} from 'react';

const TOTAL = 3 * 60;

export function DemoTimer() {
  const [seconds, setSeconds] = useState(TOTAL);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${mins}:${String(secs).padStart(2, '0')}`;
  const urgent = seconds <= 30 && running;
  const warning = seconds <= 60 && seconds > 30 && running;
  const bg = urgent ? '#ef4444' : warning ? '#f59e0b' : running ? '#22c55e' : '#6b7280';

  const handleClick = () => {
    if (seconds === 0) {
      setSeconds(TOTAL);
      setRunning(false);
    } else {
      setRunning((r) => !r);
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSeconds(TOTAL);
    setRunning(false);
  };

  return (
    <button
      onClick={handleClick}
      title={running ? '點擊暫停' : seconds === TOTAL ? '點擊開始 3 分鐘比賽計時' : '點擊繼續'}
      style={{
        position: 'fixed',
        bottom: 172,
        right: 12,
        zIndex: 9998,
        backgroundColor: bg,
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        padding: '7px 13px',
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: urgent
          ? '0 0 0 3px rgba(239,68,68,0.4), 0 4px 12px rgba(0,0,0,0.2)'
          : '0 4px 12px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        minWidth: 68,
        transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
        animation: urgent ? 'demoTimerPulse 1s ease-in-out infinite' : 'none',
      }}
    >
      <span style={{fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', opacity: 0.88, fontFamily: 'system-ui, sans-serif', lineHeight: 1}}>
        {running ? (urgent ? '⚠ 快結束！' : '比賽計時') : seconds === TOTAL ? '▶ 開始計時' : '⏸ 已暫停'}
      </span>
      <span style={{fontSize: 18, fontFamily: 'ui-monospace, monospace', lineHeight: 1.2}}>{display}</span>
      {seconds < TOTAL && (
        <span
          onClick={handleReset}
          title="重設計時"
          style={{fontSize: 9, opacity: 0.75, lineHeight: 1, fontFamily: 'system-ui, sans-serif', marginTop: 1, textDecoration: 'underline'}}
        >
          ↺ 重設
        </span>
      )}
      <style>{`
        @keyframes demoTimerPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </button>
  );
}
