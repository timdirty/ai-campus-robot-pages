import {memo} from 'react';
import {Droplets, Sun, Thermometer} from 'lucide-react';
import type {ZoneSensorReading} from '../types';

interface ZoneSensorPanelProps {
  sensor: ZoneSensorReading;
}

function tempColor(t: number): string {
  if (t >= 35) return 'text-red-600';
  if (t >= 30) return 'text-orange-500';
  if (t >= 26) return 'text-amber-500';
  if (t >= 22) return 'text-emerald-600';
  return 'text-sky-500';
}

function tempBg(t: number): string {
  if (t >= 35) return 'bg-red-50 border-red-200';
  if (t >= 30) return 'bg-orange-50 border-orange-200';
  if (t >= 26) return 'bg-amber-50 border-amber-200';
  if (t >= 22) return 'bg-emerald-50 border-emerald-200';
  return 'bg-sky-50 border-sky-200';
}

function humColor(h: number): string {
  if (h >= 80) return '#3b82f6'; // blue-500
  if (h >= 60) return '#10b981'; // emerald-500
  if (h >= 40) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500 (very dry)
}

function humLabel(h: number): string {
  if (h >= 80) return '潮濕';
  if (h >= 60) return '適中';
  if (h >= 40) return '乾燥';
  return '極乾';
}

function lightLabel(l: number): string {
  if (l >= 700) return '強光';
  if (l >= 400) return '適中';
  if (l >= 150) return '偏暗';
  return '昏暗';
}

function lightColor(l: number): string {
  if (l >= 700) return 'bg-yellow-400';
  if (l >= 400) return 'bg-amber-300';
  if (l >= 150) return 'bg-slate-400';
  return 'bg-slate-300';
}

// SVG arc for humidity gauge
function HumidityArc({value}: {value: number}) {
  const clamp = Math.max(0, Math.min(100, value));
  const cx = 44;
  const cy = 44;
  const r = 36;
  const startAngle = 210;
  const sweepAngle = 120;
  const endAngle = startAngle + sweepAngle * (clamp / 100);

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = sweepAngle * (clamp / 100) > 180 ? 1 : 0;

  const bx1 = cx + r * Math.cos(toRad(startAngle));
  const by1 = cy + r * Math.sin(toRad(startAngle));
  const bx2 = cx + r * Math.cos(toRad(startAngle + sweepAngle));
  const by2 = cy + r * Math.sin(toRad(startAngle + sweepAngle));

  const color = humColor(clamp);

  return (
    <svg viewBox="0 0 88 88" className="h-20 w-20">
      {/* background track */}
      <path
        d={`M ${bx1} ${by1} A ${r} ${r} 0 1 1 ${bx2} ${by2}`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* value arc */}
      {clamp > 0 && (
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
        />
      )}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>
        {clamp}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#64748b">
        %
      </text>
    </svg>
  );
}

export const ZoneSensorPanel = memo(function ZoneSensorPanel({sensor}: ZoneSensorPanelProps) {
  if (!sensor.connected) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <p className="text-xs font-black text-slate-400">感測器未連線</p>
        {sensor.portPath && (
          <p className="mt-1 text-[10px] text-slate-400 font-mono">{sensor.portPath}</p>
        )}
      </div>
    );
  }

  const rawTemp = sensor.temp;
  const rawHum = sensor.hum;
  const rawLight = sensor.light;
  const temp = rawTemp !== null && isFinite(rawTemp) ? Math.max(-10, Math.min(60, rawTemp)) : null;
  const hum = rawHum !== null && isFinite(rawHum) ? Math.max(0, Math.min(100, rawHum)) : null;
  const light = rawLight !== null && isFinite(rawLight) ? Math.max(0, Math.min(1023, rawLight)) : null;
  const lightPct = light !== null ? Math.round((light / 1023) * 100) : null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-black text-slate-500">即時感測</p>

      {/* Temperature */}
      {temp !== null && (
        <div className={`flex items-center gap-3 rounded-xl border p-3 ${tempBg(temp)}`}>
          <Thermometer className={`h-5 w-5 shrink-0 ${tempColor(temp)}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-500">溫度</p>
            <p className={`text-2xl font-black leading-none ${tempColor(temp)}`}>
              {temp.toFixed(1)}<span className="text-base ml-0.5">°C</span>
            </p>
          </div>
          {temp >= 30 && (
            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">偏熱</span>
          )}
        </div>
      )}

      {/* Humidity */}
      {hum !== null && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <Droplets className="h-5 w-5 shrink-0 text-sky-500" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-500">濕度 · {humLabel(hum)}</p>
            <HumidityArc value={hum} />
          </div>
        </div>
      )}

      {/* Light */}
      {light !== null && lightPct !== null && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-400" />
              <p className="text-[10px] font-black text-slate-500">光照 · {lightLabel(light)}</p>
            </div>
            <span className="text-xs font-black text-slate-600">{light}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${lightColor(light)}`}
              style={{width: `${lightPct}%`}}
            />
          </div>
          {light < 150 && (
            <p className="mt-1 text-[10px] font-black text-slate-400">光線不足，建議檢查照明</p>
          )}
        </div>
      )}

      {temp === null && hum === null && light === null && (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs font-black text-slate-400 text-center">感測器暫無數據</p>
      )}
      {(() => { const d = new Date(sensor.updatedAt); return isNaN(d.getTime()) ? null : <p className="text-[9px] text-slate-400 text-right">更新 {d.toLocaleTimeString('zh-TW', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}</p>; })()}
    </div>
  );
});
