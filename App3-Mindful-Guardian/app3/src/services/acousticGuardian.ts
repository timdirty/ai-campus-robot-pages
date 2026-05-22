import {AcousticLevel} from '../types';

export interface AcousticReading {
  level: AcousticLevel;
  volumeIndex: number;
  volatility: number;
  summary: string;
}

export function analyzeAcousticFrame(timeDomain: Uint8Array, recentVolumes: number[] = []): AcousticReading {
  if (timeDomain.length === 0) {
    return describeAcousticSignal(0, 0);
  }

  const rms = Math.sqrt(
    timeDomain.reduce((total, value) => {
      const normalized = (value - 128) / 128;
      return total + normalized * normalized;
    }, 0) / timeDomain.length,
  );
  const volumeIndex = Math.max(0, Math.min(100, Math.round(rms * 180)));
  const volatility = calculateVolatility([...recentVolumes.slice(-12), volumeIndex]);
  return describeAcousticSignal(volumeIndex, volatility);
}

export function describeAcousticSignal(volumeIndex: number, volatility: number): AcousticReading {
  const level: AcousticLevel = volumeIndex >= 72 || volatility >= 34 ? 'elevated' : volumeIndex >= 46 || volatility >= 20 ? 'active' : 'calm';
  const summary =
    level === 'elevated'
      ? '環境聲量或波動偏高，建議值週老師到場觀察動線與互動狀況。'
      : level === 'active'
        ? '環境聲量有活動感，持續觀察是否回到穩定狀態。'
        : '環境聲量平穩，適合維持一般巡查頻率。';

  return {level, volumeIndex, volatility, summary};
}

function calculateVolatility(values: number[]) {
  if (values.length < 2) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  return Math.max(0, Math.min(100, Math.round(Math.sqrt(variance) * 2.5)));
}
