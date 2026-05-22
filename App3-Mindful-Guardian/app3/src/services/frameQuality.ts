export interface FrameQualityMetrics {
  brightness: number;
  contrast: number;
  edgeDensity: number;
  darkArea: number;
  brightArea: number;
}

export interface FrameQualityResult {
  level: 'good' | 'warn' | 'poor';
  label: string;
  hints: string[];
  metrics: FrameQualityMetrics;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function analyzeFrameQuality(width: number, height: number, data: Uint8ClampedArray | number[]): FrameQualityResult {
  const step = 4;
  let lumaTotal = 0;
  let contrastTotal = 0;
  let edgeTotal = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let samples = 0;
  const lumaAt = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return 0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
  };
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const luma = lumaAt(x, y);
      const right = x + step < width ? lumaAt(x + step, y) : luma;
      const down = y + step < height ? lumaAt(x, y + step) : luma;
      lumaTotal += luma;
      contrastTotal += Math.abs(luma - 128);
      edgeTotal += Math.abs(luma - right) + Math.abs(luma - down);
      if (luma < 48) darkPixels += 1;
      if (luma > 238) brightPixels += 1;
      samples += 1;
    }
  }
  const metrics = {
    brightness: clamp((lumaTotal / Math.max(1, samples) / 255) * 100),
    contrast: clamp((contrastTotal / Math.max(1, samples) / 128) * 100),
    edgeDensity: clamp(edgeTotal / Math.max(1, samples) / 2.2),
    darkArea: clamp((darkPixels / Math.max(1, samples)) * 100),
    brightArea: clamp((brightPixels / Math.max(1, samples)) * 100),
  };
  const hints: string[] = [];
  if (metrics.brightness < 24 || metrics.darkArea > 42) hints.push('光線偏暗，只做環境提醒，不做身分判斷。');
  if (metrics.brightness > 88 || metrics.brightArea > 58) hints.push('畫面過曝，請避開窗邊強光。');
  if (metrics.edgeDensity < 6 && metrics.contrast < 18) hints.push('畫面資訊太少，請對準公共場域而非個人特寫。');
  if (metrics.edgeDensity < 10 && metrics.contrast >= 18) hints.push('畫面可能失焦，請穩住鏡頭再分析。');
  const level = hints.length === 0 ? 'good' : hints.length === 1 ? 'warn' : 'poor';
  return {level, label: level === 'good' ? '畫面品質良好' : level === 'warn' ? '畫面可用但建議調整' : '建議重新拍攝', hints, metrics};
}
